<?php

namespace App\Services;

use App\Models\ContentItem;
use App\Models\HaloApuConnection;
use App\Models\HaloApuSyncLog;
use App\Models\HaloApuTicket;
use Carbon\Carbon;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

class HaloApuClientService
{
    /**
     * Create authenticated HTTP client directed at HaloAPU S2S REST API.
     */
    protected function client(): PendingRequest
    {
        $conn = HaloApuConnection::current();
        $token = (string) ($conn->api_token ?: config('services.haloapu.api_token', ''));

        return Http::withToken($token)
            ->timeout(15)
            ->retry(2, 300)
            ->acceptJson();
    }

    /**
     * Test handshake with HaloAPU /api/integrations/sparc/ping.
     *
     * @return array{success: bool, latency_ms: int, message: string}
     */
    public function testConnection(): array
    {
        $conn = HaloApuConnection::current();
        $baseUrl = rtrim((string) ($conn->base_url ?: config('services.haloapu.base_url', '')), '/');

        if (empty($baseUrl)) {
            return [
                'success' => false,
                'latency_ms' => 0,
                'message' => 'Base URL HaloAPU belum dikonfigurasi.',
            ];
        }

        $start = microtime(true);
        try {
            $response = $this->client()->get("{$baseUrl}/api/integrations/sparc/ping");
            $latency = (int) round((microtime(true) - $start) * 1000);

            if ($response->successful()) {
                $conn->update([
                    'last_status' => 'connected',
                    'last_error' => null,
                ]);

                HaloApuSyncLog::create([
                    'direction' => 'outbound_push',
                    'event_type' => 'ping',
                    'status' => 'success',
                    'fetched_count' => 0,
                    'latency_ms' => $latency,
                    'http_status' => $response->status(),
                    'note' => 'Test connection ke HaloAPU berhasil.',
                ]);

                return [
                    'success' => true,
                    'latency_ms' => $latency,
                    'message' => "Koneksi berhasil (HTTP {$response->status()}, latency {$latency}ms).",
                ];
            }

            $conn->update([
                'last_status' => 'error',
                'last_error' => "HTTP {$response->status()}: ".Str::limit($response->body(), 100),
            ]);

            return [
                'success' => false,
                'latency_ms' => $latency,
                'message' => "HaloAPU merespons dengan HTTP {$response->status()}.",
            ];
        } catch (\Throwable $e) {
            $latency = (int) round((microtime(true) - $start) * 1000);
            $conn->update([
                'last_status' => 'error',
                'last_error' => $e->getMessage(),
            ]);

            return [
                'success' => false,
                'latency_ms' => $latency,
                'message' => 'Gagal terhubung ke HaloAPU: '.$e->getMessage(),
            ];
        }
    }

