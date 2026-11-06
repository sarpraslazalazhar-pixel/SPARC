<?php

namespace App\Http\Controllers;

use App\Models\ContentComment;
use App\Models\ContentItem;
use App\Models\ContentWorkflowHistory;
use App\Models\HaloApuConnection;
use App\Models\HaloApuSyncLog;
use App\Models\HaloApuTicket;
use App\Services\HaloApuClientService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HaloApuWebhookController extends Controller
{
    public function __construct(
        protected HaloApuClientService $haloApuService
    ) {}

    /**
     * Handle incoming signed webhook from HaloAPU.
     */
    public function handle(Request $request): JsonResponse
    {
        $conn = HaloApuConnection::current();
        if (! $conn->is_enabled) {
            return response()->json(['message' => 'HaloAPU integration is currently disabled.'], 200);
        }

        $secret = (string) ($conn->webhook_secret ?: config('services.haloapu.webhook_secret', ''));
        $sig = (string) $request->header('X-HaloAPU-Signature', '');
        $expected = 'sha256='.hash_hmac('sha256', $request->getContent(), $secret);

        if (empty($secret) || ! hash_equals($expected, $sig)) {
            HaloApuSyncLog::create([
                'direction' => 'inbound_webhook',
                'event_type' => (string) $request->header('X-HaloAPU-Event', 'unknown'),
                'status' => 'failed',
                'fetched_count' => 0,
                'latency_ms' => 0,
                'http_status' => 401,
                'note' => 'Invalid webhook HMAC signature.',
            ]);

            return response()->json(['message' => 'Invalid signature.'], 401);
        }

        $event = (string) $request->header('X-HaloAPU-Event', 'ping');
        $payload = $request->json()->all();
        /** @var array<string, mixed> $ticketData */
        $ticketData = $payload['ticket'] ?? [];

        $conn->update([
            'last_webhook_at' => now(),
            'last_status' => 'connected',
            'last_error' => null,
        ]);

        match ($event) {
            'ping' => null,
            'ticket.created', 'ticket.status_updated' => $this->upsertTicket($ticketData),
            'ticket.replied' => $this->handleReplied($ticketData),
            'ticket.revision_requested' => $this->handleRevision($ticketData),
            'ticket.result_accepted' => $this->handleAccepted($ticketData),
            'ticket.cancelled' => $this->handleCancelled($ticketData),
            default => null,
        };

        HaloApuSyncLog::create([
            'direction' => 'inbound_webhook',
            'event_type' => $event,
            'status' => 'success',
            'fetched_count' => ! empty($ticketData) ? 1 : 0,
            'latency_ms' => 0,
            'http_status' => 200,
            'note' => "Webhook {$event} berhasil diproses.",
        ]);

        return response()->json(['message' => 'Webhook received and processed.']);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function upsertTicket(array $data): ?HaloApuTicket
    {
        $hatId = $data['haloapuTicketId'] ?? null;
        if (! $hatId) {
            return null;
        }

        /** @var HaloApuTicket $ticket */
        $ticket = HaloApuTicket::updateOrCreate(
            ['haloapu_ticket_id' => $hatId],
            [
                'raw_ticket_id' => (int) ($data['rawTicketId'] ?? 0),
                'source_type' => $data['sourceType'] ?? 'video_reels',
                'sub_unit_name' => $data['subUnitName'] ?? '',
                'title' => $data['title'] ?? "Tiket #{$hatId}",
                'brief' => $data['brief'] ?? '',
                'requester_name' => $data['requesterName'] ?? '',
                'requester_unit' => $data['requesterUnit'] ?? '',
                'requester_whatsapp' => $data['requesterWhatsapp'] ?? '',
                'requester_avatar' => $data['requesterAvatar'] ?? null,
                'assigned_operator_name' => $data['assignedOperatorName'] ?? null,
                'priority' => $data['priority'] ?? 'Sedang',
                'target_date' => $data['targetDate'] ?? null,
                'haloapu_status' => $data['haloapuStatus'] ?? 'open',
                'revision_count' => (int) ($data['revisionCount'] ?? 0),
                'is_result_accepted' => (bool) ($data['isResultAccepted'] ?? false),
                'is_sla_breached' => (bool) ($data['isSlaBreached'] ?? false),
                'sla_response_deadline' => ! empty($data['slaResponseDeadline']) ? Carbon::parse($data['slaResponseDeadline']) : null,
                'sla_resolution_deadline' => ! empty($data['slaResolutionDeadline']) ? Carbon::parse($data['slaResolutionDeadline']) : null,
                'form_snapshot' => $data['formSnapshot'] ?? [],
                'attachments_payload' => $data['attachments'] ?? [],
                'logs_payload' => $data['logs'] ?? [],
                'haloapu_created_at' => ! empty($data['createdAt']) ? Carbon::parse($data['createdAt']) : now(),
                'last_synced_at' => now(),
            ]
        );

        if (! $ticket->content_item_id && $ticket->sync_status !== 'ignored') {
            $this->haloApuService->autoConvertToInbox($ticket, keepPendingSyncStatus: true);
        }

        return $ticket;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function handleReplied(array $data): void
    {
        $ticket = $this->upsertTicket($data);
        if (! $ticket || ! $ticket->content_item_id) {
            return;
        }

        // Add latest reply to ContentComment if linked to a ContentItem
        $latestLog = collect($data['logs'] ?? [])->last();
        if ($latestLog && ($latestLog['aksi'] ?? '') === 'balasan') {
            ContentComment::create([
                'content_item_id' => $ticket->content_item_id,
                'author' => $latestLog['actor'] ?? ($ticket->requester_name ?: 'Pemohon HaloAPU'),
                'role_label' => 'Pemohon (HaloAPU)',
                'comment' => $latestLog['catatan'] ?? '',
                'is_revision_note' => false,
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function handleRevision(array $data): void
    {
        $ticket = $this->upsertTicket($data);
        if (! $ticket) {
            return;
        }

        $ticket->update([
            'haloapu_status' => 'need_revision',
            'is_result_accepted' => false,
        ]);

        if (! $ticket->content_item_id) {
            return;
        }

        /** @var ContentItem|null $contentItem */
        $contentItem = ContentItem::find($ticket->content_item_id);
        if (! $contentItem) {
            return;
        }

        $latestLog = collect($data['logs'] ?? [])->last();
        $revisionCatatan = (string) ($latestLog['catatan'] ?? 'Revisi diminta oleh pemohon melalui HaloAPU.');

        $oldStatus = $contentItem->status;
        $contentItem->update([
            'status' => 'in_progress',
            'revision_note' => $revisionCatatan,
        ]);

        ContentComment::create([
            'content_item_id' => $contentItem->id,
            'author' => $ticket->requester_name ?: 'Pemohon HaloAPU',
            'role_label' => 'Pemohon (HaloAPU)',
            'comment' => $revisionCatatan,
            'is_revision_note' => true,
        ]);

        ContentWorkflowHistory::create([
            'content_item_id' => $contentItem->id,
            'from_status' => $oldStatus,
            'to_status' => 'in_progress',
            'actor' => $ticket->requester_name ?: 'Pemohon HaloAPU',
            'note' => "Permintaan Revisi ke-{$ticket->revision_count}: {$revisionCatatan}",
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function handleAccepted(array $data): void
    {
        $ticket = $this->upsertTicket($data);
        if ($ticket) {
            $ticket->update(['is_result_accepted' => true]);
        }
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function handleCancelled(array $data): void
    {
        $ticket = $this->upsertTicket($data);
        if ($ticket) {
            $ticket->update([
                'haloapu_status' => 'dibatalkan',
                'sync_status' => $ticket->sync_status === 'pending' ? 'ignored' : $ticket->sync_status,
            ]);
        }
    }
}
