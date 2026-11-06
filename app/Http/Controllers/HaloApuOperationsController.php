<?php

namespace App\Http\Controllers;

use App\Models\ContentItem;
use App\Models\HaloApuTicket;
use App\Services\HaloApuClientService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class HaloApuOperationsController extends Controller
{
    public function __construct(
        protected HaloApuClientService $haloApuService
    ) {}

    /**
     * Convert an incoming HaloApuTicket into an Eloquent ContentItem.
     */
    public function convertTicket(Request $request, string $id): RedirectResponse
    {
        $hat = HaloApuTicket::where('id', $id)
            ->orWhere('haloapu_ticket_id', $id)
            ->firstOrFail();

        $validated = $request->validate([
            'title' => ['required', 'string', 'min:3', 'max:160'],
            'format' => ['required', 'string'],
            'pillar' => ['required', 'string'],
            'pic_name' => ['required', 'string', 'max:100'],
            'target_date' => ['required', 'date'],
        ]);

        $priority = match ($hat->priority) {
            'Urgen' => 'critical',
            'Tinggi' => 'tinggi',
            'Rendah' => 'rendah',
            default => 'normal',
        };

        /** @var ContentItem $item */
        $item = ContentItem::create([
            'title' => $validated['title'],
            'ticket_id' => $hat->haloapu_ticket_id,
            'platform' => 'instagram',
            'format' => $validated['format'],
            'pillar' => $validated['pillar'],
            'pic_name' => $validated['pic_name'],
            'pic_role' => 'creator',
            'pic_avatar' => '',
            'priority' => $priority,
            'production_deadline' => $hat->target_date ?: $validated['target_date'],
            'publish_date' => $validated['target_date'],
            'brief' => $hat->brief,
            'status' => 'inbox',
            'created_by' => auth()->id(),
        ]);

        $item->history()->create([
            'from_status' => null,
            'to_status' => 'inbox',
            'actor' => auth()->user()?->name ?? 'System',
            'note' => "Konten dibuat dari tiket HaloAPU #{$hat->haloapu_ticket_id}.",
        ]);

        $hat->update([
            'content_item_id' => $item->id,
            'sync_status' => 'converted',
            'haloapu_status' => 'on_proses',
        ]);

        // Push 'on_proses' to HaloAPU
        $this->haloApuService->pushTicketStatus(
            $hat,
            'on_proses',
            "Dikonversi menjadi rencana konten HUMAS ({$item->content_id}) dengan PIC {$validated['pic_name']}."
        );

        if ($request->hasSession()) {
            $overrides = (array) $request->session()->get('sparc.ticket_overrides', []);
            $overrides[(string) $id] = 'converted';
            $overrides[$hat->haloapu_ticket_id] = 'converted';
            $request->session()->put('sparc.ticket_overrides', $overrides);
        }

        WorkspaceV3Controller::flashToast(
            $request,
            'success',
            'Tiket Dikonversi ke Konten',
            sprintf('Proyek "%s" dibuat dengan kode %s.', $item->title, $item->content_id)
        );

        return redirect()->route('planner.index');
    }

    /**
     * Ignore or reject a HaloApuTicket.
     */
    public function ignoreTicket(Request $request, string $id): RedirectResponse
    {
        $hat = HaloApuTicket::where('id', $id)
            ->orWhere('haloapu_ticket_id', $id)
            ->firstOrFail();

        $validated = $request->validate([
            'action' => ['required', 'string', 'in:ignore,unignore,reject'],
            'catatan' => ['nullable', 'string', 'max:1000'],
        ]);

        if ($validated['action'] === 'unignore') {
            $hat->update(['sync_status' => 'pending']);
            WorkspaceV3Controller::flashToast($request, 'info', 'Tiket Dikembalikan', "Tiket #{$hat->haloapu_ticket_id} kembali ke antrean.");

            return back();
        }

        if ($validated['action'] === 'reject') {
            $catatan = $validated['catatan'] ?: 'Pengajuan ditolak oleh Tim Humas.';
            $hat->update([
                'sync_status' => 'ignored',
                'haloapu_status' => 'reject',
            ]);
            $this->haloApuService->pushTicketStatus($hat, 'reject', $catatan);

            WorkspaceV3Controller::flashToast($request, 'warning', 'Tiket Ditolak', "Tiket #{$hat->haloapu_ticket_id} ditolak dan status dikirim ke pemohon.");

            return back();
        }

        $hat->update(['sync_status' => 'ignored']);
        WorkspaceV3Controller::flashToast($request, 'info', 'Tiket Diabaikan', "Tiket #{$hat->haloapu_ticket_id} disembunyikan dari antrean.");

        return back();
    }

    /**
     * Send comment / reply from SPARC to HaloAPU ticket requester.
     */
    public function replyTicket(Request $request, string $id): RedirectResponse
    {
        $hat = HaloApuTicket::where('id', $id)
            ->orWhere('haloapu_ticket_id', $id)
            ->firstOrFail();

        $validated = $request->validate([
            'catatan' => ['required', 'string', 'min:3', 'max:1000'],
        ]);

        $this->haloApuService->pushTicketReply($hat, $validated['catatan']);

        WorkspaceV3Controller::flashToast(
            $request,
            'success',
            'Pesan Terkirim',
            "Balasan berhasil dikirim ke pemohon tiket #{$hat->haloapu_ticket_id}."
        );

        return back();
    }

    /**
     * Update remote status to pending (pause SLA) or on_proses.
     */
    public function updateRemoteStatus(Request $request, string $id): RedirectResponse
    {
        $hat = HaloApuTicket::where('id', $id)
            ->orWhere('haloapu_ticket_id', $id)
            ->firstOrFail();

        $validated = $request->validate([
            'status' => ['required', 'string', 'in:pending,on_proses'],
            'catatan' => ['nullable', 'string', 'max:1000'],
        ]);

        $this->haloApuService->pushTicketStatus($hat, $validated['status'], $validated['catatan']);

        WorkspaceV3Controller::flashToast(
            $request,
            'info',
            'Status HaloAPU Diperbarui',
            "Status tiket #{$hat->haloapu_ticket_id} diubah ke {$validated['status']}."
        );

        return back();
    }

    /**
     * Deliver result manually (mark 'solve' with deliverable URL and note).
     */
    public function deliverResult(Request $request, string $id): RedirectResponse
    {
        $hat = HaloApuTicket::where('id', $id)
            ->orWhere('haloapu_ticket_id', $id)
            ->firstOrFail();

        $validated = $request->validate([
            'deliverable_url' => ['required', 'url', 'max:500'],
            'catatan' => ['nullable', 'string', 'max:1000'],
        ]);

        $note = $validated['catatan'] ?: "Hasil karya diserahkan oleh Tim HUMAS: {$validated['deliverable_url']}";
        $this->haloApuService->pushTicketStatus($hat, 'solve', $note, $validated['deliverable_url']);

        $hat->update([
            'haloapu_status' => 'solve',
            'deliverable_url' => $validated['deliverable_url'],
            'sync_status' => 'converted',
        ]);

        WorkspaceV3Controller::flashToast(
            $request,
            'success',
            'Hasil Dikirim ke Pemohon',
            "Tiket #{$hat->haloapu_ticket_id} diselesaikan (solve) dengan tautan hasil."
        );

        return back();
    }

    /**
     * Stream attachment through SPARC proxy.
     */
    public function proxyAttachment(Request $request, string $id, string $attachmentId): Response|StreamedResponse
    {
        $hat = HaloApuTicket::where('id', $id)
            ->orWhere('haloapu_ticket_id', $id)
            ->firstOrFail();

        return $this->haloApuService->streamAttachment($hat, $attachmentId);
    }

    /**
     * Download attachment and save into SPARC Visual Assets library.
     */
    public function saveAttachmentToAssets(Request $request, string $id, string $attachmentId): RedirectResponse
    {
        $hat = HaloApuTicket::where('id', $id)
            ->orWhere('haloapu_ticket_id', $id)
            ->firstOrFail();

        $attachments = (array) ($hat->attachments_payload ?? []);
        $target = collect($attachments)->firstWhere('id', $attachmentId);

        $fileName = (string) ($target['fileName'] ?? "Lampiran-{$hat->haloapu_ticket_id}");
        $fileUrl = (string) ($target['url'] ?? route('incoming.attachment.proxy', ['id' => $hat->id, 'attachmentId' => $attachmentId]));

        /** @var array<int, array<string, mixed>> $assets */
        $assets = $request->session()->get('sparc_v3.assets', []);

        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        $isImg = in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'], true);
        $isVideo = in_array($ext, ['mp4', 'mov', 'avi', 'mkv', 'webm'], true);
        $category = $isImg ? 'foto' : ($isVideo ? 'video' : 'dokumen');
        $dimensions = $isImg ? 'Foto Resolusi Tinggi' : ($isVideo ? 'Video Footage' : 'Dokumen');

        array_unshift($assets, [
            'id' => 'ast-'.Str::lower(Str::random(5)),
            'title' => "Lampiran Tiket #{$hat->haloapu_ticket_id} ({$fileName})",
            'category' => $category,
            'tags' => ['haloapu', 'tiket', Str::slug($hat->source_type), $isImg ? 'foto' : 'berkas'],
            'externalUrl' => $fileUrl,
            'thumbnailUrl' => WorkspaceV3Controller::deriveAssetThumbnailUrl($fileUrl) ?: ($isImg ? $fileUrl : 'https://www.google.com/s2/favicons?domain=haloapu.id&sz=128'),
            'contentId' => $hat->content_item_id ? "ci-{$hat->content_item_id}" : null,
            'uploadedBy' => auth()->user()?->name ?? 'HaloAPU Sync',
            'createdAt' => now()->format('d M Y'),
            'dimensions' => $dimensions,
        ]);
        $request->session()->put('sparc_v3.assets', $assets);
        WorkspaceV3Controller::flashToast(
            $request,
            'success',
            'Aset Disimpan',
            "Lampiran \"{$fileName}\" berhasil disimpan ke perpustakaan Visual Assets SPARC."
        );

        return back();
    }
}