    /**
     * Pull tickets from HaloAPU REST API and upsert into haloapu_tickets table.
     */
    public function syncTickets(?string $updatedSince = null): int
    {
        $conn = HaloApuConnection::current();
        $baseUrl = rtrim((string) ($conn->base_url ?: config('services.haloapu.base_url', '')), '/');

        if (empty($baseUrl)) {
            throw new RuntimeException('Base URL HaloAPU belum dikonfigurasi.');
        }

        $params = ['per_page' => 100];
        if ($updatedSince) {
            $params['updated_since'] = $updatedSince;
        }

        $start = microtime(true);
        $response = $this->client()->get("{$baseUrl}/api/integrations/sparc/tickets", $params);
        $latency = (int) round((microtime(true) - $start) * 1000);

        if (! $response->successful()) {
            HaloApuSyncLog::create([
                'direction' => 'manual_pull',
                'event_type' => 'tickets.pull',
                'status' => 'failed',
                'latency_ms' => $latency,
                'http_status' => $response->status(),
                'note' => "Gagal pull tiket: HTTP {$response->status()}",
            ]);

            throw new RuntimeException("Gagal mengambil data dari HaloAPU (HTTP {$response->status()}).");
        }

        /** @var array<int, array<string, mixed>> $data */
        $data = $response->json('data') ?? [];
        $savedCount = 0;

        foreach ($data as $t) {
            $hatId = $t['haloapuTicketId'] ?? null;
            if (! $hatId) {
                continue;
            }

            /** @var HaloApuTicket $ticket */
            $ticket = HaloApuTicket::updateOrCreate(
                ['haloapu_ticket_id' => $hatId],
                [
                    'raw_ticket_id' => (int) ($t['rawTicketId'] ?? 0),
                    'source_type' => $t['sourceType'] ?? 'video_reels',
                    'sub_unit_name' => $t['subUnitName'] ?? '',
                    'title' => $t['title'] ?? 'Tiket #'.$hatId,
                    'brief' => $t['brief'] ?? '',
                    'requester_name' => $t['requesterName'] ?? '',
                    'requester_unit' => $t['requesterUnit'] ?? '',
                    'requester_whatsapp' => $t['requesterWhatsapp'] ?? '',
                    'requester_avatar' => $t['requesterAvatar'] ?? null,
                    'assigned_operator_name' => $t['assignedOperatorName'] ?? null,
                    'priority' => $t['priority'] ?? 'Sedang',
                    'target_date' => $t['targetDate'] ?? null,
                    'haloapu_status' => $t['haloapuStatus'] ?? 'open',
                    'revision_count' => (int) ($t['revisionCount'] ?? 0),
                    'is_result_accepted' => (bool) ($t['isResultAccepted'] ?? false),
                    'is_sla_breached' => (bool) ($t['isSlaBreached'] ?? false),
                    'sla_response_deadline' => ! empty($t['slaResponseDeadline']) ? Carbon::parse($t['slaResponseDeadline']) : null,
                    'sla_resolution_deadline' => ! empty($t['slaResolutionDeadline']) ? Carbon::parse($t['slaResolutionDeadline']) : null,
                    'form_snapshot' => $t['formSnapshot'] ?? [],
                    'attachments_payload' => $t['attachments'] ?? [],
                    'logs_payload' => $t['logs'] ?? [],
                    'haloapu_created_at' => ! empty($t['createdAt']) ? Carbon::parse($t['createdAt']) : now(),
                    'last_synced_at' => now(),
                ]
            );
            if (! $ticket->content_item_id && $ticket->sync_status !== 'ignored') {
                $this->autoConvertToInbox($ticket, keepPendingSyncStatus: true);
            } elseif ($ticket->content_item_id && ! empty($ticket->assigned_operator_name)) {
                $linked = ContentItem::find($ticket->content_item_id);
                if ($linked && in_array($linked->pic_name, ['', 'Belum Ditugaskan'], true)) {
                    $linked->update(['pic_name' => $ticket->assigned_operator_name]);
                }
            }
            $savedCount++;
        }

        $conn->update([
            'last_synced_at' => now(),
            'last_status' => 'connected',
            'last_error' => null,
        ]);

        HaloApuSyncLog::create([
            'direction' => 'manual_pull',
            'event_type' => 'tickets.pull',
            'status' => 'success',
            'fetched_count' => $savedCount,
            'latency_ms' => $latency,
            'http_status' => $response->status(),
            'note' => "Sinkronisasi berhasil: {$savedCount} tiket diperbarui.",
        ]);

        return $savedCount;
    }

