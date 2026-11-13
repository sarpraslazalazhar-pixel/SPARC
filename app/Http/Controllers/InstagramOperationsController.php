<?php

namespace App\Http\Controllers;

use App\Models\ContentItem;
use App\Models\InstagramComment;
use App\Models\InstagramGridSlot;
use App\Models\InstagramSchedule;
use App\Services\InstagramGraphService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class InstagramOperationsController extends Controller
{
    /**
     * Resolve a ContentItem from numeric ID, `ci-X`, `pub-db-X`, or `SPARC-YYYY-XXXX` code.
     */
    protected function resolveContentItem(?string $identifier): ?ContentItem
    {
        if ($identifier === null || trim($identifier) === '') {
            return null;
        }

        $raw = trim($identifier);
        if (is_numeric($raw)) {
            return ContentItem::find((int) $raw);
        }

        $clean = str_replace(['pub-db-', 'ci-', 'p-'], '', $raw);
        if (is_numeric($clean)) {
            $found = ContentItem::find((int) $clean);
            if ($found) {
                return $found;
            }
        }

        return ContentItem::where('content_id', $raw)->first();
    }

    /**
     * Determine whether the public storage URL points to a non-public local host (`localhost` / `127.0.0.1`).
     */
    protected function isLocalStorageHost(): bool
    {
        $sampleUrl = (string) Storage::disk('public')->url('probe.jpg');
        $host = strtolower((string) parse_url($sampleUrl, PHP_URL_HOST));

        return in_array($host, ['localhost', '127.0.0.1', '::1', '0.0.0.0'], true)
            || str_ends_with($host, '.test')
            || str_ends_with($host, '.local');
    }

    /**
     * Direct Publish or Auto-Schedule an Instagram Feed, Carousel, or Reels post (`POST /publishing/instagram/publish`).
     */
    public function publishOrSchedule(Request $request): RedirectResponse
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        if (! $state['can']['managePublishing']) {
            abort(403, 'Peran Anda tidak diizinkan mengeksekusi publikasi langsung ke Instagram.');
        }

        $validated = $request->validate(
            [
                'publication_id' => ['nullable', 'string', 'max:100'],
                'content_item_id' => ['nullable', 'string', 'max:100'],
                'media_type' => ['required', 'string', 'in:IMAGE,REELS,CAROUSEL'],
                'publish_mode' => ['required', 'string', 'in:immediate,scheduled'],
                'scheduled_at' => ['required_if:publish_mode,scheduled', 'nullable', 'date'],
                'caption' => ['nullable', 'string', 'max:2200'],
                'cover_url' => ['nullable', 'url', 'max:1000'],
                'share_to_feed' => ['nullable', 'boolean'],
                'media_urls' => ['nullable'],
                'media_files' => ['nullable', 'array', 'max:10'],
                'media_files.*' => ['file', 'max:307200'],
            ],
            [
                'media_type.required' => 'Pilih format publikasi Instagram (Feed, Carousel, atau Reels).',
                'scheduled_at.required_if' => 'Tentukan tanggal dan jam tayang untuk mode Auto-Publish Terjadwal.',
            ]
        );

        $publicationId = isset($validated['publication_id']) ? trim((string) $validated['publication_id']) : '';

        // Enforce 100% Pre-Publish Checklist completion when tied to a workspace publication slot
        if ($publicationId !== '') {
            /** @var array<int, array<string, mixed>> $allPubs */
            $allPubs = $state['publications'];
            $matchedPub = collect($allPubs)->firstWhere('id', $publicationId);

            if (is_array($matchedPub)) {
                $checklist = is_array($matchedPub['checklist'] ?? null) ? $matchedPub['checklist'] : [];
                $hasUnchecked = collect($checklist)->contains(fn (array $c): bool => empty($c['checked']));
                if ($hasUnchecked) {
                    throw ValidationException::withMessages([
                        'checklist' => 'Seluruh butir checklist pra-publikasi kanal wajib dicentang 100% sebelum mempublikasikan atau mengaktifkan Auto-Publish ke Instagram.',
                    ]);
                }
            }
        }

        $mediaType = strtoupper($validated['media_type']);
        $sources = [];

        /** @var array<int, UploadedFile> $uploadedFiles */
        $uploadedFiles = $request->file('media_files', []);
        if (! empty($uploadedFiles)) {
            if (in_array($mediaType, ['IMAGE', 'CAROUSEL'], true) && $this->isLocalStorageHost()) {
                throw ValidationException::withMessages([
                    'media_files' => 'Server berjalan di localhost: Meta Graph API mewajibkan URL HTTPS publik untuk Foto/Carousel (unggah biner lokal hanya didukung Meta untuk Reels). Gunakan input URL HTTPS publik atau hubungkan tunnel/storage publik.',
                ]);
            }

            foreach ($uploadedFiles as $file) {
                $storedPath = Storage::disk('public')->putFile('instagram-uploads', $file);
                $publicUrl = Storage::disk('public')->url($storedPath);
                $mime = strtolower((string) $file->getMimeType());
                $isVideo = str_starts_with($mime, 'video/')
                    || in_array(strtolower($file->getClientOriginalExtension()), ['mp4', 'mov'], true);

                $sources[] = [
                    'type' => $mediaType === 'REELS' ? 'local' : 'url',
                    'disk' => 'public',
                    'disk_path' => $storedPath,
                    'url' => $publicUrl,
                    'media_kind' => $isVideo || $mediaType === 'REELS' ? 'video' : 'image',
                    'original_name' => $file->getClientOriginalName(),
                ];
            }
        }

        $rawUrls = $validated['media_urls'] ?? [];
        $urlList = [];
        if (is_array($rawUrls)) {
            foreach ($rawUrls as $entry) {
                if (is_string($entry) && trim($entry) !== '') {
                    $urlList[] = trim($entry);
                }
            }
        } elseif (is_string($rawUrls) && trim($rawUrls) !== '') {
            $lines = preg_split('/[\r\n,]+/', trim($rawUrls)) ?: [];
            foreach ($lines as $line) {
                if (trim($line) !== '') {
                    $urlList[] = trim($line);
                }
            }
        }

        foreach ($urlList as $url) {
            if (! filter_var($url, FILTER_VALIDATE_URL)) {
                throw ValidationException::withMessages([
                    'media_urls' => sprintf('Tautan media "%s" tidak valid. Pastikan diawali https://.', $url),
                ]);
            }
            $isVideoUrl = preg_match('/\.(mp4|mov)(\?|$)/i', $url) === 1 || $mediaType === 'REELS';
            $sources[] = [
                'type' => 'url',
                'url' => $url,
                'media_kind' => $isVideoUrl ? 'video' : 'image',
            ];
        }

        if (empty($sources)) {
            throw ValidationException::withMessages([
                'media_urls' => 'Masukkan minimal satu tautan media publik (HTTPS) atau unggah file media terlebih dahulu.',
            ]);
        }

        if ($mediaType === 'CAROUSEL' && count($sources) < 2) {
            throw ValidationException::withMessages([
                'media_urls' => 'Publikasi Carousel Instagram memerlukan minimal 2 hingga 10 slide foto/video.',
            ]);
        }

        $contentItem = $this->resolveContentItem($validated['content_item_id'] ?? null)
            ?? $this->resolveContentItem($publicationId);

        $publishMode = $validated['publish_mode'];
        $scheduledAt = $publishMode === 'scheduled' && ! empty($validated['scheduled_at'])
            ? Carbon::parse((string) $validated['scheduled_at'])
            : now();

        $schedule = InstagramSchedule::create([
            'publication_slot_id' => $publicationId ?: null,
            'content_item_id' => $contentItem?->id,
            'media_type' => $mediaType,
            'media_sources' => array_slice($sources, 0, 10),
            'cover_url' => $validated['cover_url'] ?? null,
            'caption' => $validated['caption'] ?? ($contentItem?->caption ?? ''),
            'share_to_feed' => $request->has('share_to_feed') ? $request->boolean('share_to_feed') : true,
            'publish_mode' => $publishMode,
            'status' => 'queued',
            'scheduled_at' => $scheduledAt,
            'created_by' => auth()->id(),
        ]);

        if ($publishMode === 'scheduled') {
            WorkspaceV3Controller::pushNotification(
                $request,
                'info',
                'Auto-Publish Instagram Terjadwal',
                sprintf(
                    'Konten %s dijadwalkan tayang otomatis ke Instagram pada %s WIB.',
                    $contentItem?->content_id ?? ($publicationId ?: '#'.$schedule->id),
                    $scheduledAt->format('d M Y, H:i')
                ),
                '/publishing'
            );

            WorkspaceV3Controller::flashToast(
                $request,
                'success',
                'Auto-Publish Terjadwal Aktif',
                sprintf('Sistem akan mempublikasikan otomatis ke Instagram pada %s WIB.', $scheduledAt->format('d M Y, H:i'))
            );

            return back();
        }

        // Immediate execution via Instagram Graph API
        $service = new InstagramGraphService;
        if (! $service->isConfigured()) {
            $schedule->update([
                'status' => 'failed',
                'error_message' => 'Kredensial Instagram Graph API belum dikonfigurasi.',
            ]);

            WorkspaceV3Controller::flashToast(
                $request,
                'error',
                'Instagram Belum Terhubung',
                'Hubungkan akun Instagram Bisnis di menu Pengaturan sebelum mengeksekusi Direct Publish.'
            );

            return back();
        }

        $result = $service->publishSchedule($schedule);

        if (! ($result['success'] ?? false)) {
            WorkspaceV3Controller::flashToast(
                $request,
                'error',
                'Publikasi Instagram Gagal',
                $result['error'] ?? 'Gagal mempublikasikan media ke Meta Graph API.'
            );

            return back();
        }

        if (($result['status'] ?? '') === 'processing') {
            WorkspaceV3Controller::flashToast(
                $request,
                'info',
                'Video Sedang Diproses Meta',
                'Container video berhasil diunggah ke server Instagram dan akan ditayangkan otomatis begitu pemrosesan selesai.'
            );

            return back();
        }

        $permalink = (string) ($result['permalink'] ?? '');
        $this->markSessionPublicationLive($request, $publicationId, $contentItem?->id ? (string) $contentItem->id : null, $permalink);

        WorkspaceV3Controller::pushNotification(
            $request,
            'success',
            'Berhasil Tayang di Instagram!',
            sprintf(
                '%s telah dipublikasikan langsung ke Instagram (%s).',
                $contentItem?->title ?? 'Konten Instagram',
                $permalink
            ),
            '/report'
        );

        WorkspaceV3Controller::flashToast(
            $request,
            'success',
            'Berhasil Dipublikasikan ke Instagram!',
            sprintf('Postingan resmi tayang: %s', $permalink)
        );

        return back();
    }

    /**
     * Synchronize session `sparc_v3.publications` and `sparc_v3.content_items` when an immediate publish succeeds.
     */
    protected function markSessionPublicationLive(
        Request $request,
        string $publicationId,
        ?string $contentItemId,
        string $permalink
    ): void {
        if (! $request->hasSession()) {
            return;
        }

        /** @var array<int, array<string, mixed>> $pubs */
        $pubs = $request->session()->get('sparc_v3.publications', []);
        $matchedSessionContentId = null;

        foreach ($pubs as $idx => $pub) {
            if (
                ($publicationId !== '' && ($pub['id'] ?? '') === $publicationId)
                || ($contentItemId !== null && (string) ($pub['contentItemId'] ?? '') === $contentItemId)
            ) {
                $pubs[$idx]['publishedActualAt'] = WorkspaceV3Controller::TODAY.' '.now()->format('H:i');
                $pubs[$idx]['publishedUrl'] = $permalink;
                $matchedSessionContentId = (string) ($pub['contentItemId'] ?? '');
            }
        }
        $request->session()->put('sparc_v3.publications', $pubs);

        $targetContentId = $matchedSessionContentId ?: $contentItemId;
        if ($targetContentId) {
            /** @var array<int, array<string, mixed>> $items */
            $items = $request->session()->get('sparc_v3.content_items', []);
            foreach ($items as $idx => $item) {
                if (($item['id'] ?? '') === $targetContentId) {
                    $items[$idx]['status'] = 'published';
                    $items[$idx]['publishedUrl'] = $permalink;
                }
            }
            $request->session()->put('sparc_v3.content_items', $items);
        }
    }

    /**
     * Cancel a queued or failed scheduled Instagram publication (`DELETE /publishing/instagram/schedules/{schedule}`).
     */
    public function cancelSchedule(Request $request, InstagramSchedule $schedule): RedirectResponse
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        if (! $state['can']['managePublishing']) {
            abort(403, 'Peran Anda tidak diizinkan membatalkan jadwal Auto-Publish.');
        }

        if ($schedule->status === 'published') {
            WorkspaceV3Controller::flashToast(
                $request,
                'warning',
                'Sudah Tayang',
                'Postingan yang sudah resmi tayang di Instagram tidak dapat dibatalkan.'
            );

            return back();
        }

        $schedule->update(['status' => 'cancelled']);

        WorkspaceV3Controller::flashToast(
            $request,
            'info',
            'Jadwal Auto-Publish Dibatalkan',
            'Antrean publikasi terjadwal Instagram telah dibatalkan.'
        );

        return back();
    }

    /**
     * Render every Instagram post pulled from Meta (all months) with its performance metrics (`GET /instagram/library`).
     */
    public function libraryIndex(Request $request): Response
    {
        WorkspaceV3Controller::resolveAuthContextData($request);
        $pageData = WorkspaceV3Controller::queryInstagramLibraryPage($request, 50);

        return Inertia::render('InstagramLibrary/Index', [
            'today' => now()->toDateString(),
            'contentItems' => $pageData['contentItems'],
            'monthOptions' => $pageData['monthOptions'],
            'kpi' => $pageData['kpi'],
            'pagination' => $pageData['pagination'],
            'filters' => $pageData['filters'],
            'archiveSyncState' => WorkspaceV3Controller::buildInstagramArchiveSyncState(),
            'team' => WorkspaceV3Controller::loadRealTeam(),
        ]);
    }

    /**
     * Render centralized Instagram Public Comments Moderation Inbox (`GET /instagram/comments`).
     */
    public function commentsIndex(Request $request): Response
    {
        WorkspaceV3Controller::resolveAuthContextData($request);
        $igSettings = WorkspaceV3Controller::resolveInstagramSettingsPayload($request);
        $team = WorkspaceV3Controller::loadRealTeam();
        $statusFilter = trim((string) $request->query('status', 'all')) ?: 'all';
        $searchQuery = trim((string) $request->query('q', ''));
        $contentFilter = trim((string) $request->query('content_item_id', ''));
        $mediaFilter = trim((string) $request->query('media_id', ''));
        if ($contentFilter === 'all') {
            $contentFilter = '';
        }
        if ($mediaFilter === 'all') {
            $mediaFilter = '';
        }
        $comments = [];
        $postsWithComments = [];
        $summary = [
            'total' => 0,
            'unreplied' => 0,
            'replied' => 0,
            'hidden' => 0,
            'converted' => 0,
        ];

        if (Schema::hasTable('instagram_comments')) {
            $baseQuery = InstagramComment::query()->whereNull('parent_ig_comment_id');
            if ($contentFilter !== '') {
                $baseQuery->where('content_item_id', (int) $contentFilter);
            }
            if ($mediaFilter !== '') {
                $baseQuery->where('ig_media_id', $mediaFilter);
            }
            $summary = [
                'total' => (clone $baseQuery)->count(),
                'unreplied' => (clone $baseQuery)->where('is_replied', false)->where('is_hidden', false)->count(),
                'replied' => (clone $baseQuery)->where('is_replied', true)->count(),
                'hidden' => (clone $baseQuery)->where('is_hidden', true)->count(),
                'converted' => (clone $baseQuery)->whereNotNull('converted_content_item_id')->count(),
            ];

            $query = InstagramComment::with(['contentItem', 'convertedContentItem'])
                ->whereNull('parent_ig_comment_id');

            if ($statusFilter === 'unreplied') {
                $query->where('is_replied', false)->where('is_hidden', false);
            } elseif ($statusFilter === 'replied') {
                $query->where('is_replied', true);
            } elseif ($statusFilter === 'hidden') {
                $query->where('is_hidden', true);
            } elseif ($statusFilter === 'converted') {
                $query->whereNotNull('converted_content_item_id');
            }
            if ($contentFilter !== '') {
                $query->where('content_item_id', (int) $contentFilter);
            }

            if ($mediaFilter !== '') {
                $query->where('ig_media_id', $mediaFilter);
            }

            if ($searchQuery !== '') {
                $query->where(function ($q) use ($searchQuery): void {
                    $q->where('username', 'like', "%{$searchQuery}%")
                        ->orWhere('text', 'like', "%{$searchQuery}%")
                        ->orWhere('media_caption_excerpt', 'like', "%{$searchQuery}%");
                });
            }

            $comments = $query
                ->orderByDesc('commented_at')
                ->orderByDesc('id')
                ->limit(500)
                ->get()
                ->map(fn (InstagramComment $c): array => [
                    'id' => (string) $c->id,
                    'igCommentId' => (string) $c->ig_comment_id,
                    'igMediaId' => (string) $c->ig_media_id,
                    'mediaPermalink' => $c->media_permalink,
                    'mediaCaptionExcerpt' => $c->media_caption_excerpt,
                    'mediaThumbnailUrl' => $c->media_thumbnail_url,
                    'contentItemId' => $c->content_item_id ? (string) $c->content_item_id : null,
                    'contentCode' => $c->contentItem?->content_id,
                    'contentTitle' => $c->contentItem?->title,
                    'username' => (string) $c->username,
                    'text' => (string) $c->text,
                    'likeCount' => (int) $c->like_count,
                    'isHidden' => (bool) $c->is_hidden,
                    'isReplied' => (bool) $c->is_replied,
                    'repliedBy' => $c->replied_by,
                    'replyText' => $c->reply_text,
                    'repliedAt' => $c->replied_at?->format('d M Y, H:i'),
                    'convertedContentItemId' => $c->converted_content_item_id ? (string) $c->converted_content_item_id : null,
                    'convertedContentCode' => $c->convertedContentItem?->content_id,
                    'commentedAt' => $c->commented_at?->format('d M Y, H:i') ?? 'Baru saja',
                ])
                ->values()
                ->all();

            $groupedRows = InstagramComment::query()
                ->whereNull('parent_ig_comment_id')
                ->whereNotNull('ig_media_id')
                ->select(
                    'ig_media_id',
                    DB::raw('MAX(content_item_id) as content_item_id'),
                    DB::raw('MAX(media_permalink) as media_permalink'),
                    DB::raw('MAX(media_caption_excerpt) as media_caption_excerpt'),
                    DB::raw('MAX(media_thumbnail_url) as media_thumbnail_url'),
                    DB::raw('COUNT(*) as comments_count'),
                    DB::raw('SUM(CASE WHEN is_replied = 0 AND is_hidden = 0 THEN 1 ELSE 0 END) as unreplied_count')
                )
                ->groupBy('ig_media_id')
                ->get();

            $linkedContentIds = $groupedRows->pluck('content_item_id')->filter()->unique()->values()->all();
            $linkedContentMap = ! empty($linkedContentIds)
                ? ContentItem::whereIn('id', $linkedContentIds)->get()->keyBy('id')
                : collect();

            $postsWithComments = $groupedRows
                ->map(function ($p) use ($linkedContentMap): array {
                    $item = $p->content_item_id ? $linkedContentMap->get((int) $p->content_item_id) : null;

                    return [
                        'igMediaId' => (string) $p->ig_media_id,
                        'contentItemId' => $p->content_item_id ? (string) $p->content_item_id : null,
                        'contentCode' => $item?->content_id,
                        'contentTitle' => $item?->title,
                        'mediaCaptionExcerpt' => (string) ($p->media_caption_excerpt ?? ''),
                        'mediaPermalink' => (string) ($p->media_permalink ?? ''),
                        'mediaThumbnailUrl' => (string) ($p->media_thumbnail_url ?? ''),
                        'commentsCount' => (int) $p->comments_count,
                        'unrepliedCount' => (int) $p->unreplied_count,
                    ];
                })
                ->sortByDesc('unrepliedCount')
                ->values()
                ->all();
        }

        return Inertia::render('Comments/Index', [
            'comments' => $comments,
            'summary' => $summary,
            'postsWithComments' => $postsWithComments,
            'filters' => [
                'status' => $statusFilter,
                'q' => $searchQuery,
                'content_item_id' => $contentFilter,
                'media_id' => $mediaFilter,
            ],
            'team' => $team,
            'instagramSettings' => $igSettings,
        ]);
    }

    /**
     * Pull latest public comments from Meta Graph API (`POST /instagram/comments/sync`).
     */
    public function syncComments(Request $request): RedirectResponse
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        if (! ($state['can']['updateTasks'] || $state['can']['managePublishing'])) {
            abort(403, 'Peran Anda tidak diizinkan menyinkronkan komentar Instagram.');
        }

        $service = new InstagramGraphService;
        if (! $service->isConfigured()) {
            WorkspaceV3Controller::flashToast(
                $request,
                'error',
                'Instagram Belum Terhubung',
                'Hubungkan akun Instagram Bisnis di menu Pengaturan terlebih dahulu.'
            );

            return back();
        }

        $result = $service->syncRecentComments(0);

        if (! ($result['success'] ?? false)) {
            WorkspaceV3Controller::flashToast(
                $request,
                'error',
                'Sinkronisasi Komentar Gagal',
                $result['error'] ?? 'Gagal menarik daftar komentar publik dari Meta Graph API.'
            );

            return back();
        }

        $newUnreplied = (int) ($result['new_unreplied_count'] ?? 0);
        if ($newUnreplied > 0) {
            WorkspaceV3Controller::pushNotification(
                $request,
                'info',
                sprintf('%d Komentar Publik Baru di Instagram', $newUnreplied),
                'Terdapat pertanyaan atau tanggapan masyarakat yang belum dibalas di kotak masuk IG Comments.',
                '/instagram/comments'
            );
        }

        WorkspaceV3Controller::flashToast(
            $request,
            'success',
            'Komentar Publik Disinkronkan',
            sprintf('%d komentar ditarik (%d komentar baru belum dibalas).', $result['synced_count'], $newUnreplied)
        );

        return back();
    }

    /**
     * Reply officially to a public Instagram comment (`POST /instagram/comments/{comment}/reply`).
     */
    public function replyComment(Request $request, InstagramComment $comment): RedirectResponse
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        if (! ($state['can']['updateTasks'] || $state['can']['managePublishing'])) {
            abort(403, 'Peran Anda tidak diizinkan membalas komentar publik Instagram.');
        }

        $validated = $request->validate(
            [
                'message' => ['required', 'string', 'min:1', 'max:1000'],
            ],
            [
                'message.required' => 'Tulis isi balasan resmi sebelum mengirim.',
            ]
        );

        $actorName = (string) ($state['currentUser']['name'] ?? (auth()->user()->name ?? 'Admin HUMAS'));
        $service = new InstagramGraphService;
        $result = $service->replyToComment($comment, $validated['message'], $actorName);

        if (! ($result['success'] ?? false)) {
            WorkspaceV3Controller::flashToast(
                $request,
                'error',
                'Gagal Mengirim Balasan',
                $result['error'] ?? 'Tidak dapat mengirim balasan ke Instagram Graph API.'
            );

            return back();
        }

        WorkspaceV3Controller::flashToast(
            $request,
            'success',
            'Balasan Resmi Terkirim',
            sprintf('Balasan untuk @%s telah tampil di postingan Instagram.', $comment->username)
        );

        return back();
    }

    /**
     * Hide or unhide a public comment on Instagram (`PATCH /instagram/comments/{comment}/hide`).
     */
    public function toggleHideComment(Request $request, InstagramComment $comment): RedirectResponse
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        if (! ($state['can']['updateTasks'] || $state['can']['managePublishing'])) {
            abort(403, 'Peran Anda tidak diizinkan mengubah visibilitas komentar.');
        }

        $targetHide = $request->has('hide') ? $request->boolean('hide') : ! $comment->is_hidden;
        $service = new InstagramGraphService;
        $result = $service->setCommentHidden($comment, $targetHide);

        if (! ($result['success'] ?? false)) {
            WorkspaceV3Controller::flashToast(
                $request,
                'error',
                'Gagal Mengubah Visibilitas',
                $result['error'] ?? 'Gagal memperbarui status sembunyi komentar di Instagram.'
            );

            return back();
        }

        WorkspaceV3Controller::flashToast(
            $request,
            'info',
            $targetHide ? 'Komentar Disembunyikan' : 'Komentar Ditampilkan Kembali',
            sprintf('Visibilitas komentar @%s di Instagram telah diperbarui.', $comment->username)
        );

        return back();
    }

    /**
     * Delete a public comment permanently from Instagram (`DELETE /instagram/comments/{comment}`).
     */
    public function destroyComment(Request $request, InstagramComment $comment): RedirectResponse
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        if (! ($state['can']['managePublishing'] || $state['can']['approveContent'])) {
            abort(403, 'Hanya Publisher, Planner, Kepala HUMAS, atau Administrator yang dapat menghapus komentar publik.');
        }

        $username = $comment->username;
        $service = new InstagramGraphService;
        $result = $service->deleteComment($comment);

        if (! ($result['success'] ?? false)) {
            WorkspaceV3Controller::flashToast(
                $request,
                'error',
                'Gagal Menghapus Komentar',
                $result['error'] ?? 'Komentar tidak dapat dihapus dari server Meta.'
            );

            return back();
        }

        WorkspaceV3Controller::flashToast(
            $request,
            'warning',
            'Komentar Dihapus Permanen',
            sprintf('Komentar publik dari @%s telah dihapus dari Instagram.', $username)
        );

        return back();
    }

    /**
     * Convert an audience Instagram comment/question into a SPARC ContentItem idea (`POST /instagram/comments/{comment}/convert`).
     */
    public function convertToContent(Request $request, InstagramComment $comment): RedirectResponse
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        if (! $state['can']['editContent']) {
            abort(403, 'Peran Anda tidak diizinkan mengonversi komentar menjadi ide konten.');
        }

        $validated = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'format' => ['nullable', 'string', 'max:50'],
            'pillar' => ['nullable', 'string', 'max:50'],
            'pic_name' => ['nullable', 'string', 'max:120'],
        ]);

        $title = ! empty($validated['title'])
            ? trim((string) $validated['title'])
            : sprintf('Menjawab @%s: %s', $comment->username, Str::limit(trim($comment->text), 75));

        $briefLines = [
            sprintf('Aspirasi / Pertanyaan Audiens Instagram dari @%s:', $comment->username),
            sprintf('"%s"', trim($comment->text)),
        ];
        if (! empty($comment->media_permalink)) {
            $briefLines[] = sprintf('Sumber Postingan: %s', $comment->media_permalink);
        }

        $item = ContentItem::create([
            'title' => $title,
            'status' => 'inbox',
            'priority' => 'normal',
            'platform' => 'instagram',
            'format' => $validated['format'] ?? 'reels',
            'pillar' => $validated['pillar'] ?? 'edukasi',
            'pic_name' => $validated['pic_name'] ?? ($state['currentUser']['name'] ?? 'Nadia Putri'),
            'pic_role' => 'planner',
            'pic_avatar' => '',
            'production_deadline' => now()->addDays(4)->toDateString(),
            'publish_date' => now()->addDays(6)->toDateString(),
            'publish_time' => '16:30',
            'brief' => implode("\n", $briefLines),
            'created_by' => auth()->id(),
        ]);

        $item->history()->create([
            'from_status' => null,
            'to_status' => 'inbox',
            'actor' => auth()->user()->name ?? ($state['currentUser']['name'] ?? 'System'),
            'note' => sprintf('Ide konten dibuat dari komentar publik Instagram @%s.', $comment->username),
        ]);

        $comment->update(['converted_content_item_id' => $item->id]);

        WorkspaceV3Controller::pushNotification(
            $request,
            'info',
            sprintf('Ide Konten Baru %s', $item->content_id),
            sprintf('Pertanyaan @%s berhasil dijadikan rencana konten "%s".', $comment->username, $item->title),
            '/content'
        );

        WorkspaceV3Controller::flashToast(
            $request,
            'success',
            'Berhasil Dijadikan Ide Konten!',
            sprintf('%s telah masuk ke kolom Inbox pada Content Plan.', $item->content_id)
        );

        return back();
    }

    /**
     * Render Authentic 3x3 Hybrid Instagram Visual Grid Planner (`GET /grid`).
     */
    public function gridIndex(Request $request): Response
    {
        WorkspaceV3Controller::resolveAuthContextData($request);
        $igSettings = WorkspaceV3Controller::resolveLightweightInstagramStatus($request);
        $plannedSlots = [];
        $livePosts = [];
        $totalLiveCount = 0;
        $liveLimit = min(600, max(60, (int) $request->query('live_limit', 60)));

        if (Schema::hasTable('content_items')) {

            $upcomingItems = ContentItem::query()
                ->where('platform', 'instagram')
                ->where('status', '!=', 'published')
                ->orderByRaw('CASE WHEN grid_position IS NULL THEN 1 ELSE 0 END, grid_position ASC')
                ->orderByDesc('publish_date')
                ->limit(18)
                ->get();

            foreach ($upcomingItems as $idx => $item) {
                $designUrl = (string) ($item->result_design_url ?? '');
                $previewImage = $item->ig_thumbnail_url ?: $item->ig_media_url;
                if (! $previewImage && $designUrl !== '' && ! str_contains($designUrl, 'canva.com') && ! str_contains($designUrl, 'figma.com')) {
                    $previewImage = $designUrl;
                }

                $plannedSlots[] = [
                    'slotKey' => 'ci-'.$item->id,
                    'sourceType' => 'content_item',
                    'entityId' => (string) $item->id,
                    'contentId' => $item->content_id,
                    'title' => $item->title,
                    'format' => in_array($item->format, ['reels', 'reels_shorts', 'video'], true)
                        ? 'reels'
                        : ($item->format === 'carousel' ? 'carousel' : 'single'),
                    'status' => $item->status === 'ready_to_publish'
                        ? 'approved'
                        : (in_array($item->status, ['in_progress', 'review_approval'], true) ? 'in_design' : 'draft'),
                    'workflowStatus' => $item->status,
                    'publishDate' => $item->publish_date?->toDateString(),
                    'imageUrl' => $previewImage,
                    'canvaUrl' => str_contains($designUrl, 'canva.com') ? $designUrl : null,
                    'figmaUrl' => str_contains($designUrl, 'figma.com') ? $designUrl : null,
                    'notes' => $item->caption ?: $item->brief,
                    'position' => $item->grid_position ?? (100 + $idx),
                ];
            }

            $liveBaseQuery = ContentItem::query()
                ->where('platform', 'instagram')
                ->where('status', 'published')
                ->where(function ($q) {
                    $q->whereNotNull('ig_media_id')
                        ->orWhereNotNull('ig_media_url')
                        ->orWhereNotNull('ig_thumbnail_url')
                        ->orWhereNotNull('published_url');
                });

            $totalLiveCount = (clone $liveBaseQuery)->count();

            $publishedItems = $liveBaseQuery
                ->select([
                    'id', 'content_id', 'title', 'format',
                    'ig_thumbnail_url', 'ig_media_url', 'result_design_url',
                    'published_url', 'publish_date', 'reach', 'views',
                    'likes', 'comments_count', 'saves', 'shares',
                ])
                ->orderByDesc('publish_date')
                ->orderByDesc('publish_time')
                ->orderByDesc('id')
                ->limit($liveLimit)
                ->get();
            foreach ($publishedItems as $item) {
                $livePosts[] = [
                    'id' => 'live-'.$item->id,
                    'contentId' => $item->content_id,
                    'title' => $item->title,
                    'format' => in_array($item->format, ['reels', 'reels_shorts', 'video'], true)
                        ? 'reels'
                        : ($item->format === 'carousel' ? 'carousel' : 'single'),
                    'imageUrl' => $item->ig_thumbnail_url ?: $item->ig_media_url ?: $item->result_design_url,
                    'mediaUrl' => $item->ig_media_url,
                    'permalink' => $item->published_url,
                    'publishDate' => $item->publish_date?->toDateString(),
                    'reach' => $item->reach,
                    'views' => (int) $item->views,
                    'likes' => (int) $item->likes,
                    'commentsCount' => (int) $item->comments_count,
                    'saves' => $item->saves,
                    'shares' => (int) $item->shares,
                ];
            }
        }

        if (Schema::hasTable('instagram_grid_slots')) {
            $customSlots = InstagramGridSlot::query()
                ->orderBy('position')
                ->orderByDesc('id')
                ->get();

            foreach ($customSlots as $slot) {
                $plannedSlots[] = [
                    'slotKey' => 'slot-'.$slot->id,
                    'sourceType' => 'custom_slot',
                    'entityId' => (string) $slot->id,
                    'contentId' => null,
                    'title' => $slot->title,
                    'format' => $slot->format,
                    'status' => $slot->status,
                    'workflowStatus' => $slot->status,
                    'publishDate' => null,
                    'imageUrl' => $slot->image_url,
                    'canvaUrl' => $slot->canva_url,
                    'figmaUrl' => $slot->figma_url,
                    'notes' => $slot->notes,
                    'position' => (int) $slot->position,
                ];
            }
        }

        usort($plannedSlots, static fn (array $a, array $b): int => ($a['position'] ?? 0) <=> ($b['position'] ?? 0));

        return Inertia::render('Grid/Index', [
            'igProfile' => $igSettings,
            'plannedSlots' => array_values($plannedSlots),
            'totalLiveCount' => $totalLiveCount,
            'livePosts' => array_values($livePosts),
        ]);
    }

    /**
     * Create or update a custom visual draft slot in the persistent 3x3 Grid (`POST /grid/slots`).
     */
    public function saveGridSlot(Request $request): RedirectResponse
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        if (! ($state['can']['editContent'] || $state['can']['manageAssets'])) {
            abort(403, 'Peran Anda tidak diizinkan mengubah slot pratinjau Grid.');
        }

        $validated = $request->validate([
            'slot_id' => ['nullable', 'integer'],
            'title' => ['required', 'string', 'max:180'],
            'format' => ['required', 'string', 'in:single,carousel,reels'],
            'status' => ['required', 'string', 'in:draft,in_design,approved'],
            'image_url' => ['nullable', 'string', 'max:1000'],
            'image_file' => ['nullable', 'image', 'max:10240'],
            'canva_url' => ['nullable', 'string', 'max:500'],
            'figma_url' => ['nullable', 'string', 'max:500'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $imageUrl = $validated['image_url'] ?? null;
        if ($request->hasFile('image_file')) {
            $path = Storage::disk('public')->putFile('grid-previews', $request->file('image_file'));
            $imageUrl = Storage::disk('public')->url($path);
        }

        if (! empty($validated['slot_id'])) {
            $existing = InstagramGridSlot::findOrFail((int) $validated['slot_id']);
            $existing->update([
                'title' => $validated['title'],
                'format' => $validated['format'],
                'status' => $validated['status'],
                'image_url' => $imageUrl ?? $existing->image_url,
                'canva_url' => $validated['canva_url'] ?? null,
                'figma_url' => $validated['figma_url'] ?? null,
                'notes' => $validated['notes'] ?? null,
            ]);

            WorkspaceV3Controller::flashToast($request, 'success', 'Slot Grid Diperbarui', sprintf('"%s" berhasil disimpan.', $existing->title));

            return back();
        }

        InstagramGridSlot::query()->increment('position');
        ContentItem::query()->whereNotNull('grid_position')->increment('grid_position');

        InstagramGridSlot::create([
            'position' => 0,
            'title' => $validated['title'],
            'format' => $validated['format'],
            'status' => $validated['status'],
            'image_url' => $imageUrl,
            'canva_url' => $validated['canva_url'] ?? null,
            'figma_url' => $validated['figma_url'] ?? null,
            'notes' => $validated['notes'] ?? null,
        ]);

        WorkspaceV3Controller::flashToast($request, 'success', 'Slot Draft Ditambahkan ke Grid', sprintf('"%s" kini tampil di baris teratas Visual Grid.', $validated['title']));

        return back();
    }

    /**
     * Persist drag-and-drop ordering of upcoming planned slots in the 3x3 Grid (`PATCH /grid/reorder`).
     */
    public function reorderGrid(Request $request): RedirectResponse
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        if (! ($state['can']['editContent'] || $state['can']['managePublishing'])) {
            abort(403, 'Peran Anda tidak diizinkan menyusun ulang urutan Visual Grid.');
        }

        $validated = $request->validate([
            'ordered_keys' => ['required', 'array', 'min:1'],
            'ordered_keys.*' => ['required', 'string', 'max:50'],
        ]);

        foreach (array_values($validated['ordered_keys']) as $index => $slotKey) {
            if (str_starts_with($slotKey, 'ci-')) {
                $itemId = (int) substr($slotKey, 3);
                ContentItem::where('id', $itemId)->update(['grid_position' => $index]);
            } elseif (str_starts_with($slotKey, 'slot-')) {
                $slotId = (int) substr($slotKey, 5);
                InstagramGridSlot::where('id', $slotId)->update(['position' => $index]);
            }
        }

        WorkspaceV3Controller::flashToast($request, 'success', 'Urutan Grid Tersimpan', 'Susunan rencana feed 3x3 telah diperbarui.');

        return back();
    }

    /**
     * Delete a standalone custom draft slot from the 3x3 Grid (`DELETE /grid/slots/{slot}`).
     */
    public function destroyGridSlot(Request $request, InstagramGridSlot $slot): RedirectResponse
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        if (! ($state['can']['editContent'] || $state['can']['manageAssets'])) {
            abort(403, 'Peran Anda tidak diizinkan menghapus slot Grid.');
        }

        $title = $slot->title;
        $slot->delete();

        WorkspaceV3Controller::flashToast($request, 'info', 'Slot Draft Dihapus', sprintf('"%s" dihapus dari pratinjau Grid.', $title));

        return back();
    }

    /**
     * Synchronize and auto-import latest Instagram Business posts directly into the Visual Grid (`POST /grid/sync-live-feed`).
     */
    public function syncLiveGridFeed(Request $request): RedirectResponse
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        if (! ($state['can']['managePublishing'] || $state['can']['editContent'])) {
            abort(403, 'Peran Anda tidak diizinkan menyinkronkan feed Instagram.');
        }

        $service = new InstagramGraphService;
        if (! $service->isConfigured()) {
            WorkspaceV3Controller::flashToast(
                $request,
                'error',
                'Instagram Belum Terhubung',
                'Hubungkan akun Instagram terlebih dahulu di menu Pengaturan.'
            );

            return back();
        }

        $res = $service->syncAndAutoImportRecentMedia(0, true);
        $service->syncAccountProfileAndInsights();

        if (! ($res['success'] ?? false)) {
            WorkspaceV3Controller::flashToast(
                $request,
                'error',
                'Gagal Menarik Feed IG',
                $res['error'] ?? 'Terjadi kesalahan saat berkomunikasi dengan server Meta Graph API.'
            );

            return back();
        }

        WorkspaceV3Controller::flashToast(
            $request,
            'success',
            'Feed Instagram Berhasil Disinkronkan!',
            sprintf(
                '%d postingan diperbarui (%d postingan baru asli diimpor ke Visual Grid).',
                $res['synced_count'] ?? 0,
                $res['imported_count'] ?? 0
            )
        );

        return back();
    }

    /**
     * Manually refresh Long-Lived Instagram Access Token (`POST /settings/instagram/refresh-token`).
     */
    public function refreshToken(Request $request): RedirectResponse
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        if (! $state['can']['manageSettings']) {
            abort(403, 'Hanya Administrator yang dapat memperpanjang token Meta Graph API.');
        }

        $service = new InstagramGraphService;
        $res = $service->refreshTokenIfExpiring(60, true);
        $service->inspectTokenPermissions();

        if (! ($res['success'] ?? false)) {
            WorkspaceV3Controller::flashToast(
                $request,
                'error',
                'Gagal Memperpanjang Token',
                $res['error'] ?? 'Tidak dapat memperbarui Long-Lived Token dari server Meta.'
            );

            return back();
        }

        WorkspaceV3Controller::flashToast(
            $request,
            'success',
            'Token Berhasil Diperpanjang!',
            sprintf('Masa aktif token Meta diperbarui (%d hari tersisa).', $res['days_remaining'] ?? 60)
        );

        return back();
    }

    /**
     * Synchronize Instagram Business Profile, 28-day Account Insights, Best Posting Hours, and Active Permissions (`POST /settings/instagram/sync-profile`).
     */
    public function syncProfileAndInsights(Request $request): RedirectResponse
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        if (! ($state['can']['manageSettings'] || $state['can']['managePublishing'] || $state['can']['editContent'])) {
            abort(403, 'Peran Anda tidak diizinkan menyinkronkan profil & wawasan akun Instagram.');
        }

        $service = new InstagramGraphService;
        if (! $service->isConfigured()) {
            WorkspaceV3Controller::flashToast(
                $request,
                'error',
                'Instagram Belum Terhubung',
                'Hubungkan akun Instagram Bisnis di menu Pengaturan terlebih dahulu.'
            );

            return back();
        }

        $res = $service->syncAccountProfileAndInsights();
        $service->inspectTokenPermissions();

        if (! ($res['success'] ?? false)) {
            WorkspaceV3Controller::flashToast(
                $request,
                'error',
                'Sinkronisasi Profil Gagal',
                $res['error'] ?? 'Gagal menarik profil dan Account Insights dari Meta Graph API.'
            );

            return back();
        }

        WorkspaceV3Controller::flashToast(
            $request,
            'success',
            'Profil & Wawasan Akun Disinkronkan',
            'Data pengikut, jangkauan 28 hari, dan rekomendasi jam tayang terbaik (WIB) telah diperbarui.'
        );

        return back();
    }

    /**
     * Synchronize Meta Marketing API Ad Accounts, Campaigns, and Insights (`POST /settings/instagram/sync-ads`).
     */
    public function syncAds(Request $request): RedirectResponse
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        if (! ($state['can']['manageSettings'] || $state['can']['managePublishing'] || $state['can']['editContent'])) {
            abort(403, 'Peran Anda tidak diizinkan menyinkronkan data iklan Meta.');
        }

        $service = new InstagramGraphService;
        if (! $service->isConfigured()) {
            WorkspaceV3Controller::flashToast(
                $request,
                'error',
                'Koneksi Belum Terhubung',
                'Hubungkan akun Meta terlebih dahulu di menu Pengaturan.'
            );

            return back();
        }

        $targetAdAccountId = $request->input('ad_account_id');
        $allowedPresets = ['today', 'yesterday', 'last_7d', 'last_14d', 'last_28d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'maximum'];
        $rawPreset = trim((string) $request->input('date_preset', 'last_30d'));
        $datePreset = in_array($rawPreset, $allowedPresets, true) ? $rawPreset : 'last_30d';
        $res = $service->syncAdsPerformance($targetAdAccountId ? (string) $targetAdAccountId : null, $datePreset);

        if (! ($res['success'] ?? false)) {
            WorkspaceV3Controller::flashToast(
                $request,
                'error',
                'Sinkronisasi Iklan Gagal',
                $res['error'] ?? 'Gagal menarik data kampanye dan performa iklan dari Meta Marketing API.'
            );

            return back();
        }

        $accounts = $res['ads_data']['accounts'] ?? [];
        $summary = $res['ads_data']['summary'] ?? [];

        if (empty($accounts)) {
            WorkspaceV3Controller::flashToast(
                $request,
                'warning',
                'Belum Ada Akun Iklan Meta',
                'Izin Meta Marketing API terbaca, tetapi akun Facebook ini belum memiliki Ad Account di Meta Ads Manager (atau belum dicentang saat otorisasi).'
            );

            return back();
        }

        $hasIgBreakdown = ! empty($summary['has_ig_breakdown']);
        $displayImpressions = $hasIgBreakdown
            ? (float) ($summary['ig_impressions'] ?? 0)
            : (float) ($summary['total_impressions'] ?? 0);
        $displaySpend = $hasIgBreakdown
            ? (float) ($summary['ig_spend'] ?? 0)
            : (float) ($summary['total_spend'] ?? 0);

        WorkspaceV3Controller::flashToast(
            $request,
            'success',
            'Data Iklan Berhasil Disinkronkan!',
            sprintf(
                'Performa %s (%d kampanye, %d iklan IG, %s tayangan, spend %s).',
                $res['ads_data']['active_account']['name'] ?? 'Akun Iklan',
                count($res['ads_data']['campaigns'] ?? []),
                count($res['ads_data']['ig_ads'] ?? []),
                number_format($displayImpressions),
                number_format($displaySpend, 2)
            )
        );

        return back();
    }

    /**
     * Synchronize Instagram Audience Demographics (`POST /settings/instagram/sync-demographics`).
     */
    public function syncDemographics(Request $request): RedirectResponse
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        if (! ($state['can']['manageSettings'] || $state['can']['managePublishing'] || $state['can']['editContent'])) {
            abort(403, 'Peran Anda tidak diizinkan menyinkronkan demografi audiens.');
        }

        $service = new InstagramGraphService;
        if (! $service->isConfigured()) {
            WorkspaceV3Controller::flashToast($request, 'error', 'Instagram Belum Terhubung', 'Hubungkan akun Instagram terlebih dahulu.');

            return back();
        }

        $res = $service->syncAudienceDemographics();
        if (! ($res['success'] ?? false)) {
            WorkspaceV3Controller::flashToast($request, 'error', 'Sinkronisasi Demografi Gagal', $res['error'] ?? 'Gagal menarik data demografi dari Meta.');

            return back();
        }

        WorkspaceV3Controller::flashToast($request, 'success', 'Demografi Audiens Disinkronkan', 'Data sebaran usia, gender, dan kota audiens telah diperbarui.');

        return back();
    }

    /**
     * Synchronize Instagram Recent Stories (`POST /settings/instagram/sync-stories`).
     */
    public function syncStories(Request $request): RedirectResponse
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        if (! ($state['can']['manageSettings'] || $state['can']['managePublishing'] || $state['can']['editContent'])) {
            abort(403, 'Peran Anda tidak diizinkan menyinkronkan data stories.');
        }

        $service = new InstagramGraphService;
        if (! $service->isConfigured()) {
            WorkspaceV3Controller::flashToast($request, 'error', 'Instagram Belum Terhubung', 'Hubungkan akun Instagram terlebih dahulu.');

            return back();
        }

        $res = $service->syncRecentStories();
        if (! ($res['success'] ?? false)) {
            WorkspaceV3Controller::flashToast($request, 'error', 'Sinkronisasi Story Gagal', $res['error'] ?? 'Gagal menarik stories dari Meta.');

            return back();
        }

        $count = count($res['stories'] ?? []);
        WorkspaceV3Controller::flashToast($request, 'success', 'Story Instagram Disinkronkan', sprintf('%d story aktif berhasil diperbarui bersama metriknya.', $count));

        return back();
    }

    /**
     * Synchronize Instagram Tags and Mentions (`POST /settings/instagram/sync-mentions`).
     */
    public function syncMentions(Request $request): RedirectResponse
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        if (! ($state['can']['manageSettings'] || $state['can']['managePublishing'] || $state['can']['editContent'])) {
            abort(403, 'Peran Anda tidak diizinkan menyinkronkan mentions.');
        }

        $service = new InstagramGraphService;
        if (! $service->isConfigured()) {
            WorkspaceV3Controller::flashToast($request, 'error', 'Instagram Belum Terhubung', 'Hubungkan akun Instagram terlebih dahulu.');

            return back();
        }

        $res = $service->syncTagsAndMentions();
        if (! ($res['success'] ?? false)) {
            WorkspaceV3Controller::flashToast($request, 'error', 'Sinkronisasi Mentions Gagal', $res['error'] ?? 'Gagal menarik tags & mentions.');

            return back();
        }

        WorkspaceV3Controller::flashToast($request, 'success', 'Tags & Mentions Disinkronkan', 'Postingan publik yang menandai akun instansi telah diperbarui.');

        return back();
    }
}