    /**
     * Automatically convert an incoming HaloAPU ticket directly into a Content Planner Inbox item.
     */
    public function autoConvertToInbox(HaloApuTicket $ticket, bool $keepPendingSyncStatus = true): ?ContentItem
    {
        if ($ticket->sync_status === 'ignored') {
            return null;
        }

        if ($ticket->content_item_id && $existing = ContentItem::find($ticket->content_item_id)) {
            return $existing;
        }

        $existingByTicketId = ContentItem::where('ticket_id', $ticket->haloapu_ticket_id)->first();
        if ($existingByTicketId) {
            $ticket->update(['content_item_id' => $existingByTicketId->id]);

            return $existingByTicketId;
        }

        $format = match ($ticket->source_type) {
            'video_reels' => 'reels_shorts',
            'desain_feed' => 'carousel_feed',
            default => 'single_feed',
        };

        $priority = match ($ticket->priority) {
            'Urgen' => 'critical',
            'Tinggi' => 'tinggi',
            'Rendah' => 'rendah',
            default => 'normal',
        };

        $targetDate = $ticket->target_date?->toDateString() ?? now()->addDays(5)->toDateString();

        /** @var ContentItem $item */
        $item = ContentItem::create([
            'title' => $ticket->title ?: "Permohonan Tiket #{$ticket->haloapu_ticket_id}",
            'ticket_id' => $ticket->haloapu_ticket_id,
            'platform' => 'instagram',
            'format' => $format,
            'pillar' => 'edukasi',
            'pic_name' => $ticket->assigned_operator_name ?: 'Belum Ditugaskan',
            'pic_role' => 'creator',
            'pic_avatar' => '',
            'priority' => $priority,
            'production_deadline' => $targetDate,
            'publish_date' => $targetDate,
            'publish_time' => '10:00',
            'campaign_title' => 'Permohonan Layanan HaloAPU',
            'brief' => $ticket->brief,
            'status' => 'inbox',
            'created_by' => auth()->id() ?? 1,
        ]);

        $item->history()->create([
            'from_status' => null,
            'to_status' => 'inbox',
            'actor' => 'HaloAPU Real-Time',
            'note' => "Tiket #{$ticket->haloapu_ticket_id} dari pemohon {$ticket->requester_name} otomatis masuk ke Inbox Content Planner.",
        ]);

        $ticket->update([
            'content_item_id' => $item->id,
            'sync_status' => $keepPendingSyncStatus ? ($ticket->sync_status ?: 'pending') : 'converted',
        ]);

        // Push real-time notification to session if active
        if (request()->hasSession()) {
            $session = request()->session();
            $notifs = $session->get('sparc_v3.notifications', []);
            array_unshift($notifs, [
                'id' => 'notif-'.Str::lower(Str::random(6)),
                'type' => 'info',
                'title' => 'Tiket Masuk HaloAPU',
                'message' => "Permohonan \"{$item->title}\" (#{$ticket->haloapu_ticket_id}) otomatis masuk ke Inbox Planner.",
                'timestamp' => 'Baru saja',
                'createdAt' => now()->toIso8601String(),
                'readAt' => null,
                'link' => '/content',
            ]);
            $session->put('sparc_v3.notifications', array_slice($notifs, 0, 30));
        }

        return $item;
    }

    /**
     * Push status change to HaloAPU.
     */
    public function pushTicketStatus(
        HaloApuTicket $ticket,
        string $status,
        ?string $catatan = null,
        ?string $deliverableUrl = null
    ): void {
        $conn = HaloApuConnection::current();
        $baseUrl = rtrim((string) ($conn->base_url ?: config('services.haloapu.base_url', '')), '/');

        if (empty($baseUrl)) {
            return;
        }

        $id = $ticket->raw_ticket_id ?: str_replace('-', '', $ticket->haloapu_ticket_id);
        $payload = [
            'status' => $status,
            'catatan' => $catatan ?? "Pembaruan status dari SPARC: {$status}",
            'deliverable_url' => $deliverableUrl,
            'actor_name' => auth()->user()?->name ?? 'SPARC System',
            'actor_email' => auth()->user()?->email,
        ];

        $start = microtime(true);
        try {
            $response = $this->client()->post("{$baseUrl}/api/integrations/sparc/tickets/{$id}/status", $payload);
            $latency = (int) round((microtime(true) - $start) * 1000);

            if ($response->successful()) {
                $ticket->update([
                    'haloapu_status' => $status,
                    'last_synced_at' => now(),
                ]);

                HaloApuSyncLog::create([
                    'direction' => 'outbound_push',
                    'event_type' => 'ticket.status_push',
                    'status' => 'success',
                    'fetched_count' => 1,
                    'latency_ms' => $latency,
                    'http_status' => $response->status(),
                    'note' => "Status tiket #{$ticket->haloapu_ticket_id} diubah ke {$status}.",
                ]);
            } else {
                HaloApuSyncLog::create([
                    'direction' => 'outbound_push',
                    'event_type' => 'ticket.status_push',
                    'status' => 'failed',
                    'latency_ms' => $latency,
                    'http_status' => $response->status(),
                    'note' => "Gagal push status: HTTP {$response->status()}",
                ]);
            }
        } catch (\Throwable $e) {
            Log::error("Gagal push status tiket #{$ticket->haloapu_ticket_id} ke HaloAPU: ".$e->getMessage());
        }
    }

    /**
     * Push a comment/reply note to HaloAPU ticket.
     */
    public function pushTicketReply(HaloApuTicket $ticket, string $catatan): void
    {
        $conn = HaloApuConnection::current();
        $baseUrl = rtrim((string) ($conn->base_url ?: config('services.haloapu.base_url', '')), '/');

        if (empty($baseUrl)) {
            return;
        }

        $id = $ticket->raw_ticket_id ?: str_replace('-', '', $ticket->haloapu_ticket_id);
        $payload = [
            'catatan' => $catatan,
            'actor_name' => auth()->user()?->name ?? 'Tim Humas (SPARC)',
            'actor_email' => auth()->user()?->email,
        ];

        try {
            $this->client()->post("{$baseUrl}/api/integrations/sparc/tickets/{$id}/reply", $payload);
        } catch (\Throwable $e) {
            Log::error("Gagal mengirim balasan tiket #{$ticket->haloapu_ticket_id}: ".$e->getMessage());
        }
    }

    /**
     * Proxy stream attachment binary from HaloAPU without public URL exposure.
     */
    public function streamAttachment(HaloApuTicket $ticket, string|int $attachmentId): Response
    {
        $conn = HaloApuConnection::current();
        $baseUrl = rtrim((string) ($conn->base_url ?: config('services.haloapu.base_url', '')), '/');

        if (empty($baseUrl)) {
            abort(404, 'Integrasi HaloAPU belum aktif.');
        }

        $token = (string) ($conn->api_token ?: config('services.haloapu.api_token', ''));

        $attachments = (array) ($ticket->attachments_payload ?? []);
        $target = collect($attachments)->firstWhere('id', (string) $attachmentId)
            ?? collect($attachments)->firstWhere('id', (int) $attachmentId);

        $fileName = (string) ($target['fileName'] ?? 'attachment');
        $extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        $fallbackMime = match ($extension) {
            'jpg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'svg' => 'image/svg+xml',
            'pdf' => 'application/pdf',
            'mp4' => 'video/mp4',
            'mov' => 'video/quicktime',
            default => 'application/octet-stream',
        };

        try {
            $resp = Http::withToken($token)
                ->timeout(30)
                ->withHeaders(['Accept' => '*/*'])
                ->get("{$baseUrl}/api/integrations/sparc/attachments/{$attachmentId}");

            if (! $resp->successful()) {
                abort($resp->status(), 'Gagal memuat lampiran dari HaloAPU.');
            }

            $contentType = $resp->header('Content-Type') ?: $fallbackMime;

            return response($resp->body(), 200, [
                'Content-Type' => $contentType,
                'Content-Disposition' => 'inline; filename="'.addslashes($fileName).'"',
                'Cache-Control' => 'public, max-age=86400',
            ]);
        } catch (\Throwable $e) {
            abort(502, 'Gagal terhubung ke storage lampiran HaloAPU: '.$e->getMessage());
        }
    }

    /**
     * Centrally handle publishing of a ContentItem linked to HaloAPU.
     * Automatically transitions the HaloAPU ticket to 'solve' when auto_solve_on_publish is enabled.
     */
    public function handlePublishedContent(ContentItem $item, ?string $publishedUrl = null): void
    {
        $conn = HaloApuConnection::current();
        if (! $conn->is_enabled || ! $conn->auto_solve_on_publish) {
            return;
        }

        /** @var HaloApuTicket|null $hat */
        $hat = $item->haloApuTicket;
        if (! $hat || in_array($hat->haloapu_status, ['solve', 'reject', 'dibatalkan'], true)) {
            return;
        }

        $url = $publishedUrl ?: ($item->published_url ?: '');
        $note = 'Konten telah selesai diproduksi dan resmi dipublikasikan oleh Tim HUMAS.';
        if ($url) {
            $note .= " Tautan tayang: {$url}";
        }

        $this->pushTicketStatus($hat, 'solve', $note, $url ?: null);
        $hat->update([
            'deliverable_url' => $url ?: $hat->deliverable_url,
            'sync_status' => 'converted',
        ]);
    }
}
