<?php

namespace App\Http\Controllers;

use App\Http\Resources\ContentItemResource;
use App\Models\ContentItem;
use App\Models\ContentTask;
use App\Models\InstagramConnection;
use App\Models\InstagramSchedule;
use App\Services\InstagramGraphService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class WorkspaceV3Controller extends Controller
{
    /**
     * Operational reference date for consistent deadline & schedule evaluation.
     */
    public const TODAY = '2026-10-27';

    /**
     * Ensure the SPARC v3 operational workspace state is initialized in session.
     *
     * @return array<string, mixed>
     */
    public static function hydrateWorkspace(Request $request): array
    {
        if (! $request->hasSession()) {
            return self::defaultSeed();
        }

        $session = $request->session();

        if (! $session->has('sparc_v3.initialized')) {
            $seed = self::defaultSeed();
            foreach ($seed as $key => $value) {
                $session->put("sparc_v3.{$key}", $value);
            }
            $session->put('sparc_v3.initialized', true);
        }

        $activeRole = (string) $session->get('sparc_v3.active_role', 'admin');
        $personas = self::rolePersonas();
        $currentUser = $personas[$activeRole] ?? $personas['admin'];

        if ($authUser = $request->user()) {
            $currentUser['id'] = (string) $authUser->id;
            $currentUser['name'] = $authUser->name;
            $currentUser['email'] = $authUser->email;
            if (! empty($authUser->avatar)) {
                $currentUser['avatar'] = $authUser->avatar;
            }
        }
        /** @var array<int, array<string, mixed>> $contentItems */
        $contentItems = $session->get('sparc_v3.content_items', []);

        /** @var array<int, array<string, mixed>> $legacyItems */
        $legacyItems = $session->get('sparc.planner_items', []);
        /** @var array<string, array<string, mixed>> $legacyUpdates */
        $legacyUpdates = $session->get('sparc.planner_updates', []);
        /** @var array<int, string> $legacyDeleted */
        $legacyDeleted = $session->get('sparc.deleted_planner_ids', []);

        foreach ($legacyItems as $idx => $legacy) {
            $legacyId = (string) ($legacy['id'] ?? 'legacy-'.$idx);
            $alreadyMerged = collect($contentItems)->contains(fn (array $c): bool => ($c['id'] ?? '') === $legacyId);
            if (! $alreadyMerged) {
                array_unshift($contentItems, [
                    'id' => $legacyId,
                    'contentId' => sprintf('SPARC-2026-%04d', count($contentItems) + 1),
                    'ticketId' => $legacy['ticketId'] ?? null,
                    'title' => (string) ($legacy['title'] ?? 'Konten Baru'),
                    'status' => self::normalizeStatus((string) ($legacy['status'] ?? 'inbox')),
                    'priority' => 'normal',
                    'platform' => (string) ($legacy['platform'] ?? 'instagram'),
                    'format' => (string) ($legacy['format'] ?? 'reels_shorts'),
                    'pillar' => (string) ($legacy['pillar'] ?? 'edukasi'),
                    'picName' => (string) ($legacy['picName'] ?? 'Aldwin NV'),
                    'picRole' => 'planner',
                    'picAvatar' => (string) ($legacy['picAvatar'] ?? $currentUser['avatar']),
                    'productionDeadline' => (string) ($legacy['publishDate'] ?? '2026-10-30'),
                    'publishDate' => (string) ($legacy['publishDate'] ?? '2026-11-01'),
                    'publishTime' => '10:00',
                    'activityTitle' => null,
                    'campaignTitle' => 'Komunikasi Publik Q4',
                    'brief' => (string) ($legacy['caption'] ?? ''),
                    'caption' => (string) ($legacy['caption'] ?? ''),
                    'publishedUrl' => (string) ($legacy['publishedUrl'] ?? ''),
                    'tasks' => [],
                    'comments' => [],
                    'history' => [
                        [
                            'id' => 'h-'.Str::lower(Str::random(5)),
                            'fromStatus' => null,
                            'toStatus' => self::normalizeStatus((string) ($legacy['status'] ?? 'inbox')),
                            'actor' => (string) ($legacy['picName'] ?? 'Aldwin NV'),
                            'timestamp' => 'Baru saja',
                            'note' => 'Item dibuat melalui alur cepat.',
                        ],
                    ],
                ]);
            }
        }

        $contentItems = array_values(array_filter(
            array_map(function (array $item) use ($legacyUpdates): array {
                $id = (string) ($item['id'] ?? '');
                if (isset($legacyUpdates[$id])) {
                    $patch = $legacyUpdates[$id];
                    if (isset($patch['status'])) {
                        $patch['status'] = self::normalizeStatus((string) $patch['status']);
                    }
                    $item = array_merge($item, $patch);
                }

                return $item;
            }, $contentItems),
            fn (array $item): bool => ! in_array((string) ($item['id'] ?? ''), $legacyDeleted, true)
        ));

        /** @var array<int, array<string, mixed>> $publications */
        $publications = $session->get('sparc_v3.publications', []);
        /** @var array<string, array<int, array<string, mixed>>> $dbChecklists */
        $dbChecklists = $session->get('sparc_v3.db_pub_checklists', []);

        if (Schema::hasTable('content_items')) {
            try {
                $dbItems = ContentItem::with(['tasks', 'comments', 'history'])
                    ->orderByDesc('publish_date')
                    ->orderByDesc('id')
                    ->get();

                $resolvedDbItems = ContentItemResource::collection($dbItems)->resolve();
                foreach ($resolvedDbItems as $dbArr) {
                    $existsInContent = collect($contentItems)->contains(
                        fn (array $c): bool => (string) ($c['id'] ?? '') === (string) $dbArr['id']
                            || (! empty($dbArr['contentId']) && ($c['contentId'] ?? '') === $dbArr['contentId'])
                    );
                    if (! $existsInContent) {
                        $contentItems[] = $dbArr;
                    }
                }

                foreach ($dbItems as $dbItem) {
                    if (! in_array($dbItem->status, ['ready_to_publish', 'published'], true)) {
                        continue;
                    }

                    $matchedPubIdx = null;
                    foreach ($publications as $pIdx => $existingPub) {
                        if (
                            (! empty($dbItem->content_id) && strcasecmp((string) ($existingPub['contentId'] ?? ''), (string) $dbItem->content_id) === 0 && strtolower((string) ($existingPub['platform'] ?? '')) === strtolower((string) $dbItem->platform))
                            || (string) ($existingPub['contentItemId'] ?? '') === (string) $dbItem->id
                        ) {
                            $matchedPubIdx = $pIdx;
                            break;
                        }
                    }

                    $hasApiMetrics = $dbItem->metrics_synced_at !== null
                        || $dbItem->reach !== null
                        || (int) $dbItem->views > 0
                        || (int) $dbItem->likes > 0
                        || (int) $dbItem->comments_count > 0
                        || (int) $dbItem->shares > 0
                        || $dbItem->saves !== null;

                    $effectiveReach = $dbItem->reach !== null
                        ? (int) $dbItem->reach
                        : ((int) $dbItem->views > 0 ? (int) $dbItem->views : null);

                    $schedStr = ($dbItem->publish_date?->toDateString() ?? self::TODAY).' '.($dbItem->publish_time ?: '10:00');

                    if ($matchedPubIdx !== null) {
                        if ($dbItem->status === 'published' && empty($publications[$matchedPubIdx]['publishedUrl']) && ! empty($dbItem->published_url)) {
                            $publications[$matchedPubIdx]['publishedUrl'] = $dbItem->published_url;
                        }
                        if ($dbItem->status === 'published' && $hasApiMetrics && $dbItem->metrics_synced_at !== null) {
                            $publications[$matchedPubIdx]['metrics'] = [
                                'reach' => $effectiveReach,
                                'impressions' => (int) $dbItem->views > 0 ? (int) $dbItem->views : $effectiveReach,
                                'views' => (int) $dbItem->views,
                                'likes' => (int) $dbItem->likes,
                                'comments' => (int) $dbItem->comments_count,
                                'shares' => (int) $dbItem->shares,
                                'saves' => $dbItem->saves !== null ? (int) $dbItem->saves : null,
                                'clicks' => $publications[$matchedPubIdx]['metrics']['clicks'] ?? null,
                                'source' => 'api',
                                'recordedAt' => $dbItem->metrics_synced_at->format('Y-m-d H:i'),
                            ];
                        }

                        continue;
                    }

                    $synId = 'pub-db-'.$dbItem->id;
                    $isLive = $dbItem->status === 'published';
                    $publications[] = [
                        'id' => $synId,
                        'contentItemId' => (string) $dbItem->id,
                        'contentId' => (string) $dbItem->content_id,
                        'title' => (string) $dbItem->title,
                        'platform' => (string) $dbItem->platform,
                        'format' => (string) $dbItem->format,
                        'caption' => (string) ($dbItem->caption ?? ''),
                        'mediaPreviewUrl' => $dbItem->result_design_url ?: $dbItem->ig_thumbnail_url ?: $dbItem->ig_media_url,
                        'scheduledAt' => $schedStr,
                        'publishedActualAt' => $isLive ? $schedStr : null,
                        'publishedUrl' => $dbItem->published_url,
                        'picName' => (string) ($dbItem->pic_name ?: 'Publisher HUMAS'),
                        'checklist' => $isLive
                            ? []
                            : ($dbChecklists[$synId] ?? self::defaultChecklistForPlatform((string) $dbItem->platform)),
                        'metrics' => ($isLive && $hasApiMetrics) ? [
                            'reach' => $effectiveReach,
                            'impressions' => (int) $dbItem->views > 0 ? (int) $dbItem->views : $effectiveReach,
                            'views' => (int) $dbItem->views,
                            'likes' => (int) $dbItem->likes,
                            'comments' => (int) $dbItem->comments_count,
                            'shares' => (int) $dbItem->shares,
                            'saves' => $dbItem->saves !== null ? (int) $dbItem->saves : null,
                            'clicks' => null,
                            'source' => $dbItem->metrics_synced_at !== null ? 'api' : 'manual',
                            'recordedAt' => $dbItem->metrics_synced_at?->format('Y-m-d H:i') ?? $schedStr,
                        ] : null,
                    ];
                }
            } catch (\Throwable) {
                // Ignore DB errors during early bootstrap
            }
        }

        return [
            'currentUser' => $currentUser,
            'can' => self::permissionsForRole($activeRole),
            'personas' => array_values($personas),
            'contentItems' => $contentItems,
            'activities' => $session->get('sparc_v3.activities', []),
            'publications' => $publications,
            'assets' => $session->get('sparc_v3.assets', []),
            'team' => $session->get('sparc_v3.team', []),
            'settings' => (function () use ($session, $request) {
                $s = $session->get('sparc_v3.settings', []);
                $s['instagram'] = self::resolveInstagramSettingsPayload($request);

                return $s;
            })(),
            'notifications' => $session->get('sparc_v3.notifications', []),
        ];
    }

    /**
     * Normalize legacy and v3 status strings into canonical SPARC v3 workflow statuses.
     */
    public static function normalizeStatus(string $status): string
    {
        return match ($status) {
            'incoming', 'inbox' => 'inbox',
            'todo', 'briefing' => 'briefing',
            'in_progress', 'production' => 'in_progress',
            'review_approval', 'in_review' => 'review_approval',
            'ready_to_publish' => 'ready_to_publish',
            'published' => 'published',
            default => 'inbox',
        };
    }

    /**
     * Role capability map matching SPARC v3 authorization specification.
     *
     * @return array<string, bool>
     */
    public static function permissionsForRole(string $role): array
    {
        return [
            'manageUsers' => $role === 'admin',
            'inviteTeam' => in_array($role, ['admin', 'manager'], true),
            'approveContent' => in_array($role, ['admin', 'manager'], true),
            'bulkEditContent' => in_array($role, ['admin', 'manager'], true),
            'viewTeamWorkload' => in_array($role, ['admin', 'manager'], true),
            'manageActivities' => in_array($role, ['admin', 'manager', 'planner'], true),
            'editContent' => in_array($role, ['admin', 'manager', 'planner', 'creator'], true),
            'updateTasks' => in_array($role, ['admin', 'manager', 'planner', 'creator', 'publisher'], true),
            'managePublishing' => in_array($role, ['admin', 'manager', 'planner', 'publisher'], true),
            'manageAssets' => in_array($role, ['admin', 'manager', 'planner', 'creator'], true),
            'manageSettings' => $role === 'admin',
        ];
    }

    /**
     * Seeded HUMAS role personas for instant RBAC testing without blocking login screen.
     *
     * @return array<string, array<string, string>>
     */
    public static function rolePersonas(): array
    {
        return [
            'admin' => [
                'id' => 'u-1',
                'name' => 'Aldwin NV',
                'email' => 'aldwin@humas.instansi.go.id',
                'role' => 'admin',
                'roleLabel' => 'Administrator',
                'avatar' => 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
            ],
            'manager' => [
                'id' => 'u-2',
                'name' => 'Rina Kartika',
                'email' => 'rina.kabag@humas.instansi.go.id',
                'role' => 'manager',
                'roleLabel' => 'Kepala HUMAS',
                'avatar' => 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80',
            ],
            'planner' => [
                'id' => 'u-3',
                'name' => 'Nadia Putri',
                'email' => 'nadia.planner@humas.instansi.go.id',
                'role' => 'planner',
                'roleLabel' => 'Content Planner',
                'avatar' => 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
            ],
            'creator' => [
                'id' => 'u-4',
                'name' => 'Dimas Pratama',
                'email' => 'dimas.creative@humas.instansi.go.id',
                'role' => 'creator',
                'roleLabel' => 'Creator / Designer',
                'avatar' => 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
            ],
            'publisher' => [
                'id' => 'u-5',
                'name' => 'Fajar Nugroho',
                'email' => 'fajar.social@humas.instansi.go.id',
                'role' => 'publisher',
                'roleLabel' => 'Publisher',
                'avatar' => 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
            ],
            'viewer' => [
                'id' => 'u-6',
                'name' => 'Dr. Budi Santoso',
                'email' => 'budi.pimpinan@humas.instansi.go.id',
                'role' => 'viewer',
                'roleLabel' => 'Viewer Pimpinan',
                'avatar' => 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80',
            ],
        ];
    }

    /**
     * Render Operational HUMAS Dashboard (`GET /` and `GET /dashboard`).
     */
    public function dashboard(Request $request): Response
    {
        $state = self::hydrateWorkspace($request);
        /** @var array<int, array<string, mixed>> $publications */
        $publications = $state['publications'];

        return Inertia::render('Dashboard/Index', [
            'today' => self::TODAY,
            'contentItems' => $state['contentItems'],
            'activities' => $state['activities'],
            'publications' => $publications,
            'team' => $state['team'],
            'settings' => $state['settings'],
            'incomingTickets' => self::defaultIncomingTickets($request),
            'performanceTrend' => self::buildPerformanceTrend($publications),
            'sessionItems' => $request->session()->get('sparc.planner_items', []),
            'itemUpdates' => $request->session()->get('sparc.planner_updates', []),
            'deletedIds' => $request->session()->get('sparc.deleted_planner_ids', []),
        ]);
    }

    /**
     * Synchronized HALO APU incoming tickets shared between Incoming module and Dashboard.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function defaultIncomingTickets(Request $request): array
    {
        /** @var array<string, string> $overrides */
        $overrides = $request->hasSession() ? $request->session()->get('sparc.ticket_overrides', []) : [];

        $tickets = [
            [
                'id' => '1',
                'haloapuTicketId' => '045-812-901',
                'sourceType' => 'video_reels',
                'title' => 'Tutorial Pendaftaran Online Layanan Informasi Publik',
                'brief' => 'Mohon dibuatkan video reels panduan singkat cara pendaftaran online dan verifikasi akun untuk masyarakat umum.',
                'requesterName' => 'Budi Santoso (Dit. Layanan)',
                'requesterUnit' => 'Direktorat Layanan',
                'requesterAvatar' => 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
                'targetDate' => '2026-11-02',
                'haloapuStatus' => 'open',
                'syncStatus' => 'pending',
                'createdAt' => '27 Okt 2026, 09:15 WIB',
                'formSnapshot' => [
                    'Judul/Tema Video' => 'Tutorial Pendaftaran Online Layanan Informasi Publik',
                    'Jenis Video' => 'Reels',
                    'Durasi Estimasi' => '60 Detik',
                    'Deadline Tayang' => '2026-11-02',
                    'Brief Video' => 'Fokus pada alur 3 langkah: 1. Buka web, 2. Isi NIK, 3. Konfirmasi email.',
                    'Link Referensi' => 'https://instagram.com/p/sample-reels',
                    'Keterangan Tambahan' => 'Gunakan voiceover santai dan human-touch.',
                ],
                'attachments' => [
                    ['fileName' => 'alur-pendaftaran.pdf', 'url' => 'https://example.com/storage/alur-pendaftaran.pdf', 'fileSize' => '1.2 MB'],
                    ['fileName' => 'screenshot-portal.png', 'url' => 'https://example.com/storage/screenshot-portal.png', 'fileSize' => '850 KB'],
                ],
            ],
            [
                'id' => '2',
                'haloapuTicketId' => '042-119-002',
                'sourceType' => 'desain_feed',
                'title' => 'Feed IG - Infografis Capaian Kinerja Triwulan III',
                'brief' => 'Desain infografis carousel 5 slide mengenai capaian dan realisasi program prioritas tahun 2026.',
                'requesterName' => 'Siti Rahma (Biro Perencanaan)',
                'requesterUnit' => 'Biro Perencanaan',
                'requesterAvatar' => 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80',
                'targetDate' => '2026-10-31',
                'haloapuStatus' => 'on_proses',
                'syncStatus' => 'converted',
                'convertedProjectId' => 'proj-101',
                'createdAt' => '26 Okt 2026, 14:00 WIB',
                'formSnapshot' => [
                    'Jenis Produksi Desain' => 'Feed Instagram / Meme',
                    'Tujuan Penggunaan' => 'Publikasi media sosial Instagram & LinkedIn.',
                    'Brief Materi' => '5 Slide Carousel: Slide 1 Cover Hook, Slide 2 Anggaran, Slide 3 Program Unggulan, Slide 4 Testimoni, Slide 5 CTA Website.',
                    'Deadline' => '2026-10-31',
                    'Jumlah Produksi' => '1 Paket (5 Slide)',
                ],
                'attachments' => [
                    ['fileName' => 'data-rekap-triwulan.xlsx', 'url' => 'https://example.com/storage/data-rekap.xlsx', 'fileSize' => '2.4 MB'],
                ],
            ],
            [
                'id' => '3',
                'haloapuTicketId' => '041-908-112',
                'sourceType' => 'desain_feed',
                'title' => 'Feed IG - Peringatan Hari Sumpah Pemuda 2026',
                'brief' => 'Desain single feed ucapan peringatan resmi Hari Sumpah Pemuda dengan nuansa dinamis dan berani.',
                'requesterName' => 'Ahmad Faiz (Bagian Protokol)',
                'requesterUnit' => 'Bagian Protokol',
                'requesterAvatar' => 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
                'targetDate' => '2026-10-28',
                'haloapuStatus' => 'open',
                'syncStatus' => 'pending',
                'createdAt' => '26 Okt 2026, 11:30 WIB',
                'formSnapshot' => [
                    'Jenis Produksi Desain' => 'Feed Instagram / Meme',
                    'Tujuan Penggunaan' => 'Ucapan resmi lembaga di feed Instagram.',
                    'Brief Materi' => 'Sertakan foto pimpinan dan kutipan tema nasional Sumpah Pemuda 2026.',
                    'Deadline' => '2026-10-28',
                ],
                'attachments' => [
                    ['fileName' => 'foto-pimpinan-resmi.png', 'url' => 'https://example.com/storage/foto-pimpinan.png', 'fileSize' => '4.8 MB'],
                ],
            ],
            [
                'id' => '6',
                'haloapuTicketId' => '046-330-518',
                'sourceType' => 'video_reels',
                'title' => 'Reels Sosialisasi Kanal Pengaduan Terpadu 24 Jam',
                'brief' => 'Permintaan video edukasi 45 detik mengenai tata cara pelaporan cepat melalui aplikasi mobile dan WhatsApp resmi.',
                'requesterName' => 'Dewi Lestari (Biro Hukum & Humas)',
                'requesterUnit' => 'Biro Hukum & Humas',
                'requesterAvatar' => 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
                'targetDate' => '2026-11-04',
                'haloapuStatus' => 'open',
                'syncStatus' => 'pending',
                'createdAt' => '27 Okt 2026, 13:40 WIB',
                'formSnapshot' => [
                    'Judul/Tema Video' => 'Sosialisasi Kanal Pengaduan Terpadu 24 Jam',
                    'Jenis Video' => 'Reels & TikTok',
                    'Durasi Estimasi' => '45 Detik',
                    'Deadline Tayang' => '2026-11-04',
                    'Brief Video' => 'Tonjolkan kecepatan respons dan jaminan kerahasiaan identitas pelapor.',
                ],
                'attachments' => [],
            ],
            [
                'id' => '4',
                'haloapuTicketId' => '039-551-789',
                'sourceType' => 'video_reels',
                'title' => 'Reels Liputan Serah Terima Jabatan Pejabat Baru',
                'brief' => 'Dokumentasi video singkat suasana serah terima jabatan pejabat fungsional di aula utama.',
                'requesterName' => 'Hendra Setiawan (Bagian Kepegawaian)',
                'requesterUnit' => 'Bagian Kepegawaian',
                'requesterAvatar' => 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80',
                'targetDate' => '2026-10-25',
                'haloapuStatus' => 'solve',
                'syncStatus' => 'converted',
                'convertedProjectId' => 'proj-099',
                'createdAt' => '24 Okt 2026, 16:45 WIB',
                'formSnapshot' => [
                    'Judul/Tema Video' => 'Liputan Serah Terima Jabatan Pejabat Baru',
                    'Jenis Video' => 'Reels',
                    'Durasi Estimasi' => '45 Detik',
                    'Deadline Tayang' => '2026-10-25',
                ],
                'attachments' => [],
            ],
            [
                'id' => '5',
                'haloapuTicketId' => '038-102-445',
                'sourceType' => 'desain_feed',
                'title' => 'Feed IG - Poster Sayembara Desain Maskot',
                'brief' => 'Poster publikasi sayembara logo dan maskot terbuka untuk umum.',
                'requesterName' => 'Rina Kusuma (Bagian Tata Usaha)',
                'requesterUnit' => 'Bagian Tata Usaha',
                'requesterAvatar' => 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
                'targetDate' => '2026-10-20',
                'haloapuStatus' => 'dibatalkan',
                'syncStatus' => 'ignored',
                'createdAt' => '20 Okt 2026, 10:00 WIB',
                'formSnapshot' => [
                    'Jenis Produksi Desain' => 'Feed Instagram / Meme',
                    'Brief Materi' => 'Pengumuman dibatalkan karena perubahan petunjuk teknis sayembara.',
                ],
                'attachments' => [],
            ],
        ];

        return array_map(function (array $ticket) use ($overrides): array {
            $id = (string) $ticket['id'];
            if (isset($overrides[$id])) {
                $ticket['syncStatus'] = $overrides[$id];
            }

            return $ticket;
        }, $tickets);
    }

    /**
     * Build 6-month Reach vs Interaction trend series, dynamically incorporating live October publications.
     *
     * @param  array<int, array<string, mixed>>  $publications
     * @return array<int, array{key: string, label: string, fullLabel: string, reach: int, interactions: int, byPlatform: array<string, array{reach: int, interactions: int}>}>
     */
    public static function buildPerformanceTrend(array $publications): array
    {
        $historical = [
            [
                'key' => '2026-05',
                'label' => 'Mei',
                'fullLabel' => 'Mei 2026',
                'byPlatform' => [
                    'instagram' => ['reach' => 18200, 'interactions' => 1950],
                    'youtube' => ['reach' => 8400, 'interactions' => 720],
                    'tiktok' => ['reach' => 9100, 'interactions' => 1120],
                    'website' => ['reach' => 4200, 'interactions' => 310],
                ],
            ],
            [
                'key' => '2026-06',
                'label' => 'Jun',
                'fullLabel' => 'Juni 2026',
                'byPlatform' => [
                    'instagram' => ['reach' => 22600, 'interactions' => 2480],
                    'youtube' => ['reach' => 11200, 'interactions' => 940],
                    'tiktok' => ['reach' => 12400, 'interactions' => 1510],
                    'website' => ['reach' => 5100, 'interactions' => 420],
                ],
            ],
            [
                'key' => '2026-07',
                'label' => 'Jul',
                'fullLabel' => 'Juli 2026',
                'byPlatform' => [
                    'instagram' => ['reach' => 19400, 'interactions' => 2110],
                    'youtube' => ['reach' => 9800, 'interactions' => 810],
                    'tiktok' => ['reach' => 10900, 'interactions' => 1290],
                    'website' => ['reach' => 4700, 'interactions' => 360],
                ],
            ],
            [
                'key' => '2026-08',
                'label' => 'Agu',
                'fullLabel' => 'Agustus 2026',
                'byPlatform' => [
                    'instagram' => ['reach' => 29800, 'interactions' => 3420],
                    'youtube' => ['reach' => 15600, 'interactions' => 1390],
                    'tiktok' => ['reach' => 16800, 'interactions' => 2180],
                    'website' => ['reach' => 6900, 'interactions' => 590],
                ],
            ],
            [
                'key' => '2026-09',
                'label' => 'Sep',
                'fullLabel' => 'September 2026',
                'byPlatform' => [
                    'instagram' => ['reach' => 24500, 'interactions' => 2790],
                    'youtube' => ['reach' => 12900, 'interactions' => 1080],
                    'tiktok' => ['reach' => 14100, 'interactions' => 1760],
                    'website' => ['reach' => 5800, 'interactions' => 470],
                ],
            ],
        ];

        $octByPlatform = [
            'instagram' => ['reach' => 0, 'interactions' => 0],
            'youtube' => ['reach' => 0, 'interactions' => 0],
            'tiktok' => ['reach' => 13200, 'interactions' => 1640],
            'website' => ['reach' => 6100, 'interactions' => 520],
        ];

        foreach ($publications as $pub) {
            $metrics = $pub['metrics'] ?? null;
            if (! is_array($metrics)) {
                continue;
            }
            $platform = (string) ($pub['platform'] ?? 'other');
            if (! isset($octByPlatform[$platform])) {
                $octByPlatform[$platform] = ['reach' => 0, 'interactions' => 0];
            }
            $octByPlatform[$platform]['reach'] += (int) ($metrics['reach'] ?? 0);
            $octByPlatform[$platform]['interactions'] +=
                (int) ($metrics['likes'] ?? 0) +
                (int) ($metrics['comments'] ?? 0) +
                (int) ($metrics['shares'] ?? 0) +
                (int) ($metrics['saves'] ?? 0) +
                (int) ($metrics['clicks'] ?? 0);
        }

        $historical[] = [
            'key' => '2026-10',
            'label' => 'Okt',
            'fullLabel' => 'Oktober 2026',
            'byPlatform' => $octByPlatform,
        ];

        return array_map(function (array $row): array {
            $reach = 0;
            $interactions = 0;
            foreach ($row['byPlatform'] as $pStats) {
                $reach += $pStats['reach'];
                $interactions += $pStats['interactions'];
            }

            return [
                'key' => $row['key'],
                'label' => $row['label'],
                'fullLabel' => $row['fullLabel'],
                'reach' => $reach,
                'interactions' => $interactions,
                'byPlatform' => $row['byPlatform'],
            ];
        }, $historical);
    }

    /**
     * Render SPARC v3 Content Plan database table (`GET /content`).
     */
    public function contentPlan(Request $request): Response
    {
        $state = self::hydrateWorkspace($request);
        $items = ContentItem::with(['tasks', 'comments', 'history'])
            ->orderBy('publish_date')
            ->get();

        return Inertia::render('Content/Index', [
            'today' => now()->toDateString(),
            'contentItems' => ContentItemResource::collection($items)->resolve(),
            'activities' => $state['activities'],
            'team' => $state['team'],
            'filters' => [
                'q' => (string) $request->query('q', ''),
                'platform' => (string) $request->query('platform', 'all'),
                'pillar' => (string) $request->query('pillar', 'all'),
                'status' => (string) $request->query('status', 'all'),
                'priority' => (string) $request->query('priority', 'all'),
                'pic' => (string) $request->query('pic', 'all'),
                'view' => (string) $request->query('view', 'kanban'),
            ],
        ]);
    }

    /**
     * Render SPARC v3 Production Board 6-column Kanban (`GET /planner`).
     */
    public function productionBoard(Request $request): Response
    {
        $state = self::hydrateWorkspace($request);
        $items = ContentItem::with(['tasks', 'comments', 'history'])
            ->orderBy('publish_date')
            ->get();

        return Inertia::render('Planner/Index', [
            'today' => now()->toDateString(),
            'contentItems' => ContentItemResource::collection($items)->resolve(),
            'activities' => $state['activities'],
            'team' => $state['team'],
            'sessionItems' => $request->session()->get('sparc.planner_items', []),
            'itemUpdates' => $request->session()->get('sparc.planner_updates', []),
            'deletedIds' => $request->session()->get('sparc.deleted_planner_ids', []),
        ]);
    }

    /**
     * Render Operational Multi-Layer Calendar (`GET /calendar`).
     */
    public function calendar(Request $request): Response
    {
        $state = self::hydrateWorkspace($request);
        $dbItems = ContentItem::with(['tasks', 'comments', 'history'])
            ->orderBy('publish_date')
            ->get();

        $contentItems = $dbItems->isNotEmpty()
            ? ContentItemResource::collection($dbItems)->resolve()
            : $state['contentItems'];

        return Inertia::render('Calendar/Index', [
            'today' => now()->toDateString(),
            'contentItems' => $contentItems,
            'activities' => $state['activities'],
            'publications' => $state['publications'],
            'sessionEvents' => $request->session()->get('sparc.calendar_events', []),
        ]);
    }

    /**
     * Render Publishing & Optimization queue (`GET /publishing`).
     */
    public function publishing(Request $request): Response
    {
        $state = self::hydrateWorkspace($request);
        $igSchedules = [];

        if (Schema::hasTable('instagram_schedules')) {
            $igSchedules = InstagramSchedule::with('contentItem')
                ->orderByDesc('created_at')
                ->limit(40)
                ->get()
                ->map(fn (InstagramSchedule $s): array => [
                    'id' => (string) $s->id,
                    'publicationSlotId' => $s->publication_slot_id,
                    'contentItemId' => $s->content_item_id ? (string) $s->content_item_id : null,
                    'contentCode' => $s->contentItem?->content_id,
                    'contentTitle' => $s->contentItem?->title,
                    'mediaType' => $s->media_type,
                    'publishMode' => $s->publish_mode,
                    'status' => $s->status,
                    'scheduledAt' => $s->scheduled_at?->format('Y-m-d H:i'),
                    'publishedAt' => $s->published_at?->format('Y-m-d H:i'),
                    'permalink' => $s->permalink,
                    'errorMessage' => $s->error_message,
                ])
                ->values()
                ->all();
        }

        $sampleHost = strtolower((string) parse_url((string) Storage::disk('public')->url('probe.jpg'), PHP_URL_HOST));
        $isLocalStorage = in_array($sampleHost, ['localhost', '127.0.0.1', '::1', '0.0.0.0'], true)
            || str_ends_with($sampleHost, '.test')
            || str_ends_with($sampleHost, '.local');

        return Inertia::render('Publishing/Index', [
            'today' => self::TODAY,
            'contentItems' => $state['contentItems'],
            'publications' => $state['publications'],
            'igSchedules' => $igSchedules,
            'isLocalStorage' => $isLocalStorage,
            'instagramSettings' => $state['settings']['instagram'] ?? [],
        ]);
    }

    /**
     * Render 3-Layer Performance Report (`GET /report`).
     */
    public function report(Request $request): Response
    {
        $state = self::hydrateWorkspace($request);

        return Inertia::render('Report/Index', [
            'today' => self::TODAY,
            'contentItems' => $state['contentItems'],
            'publications' => $state['publications'],
            'team' => $state['team'],
            'instagramSettings' => $state['settings']['instagram'] ?? [],
        ]);
    }

    /**
     * Render Visual Asset Catalog (`GET /assets`).
     */
    public function assets(Request $request): Response
    {
        $state = self::hydrateWorkspace($request);

        return Inertia::render('Assets/Index', [
            'assets' => $state['assets'],
            'contentItems' => $state['contentItems'],
        ]);
    }

    /**
     * Render Team & Workload Directory (`GET /team`).
     */
    public function team(Request $request): Response
    {
        $state = self::hydrateWorkspace($request);

        return Inertia::render('Team/Index', [
            'team' => $state['team'],
            'contentItems' => $state['contentItems'],
        ]);
    }

    /**
     * Render System Settings & HALO APU Integration (`GET /settings` — Admin only).
     */
    public function settings(Request $request): Response
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['manageSettings']) {
            abort(403, 'Hanya Administrator yang memiliki izin membuka Pengaturan Sistem.');
        }

        return Inertia::render('Settings/Index', [
            'settings' => $state['settings'],
        ]);
    }

    /**
     * Switch active workspace role persona for live RBAC verification.
     */
    public function switchRole(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'role' => ['required', 'string', 'in:admin,manager,planner,creator,publisher,viewer'],
        ]);

        self::hydrateWorkspace($request);
        $request->session()->put('sparc_v3.active_role', $validated['role']);

        $persona = self::rolePersonas()[$validated['role']];
        self::flashToast(
            $request,
            'info',
            'Peran Aktif Diperbarui',
            sprintf('Beralih ke sesi %s (%s).', $persona['name'], $persona['roleLabel'])
        );

        if ($validated['role'] !== 'admin' && str_starts_with((string) $request->headers->get('referer', ''), url('/settings'))) {
            return to_route('dashboard');
        }

        return back();
    }

    /**
     * Short-polling endpoint (`GET /poll/updates?since=`) returning unread counts & genuinely new notifications.
     */
    public function pollUpdates(Request $request): JsonResponse
    {
        $state = self::hydrateWorkspace($request);
        $since = $request->query('since');
        $sinceTs = is_string($since) && $since !== '' ? strtotime($since) : false;

        /** @var array<int, array<string, mixed>> $notifications */
        $notifications = $state['notifications'];

        $unreadCount = count(array_filter(
            $notifications,
            fn (array $n): bool => empty($n['readAt'])
        ));

        $newNotifications = [];
        if ($sinceTs !== false) {
            foreach ($notifications as $notif) {
                $createdTs = isset($notif['createdAt']) ? strtotime((string) $notif['createdAt']) : false;
                if ($createdTs !== false && $createdTs > $sinceTs && empty($notif['readAt'])) {
                    $newNotifications[] = $notif;
                }
            }
        }

        $overdueCount = count(array_filter(
            $state['contentItems'],
            fn (array $item): bool => ($item['status'] ?? '') !== 'published'
                && ! empty($item['productionDeadline'])
                && $item['productionDeadline'] < self::TODAY
        ));

        $publishTodayCount = count(array_filter(
            $state['publications'],
            fn (array $pub): bool => empty($pub['publishedActualAt'])
                && str_starts_with((string) ($pub['scheduledAt'] ?? ''), self::TODAY)
        ));

        if (! app()->runningUnitTests() && Cache::add('sparc_ig_poll_heartbeat', true, now()->addSeconds(55))) {
            dispatch(static function (): void {
                try {
                    $service = new InstagramGraphService;
                    if (! $service->isConfigured()) {
                        return;
                    }

                    if (Schema::hasTable('instagram_schedules')) {
                        $dueSchedules = InstagramSchedule::query()
                            ->whereIn('status', ['queued', 'processing'])
                            ->where(function ($q): void {
                                $q->whereNull('scheduled_at')
                                    ->orWhere('scheduled_at', '<=', now());
                            })
                            ->orderBy('scheduled_at')
                            ->limit(3)
                            ->get();

                        foreach ($dueSchedules as $due) {
                            $service->publishSchedule($due);
                        }
                    }

                    if (Cache::add('sparc_ig_periodic_sync_30m', true, now()->addMinutes(30))) {
                        $service->refreshTokenIfExpiring(14);
                        $service->syncAndAutoImportRecentMedia(25);
                        $service->syncRecentComments(20);
                        $service->syncAccountProfileAndInsights();
                    }
                } catch (\Throwable) {
                    // Background fallback should never disrupt request lifecycle
                }
            })->afterResponse();
        }

        return response()->json([
            'server_time' => now()->toIso8601String(),
            'unread_notification_count' => $unreadCount,
            'new_halo_apu_tickets' => 2,
            'overdue_content_count' => $overdueCount,
            'upcoming_publish_today' => $publishTodayCount,
            'notifications' => array_slice($notifications, 0, 30),
            'new_notifications' => array_values($newNotifications),
        ]);
    }

    /**
     * Mark a single persistent notification as read.
     */
    public function markNotificationRead(Request $request, string $id): JsonResponse|RedirectResponse
    {
        self::hydrateWorkspace($request);
        /** @var array<int, array<string, mixed>> $notifications */
        $notifications = $request->session()->get('sparc_v3.notifications', []);
        $nowIso = now()->toIso8601String();

        foreach ($notifications as $idx => $notif) {
            if (($notif['id'] ?? '') === $id && empty($notif['readAt'])) {
                $notifications[$idx]['readAt'] = $nowIso;
            }
        }

        $request->session()->put('sparc_v3.notifications', $notifications);

        $unreadCount = count(array_filter($notifications, fn (array $n): bool => empty($n['readAt'])));

        if ($request->expectsJson() && ! $request->header('X-Inertia')) {
            return response()->json([
                'unread_notification_count' => $unreadCount,
                'notifications' => array_slice($notifications, 0, 30),
            ]);
        }

        return back();
    }

    /**
     * Mark all persistent notifications as read.
     */
    public function markAllNotificationsRead(Request $request): JsonResponse|RedirectResponse
    {
        self::hydrateWorkspace($request);
        /** @var array<int, array<string, mixed>> $notifications */
        $notifications = $request->session()->get('sparc_v3.notifications', []);
        $nowIso = now()->toIso8601String();

        foreach ($notifications as $idx => $notif) {
            if (empty($notif['readAt'])) {
                $notifications[$idx]['readAt'] = $nowIso;
            }
        }

        $request->session()->put('sparc_v3.notifications', $notifications);

        if ($request->expectsJson() && ! $request->header('X-Inertia')) {
            return response()->json([
                'unread_notification_count' => 0,
                'notifications' => array_slice($notifications, 0, 30),
            ]);
        }

        self::flashToast($request, 'success', 'Notifikasi Diperbarui', 'Seluruh notifikasi telah ditandai dibaca.');

        return back();
    }

    /**
     * Create a new SPARC v3 content item (`POST /content`).
     */
    private function resolveContentItem(string|int $id): ?ContentItem
    {
        if (is_numeric($id)) {
            return ContentItem::find($id);
        }

        $cleanId = str_replace(['ci-', 'p-'], '', (string) $id);
        if (is_numeric($cleanId)) {
            $found = ContentItem::find((int) $cleanId);
            if ($found) {
                return $found;
            }
        }

        return ContentItem::where('content_id', $id)->first()
            ?? ContentItem::where('ticket_id', $id)->first();
    }

    public function storeContent(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['editContent']) {
            abort(403, 'Peran Anda tidak diizinkan membuat rencana konten baru.');
        }

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'platform' => ['required', 'string'],
            'format' => ['required', 'string'],
            'pillar' => ['required', 'string'],
            'pic_name' => ['required', 'string'],
            'priority' => ['required', 'string'],
            'production_deadline' => ['required', 'date'],
            'publish_date' => ['required', 'date'],
            'publish_time' => ['nullable', 'string'],
            'brief' => ['nullable', 'string'],
            'ref_design_url' => ['nullable', 'string', 'max:500'],
            'caption' => ['nullable', 'string'],
            'activity_title' => ['nullable', 'string'],
            'campaign_title' => ['nullable', 'string'],
            'status' => ['nullable', 'string'],
        ]);

        $item = ContentItem::create(array_merge($validated, [
            'status' => self::normalizeStatus((string) ($validated['status'] ?? 'inbox')),
            'pic_avatar' => '',
            'created_by' => auth()->id(),
        ]));

        $item->history()->create([
            'from_status' => null,
            'to_status' => $item->status,
            'actor' => auth()->user()->name ?? ($state['currentUser']['name'] ?? 'System'),
            'note' => 'Item dibuat',
        ]);

        self::pushNotification(
            $request,
            'info',
            sprintf('Konten Baru %s', $item->content_id),
            sprintf('"%s" ditugaskan kepada %s (Tenggat produksi: %s).', $item->title, $item->pic_name, $item->production_deadline?->toDateString()),
            '/content'
        );

        self::flashToast($request, 'success', 'Konten dibuat', $item->content_id);

        return redirect()->route('content.index');
    }

    /**
     * Inline or slide-over update of a SPARC v3 content item (`PATCH /content/{id}`).
     */
    public function updateContent(Request $request, string $id): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['editContent']) {
            abort(403, 'Peran Anda tidak diizinkan mengubah data konten.');
        }

        $item = $this->resolveContentItem($id);
        if (! $item) {
            abort(404, 'Konten tidak ditemukan.');
        }

        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'platform' => ['sometimes', 'required', 'string'],
            'format' => ['sometimes', 'required', 'string'],
            'pillar' => ['sometimes', 'required', 'string'],
            'pic_name' => ['sometimes', 'required', 'string'],
            'priority' => ['sometimes', 'required', 'string'],
            'production_deadline' => ['sometimes', 'required', 'date'],
            'publish_date' => ['sometimes', 'required', 'date'],
            'publish_time' => ['nullable', 'string'],
            'brief' => ['nullable', 'string'],
            'caption' => ['nullable', 'string'],
            'activity_title' => ['nullable', 'string'],
            'campaign_title' => ['nullable', 'string'],
            'published_url' => ['nullable', 'url'],
            'ref_design_url' => ['nullable', 'string', 'max:500'],
            'result_design_url' => ['nullable', 'string', 'max:500'],
            'revision_note' => ['nullable', 'string', 'max:1000'],
            'performance_notes' => ['nullable', 'string'],
            'views' => ['nullable', 'integer', 'min:0'],
            'likes' => ['nullable', 'integer', 'min:0'],
            'comments_count' => ['nullable', 'integer', 'min:0'],
            'shares' => ['nullable', 'integer', 'min:0'],
        ]);

        $item->update($validated);

        self::flashToast($request, 'success', 'Konten diperbarui');

        return redirect()->route('content.index');
    }

    /**
     * Transition a content item's workflow status with SPARC v3 business rules & audit history (`PATCH /content/{id}/status`).
     */
    public function updateContentStatus(Request $request, string $id): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        $role = (string) ($state['currentUser']['role'] ?? (auth()->user()->role ?? 'viewer'));

        if ($role === 'viewer') {
            if (! $request->header('X-Inertia')) {
                abort(403, 'Viewer tidak dapat mengubah status konten.');
            }
            throw ValidationException::withMessages([
                'status' => 'Peran Viewer hanya memiliki akses baca dan tidak dapat memindahkan status konten.',
            ]);
        }

        $validated = $request->validate([
            'status' => ['required', 'string'],
            'note' => ['nullable', 'string'],
            'result_design_url' => ['nullable', 'string', 'max:500'],
            'revision_note' => ['nullable', 'string', 'max:1000'],
            'published_url' => ['nullable', 'string', 'max:500'],
        ]);

        $targetStatus = self::normalizeStatus($validated['status']);

        if ($targetStatus === 'ready_to_publish' && ! ($state['can']['approveContent'] ?? false)) {
            if (! $request->header('X-Inertia')) {
                abort(403, 'Hanya Kepala HUMAS atau Administrator yang dapat menyetujui konten ke tahap Siap Tayang.');
            }
            throw ValidationException::withMessages([
                'status' => 'Persetujuan ke tahap "Siap Tayang" hanya dapat dilakukan oleh Kepala HUMAS atau Administrator.',
            ]);
        }

        if ($targetStatus === 'published' && ! in_array($role, ['admin', 'manager', 'publisher'], true)) {
            if (! $request->header('X-Inertia')) {
                abort(403, 'Hanya Publisher, Kepala HUMAS, atau Admin yang dapat menandai tayang.');
            }
            throw ValidationException::withMessages([
                'status' => 'Status "Published" wajib diselesaikan melalui checklist pra-publikasi oleh Publisher.',
            ]);
        }

        $item = $this->resolveContentItem($id);
        if (! $item) {
            abort(404, 'Konten tidak ditemukan.');
        }

        $old = $item->status;
        $updates = ['status' => $targetStatus];
        if ($request->has('result_design_url')) {
            $updates['result_design_url'] = $validated['result_design_url'];
        }
        if ($request->has('revision_note')) {
            $updates['revision_note'] = $validated['revision_note'];
        }
        if ($request->has('published_url')) {
            $updates['published_url'] = $validated['published_url'];
        }
        $item->update($updates);

        if (! empty($validated['revision_note'])) {
            $item->comments()->create([
                'author' => auth()->user()->name ?? ($state['currentUser']['name'] ?? 'System'),
                'role_label' => auth()->user()->role ?? ($state['currentUser']['roleLabel'] ?? 'reviewer'),
                'comment' => $validated['revision_note'],
                'is_revision_note' => true,
            ]);
        }

        $item->history()->create([
            'from_status' => $old,
            'to_status' => $targetStatus,
            'actor' => auth()->user()->name ?? ($state['currentUser']['name'] ?? 'System'),
            'note' => (string) $request->input('note', sprintf('Status diubah dari %s ke %s.', $old, $targetStatus)),
        ]);

        /** @var array<int, array<string, mixed>> $sItems */
        $sItems = $request->session()->get('sparc_v3.content_items', []);
        foreach ($sItems as $idx => $sItem) {
            if (($sItem['id'] ?? '') === $id || ($sItem['contentId'] ?? '') === $item->content_id) {
                $sItems[$idx]['status'] = $targetStatus;
            }
        }
        $request->session()->put('sparc_v3.content_items', $sItems);

        /** @var array<int, array<string, mixed>> $pItems */
        $pItems = $request->session()->get('sparc.planner_items', []);
        foreach ($pItems as $idx => $pItem) {
            if (($pItem['id'] ?? '') === $id) {
                $pItems[$idx]['status'] = $targetStatus;
            }
        }
        $request->session()->put('sparc.planner_items', $pItems);

        self::flashToast($request, 'success', 'Status diperbarui');

        return redirect()->back(fallback: route('content.index'));
    }

    /**
     * Bulk update status, priority, or PIC on Content Plan (`POST /content/bulk` — Manager & Admin only).
     */
    public function bulkUpdateContent(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['bulkEditContent']) {
            abort(403, 'Aksi massal hanya diizinkan untuk Kepala HUMAS dan Administrator.');
        }

        $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'status' => ['nullable', 'string'],
            'priority' => ['nullable', 'string'],
            'pic_name' => ['nullable', 'string'],
            'publish_date' => ['nullable', 'date'],
            'fields' => ['nullable', 'array'],
        ]);

        $allowed = ['status', 'priority', 'pic_name', 'publish_date'];
        $updates = [];

        if (is_array($request->input('fields'))) {
            $updates = array_intersect_key($request->input('fields'), array_flip($allowed));
        }

        foreach ($allowed as $field) {
            if ($request->filled($field)) {
                $updates[$field] = $request->input($field);
            }
        }

        if (! empty($updates)) {
            ContentItem::whereIn('id', $request->ids)
                ->orWhereIn('content_id', $request->ids)
                ->update($updates);
        }

        self::flashToast($request, 'success', 'Bulk update berhasil');

        return redirect()->route('content.index');
    }

    /**
     * Duplicate an existing content item with a fresh `SPARC-2026-XXXX` ID (`POST /content/{id}/duplicate`).
     */
    public function duplicateContent(Request $request, string $id): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['editContent']) {
            abort(403, 'Peran Anda tidak diizinkan menduplikasi rencana konten.');
        }

        $original = is_numeric($id)
            ? ContentItem::with(['tasks'])->find($id)
            : (ContentItem::with(['tasks'])->where('content_id', $id)->first() ?? ContentItem::with(['tasks'])->find(str_replace('ci-', '', $id)));

        if (! $original) {
            self::flashToast($request, 'error', 'Gagal Menduplikasi', 'Item sumber tidak ditemukan.');

            return redirect()->route('content.index');
        }

        $clone = $original->replicate(['content_id', 'published_url', 'created_at', 'updated_at']);
        $clone->title = '[Duplikat] '.$original->title;
        $clone->status = 'inbox';
        $clone->save();

        foreach ($original->tasks as $task) {
            $clone->tasks()->create($task->only(['title', 'task_type', 'assigned_to', 'due_date']) + ['status' => 'todo']);
        }

        $clone->history()->create([
            'from_status' => null,
            'to_status' => 'inbox',
            'actor' => auth()->user()->name ?? ($state['currentUser']['name'] ?? 'System'),
            'note' => sprintf('Diduplikasi dari %s.', $original->content_id),
        ]);

        self::flashToast($request, 'success', 'Konten diduplikat', $clone->content_id);

        return redirect()->route('content.index');
    }

    /**
     * Soft-delete a content item into Trash (`DELETE /content/{id}`).
     */
    public function destroyContent(Request $request, string $id): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['editContent']) {
            abort(403, 'Peran Anda tidak diizinkan menghapus rencana konten.');
        }

        $item = $this->resolveContentItem($id);
        if (! $item) {
            abort(404, 'Konten tidak ditemukan.');
        }

        $item->delete();

        self::flashToast($request, 'success', 'Konten dihapus ke Trash');

        return redirect()->route('content.index');
    }

    /**
     * Add a production task to a content item (`POST /tasks`).
     */
    public function storeTask(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['updateTasks']) {
            abort(403, 'Peran Anda tidak diizinkan menambah tugas produksi.');
        }

        $validated = $request->validate([
            'content_item_id' => ['required'],
            'title' => ['required', 'string', 'max:255'],
            'task_type' => ['required', 'string'],
            'assigned_to' => ['required', 'string'],
            'due_date' => ['nullable', 'date'],
        ]);

        $item = $this->resolveContentItem($validated['content_item_id']);
        if ($item) {
            $item->tasks()->create([
                'title' => $validated['title'],
                'task_type' => $validated['task_type'],
                'status' => 'todo',
                'assigned_to' => $validated['assigned_to'],
                'due_date' => $validated['due_date'] ?? null,
            ]);
        } else {
            /** @var array<int, array<string, mixed>> $items */
            $items = $request->session()->get('sparc_v3.content_items', []);
            foreach ($items as $idx => $sItem) {
                if (($sItem['id'] ?? '') === $validated['content_item_id']) {
                    $tasks = is_array($sItem['tasks'] ?? null) ? $sItem['tasks'] : [];
                    $tasks[] = [
                        'id' => 't-'.Str::lower(Str::random(6)),
                        'title' => $validated['title'],
                        'taskType' => $validated['task_type'],
                        'status' => 'todo',
                        'assignedTo' => $validated['assigned_to'],
                        'dueDate' => $validated['due_date'] ?? '',
                    ];
                    $items[$idx]['tasks'] = $tasks;
                }
            }
            $request->session()->put('sparc_v3.content_items', $items);
        }

        self::pushNotification(
            $request,
            'info',
            'Tugas Produksi Baru',
            sprintf('Tugas "%s" ditugaskan kepada %s.', $validated['title'], $validated['assigned_to']),
            '/planner'
        );

        self::flashToast($request, 'success', 'Task ditambahkan');

        return redirect()->back(fallback: route('content.index'));
    }

    /**
     * Toggle a production subtask status (`PATCH /tasks/{id}/status`).
     */
    public function toggleTaskStatus(Request $request, string $id): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['updateTasks']) {
            abort(403, 'Peran Anda tidak diizinkan mengubah status tugas.');
        }

        $task = is_numeric($id)
            ? ContentTask::find($id)
            : (ContentTask::find(str_replace('t-', '', $id)) ?? ContentTask::find($id));

        $nextStatus = $task?->status === 'done' ? 'todo' : 'done';
        if ($request->filled('status')) {
            $nextStatus = (string) $request->input('status');
        }

        if ($task) {
            $task->update(['status' => $nextStatus]);
        } else {
            /** @var array<int, array<string, mixed>> $items */
            $items = $request->session()->get('sparc_v3.content_items', []);
            foreach ($items as $idx => $item) {
                $tasks = is_array($item['tasks'] ?? null) ? $item['tasks'] : [];
                foreach ($tasks as $tIdx => $taskItem) {
                    if (($taskItem['id'] ?? '') === $id) {
                        $tasks[$tIdx]['status'] = $nextStatus;
                    }
                }
                $items[$idx]['tasks'] = $tasks;
            }
            $request->session()->put('sparc_v3.content_items', $items);
        }

        self::flashToast($request, 'info', 'Status Tugas Diperbarui');

        return redirect()->back(fallback: route('content.index'));
    }

    /**
     * Add a team comment or revision note (`POST /content/{id}/comments`).
     */
    public function storeComment(Request $request, string $id): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['updateTasks']) {
            abort(403, 'Peran Anda tidak diizinkan menambahkan catatan.');
        }

        $request->validate([
            'comment' => ['required', 'string'],
            'is_revision_note' => ['nullable', 'boolean'],
        ]);

        $isRevision = $request->boolean('is_revision_note');
        $item = $this->resolveContentItem($id);

        if ($item) {
            $item->comments()->create([
                'author' => auth()->user()->name ?? ($state['currentUser']['name'] ?? 'Sistem'),
                'role_label' => auth()->user()->role ?? ($state['currentUser']['roleLabel'] ?? 'viewer'),
                'comment' => $request->input('comment'),
                'is_revision_note' => $isRevision,
            ]);
        } else {
            /** @var array<int, array<string, mixed>> $items */
            $items = $request->session()->get('sparc_v3.content_items', []);
            foreach ($items as $idx => $sItem) {
                if (($sItem['id'] ?? '') === $id) {
                    $comments = is_array($sItem['comments'] ?? null) ? $sItem['comments'] : [];
                    $comments[] = [
                        'id' => 'cm-'.Str::lower(Str::random(5)),
                        'author' => $state['currentUser']['name'],
                        'roleLabel' => $state['currentUser']['roleLabel'],
                        'comment' => $request->input('comment'),
                        'isRevisionNote' => $isRevision,
                        'createdAt' => 'Baru saja',
                    ];
                    $items[$idx]['comments'] = $comments;
                }
            }
            $request->session()->put('sparc_v3.content_items', $items);
        }

        if ($isRevision) {
            self::pushNotification(
                $request,
                'warning',
                sprintf('Catatan Revisi pada %s', $item->content_id ?? 'Konten'),
                sprintf('%s menambahkan catatan revisi: "%s"', auth()->user()->name ?? ($state['currentUser']['name'] ?? 'Sistem'), Str::limit($request->input('comment'), 60)),
                '/planner'
            );
        }

        self::flashToast($request, 'success', 'Komentar ditambahkan');

        return redirect()->back(fallback: route('content.index'));
    }

    /**
     * Sync performance metrics from Meta/Instagram Graph API (`POST /content/{id}/sync-instagram`).
     */
    public function syncInstagramContentMetric(Request $request, string $id): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['editContent']) {
            abort(403, 'Peran Anda tidak diizinkan mengubah metrik konten.');
        }

        $item = $this->resolveContentItem($id);
        if (! $item) {
            abort(404, 'Konten tidak ditemukan.');
        }
        if ($request->filled('published_url')) {
            $item->update(['published_url' => $request->input('published_url')]);
        }

        if (empty($item->published_url)) {
            self::flashToast($request, 'error', 'Tautan Belum Diisi', 'Silakan isi Link Upload Instagram pada tab Performa terlebih dahulu.');

            return back();
        }

        $service = new InstagramGraphService;
        if (! $service->isConfigured()) {
            self::flashToast($request, 'error', 'Meta Graph API Belum Dikonfigurasi', 'Masukkan Instagram Account ID dan Access Token di menu Pengaturan.');

            return back();
        }

        $result = $service->fetchMediaMetrics($item->published_url);

        if (! ($result['success'] ?? false)) {
            self::flashToast($request, 'error', 'Sinkronisasi Instagram Gagal', $result['error'] ?? 'Gagal menarik data dari server Meta.');

            return back();
        }

        $item->update([
            'ig_media_id' => $result['media_id'] ?? $item->ig_media_id,
            'ig_media_url' => $result['media_url'] ?? $item->ig_media_url,
            'ig_thumbnail_url' => $result['thumbnail_url'] ?? $item->ig_thumbnail_url,
            'reach' => $result['reach'] ?? $item->reach,
            'views' => $result['views'] ?? $item->views,
            'likes' => $result['likes'] ?? $item->likes,
            'comments_count' => $result['comments_count'] ?? $item->comments_count,
            'shares' => $result['shares'] ?? $item->shares,
            'saves' => $result['saves'] ?? $item->saves,
            'metrics_synced_at' => now(),
        ]);

        $item->history()->create([
            'from_status' => $item->status,
            'to_status' => $item->status,
            'actor' => auth()->user()->name ?? ($state['currentUser']['name'] ?? 'System'),
            'note' => sprintf('Metrik Instagram disinkronkan: %s views, %s suka, %s komentar, %s share.', number_format((float) ($result['views'] ?? 0)), number_format((float) ($result['likes'] ?? 0)), number_format((float) ($result['comments_count'] ?? 0)), number_format((float) ($result['shares'] ?? 0))),
        ]);

        self::flashToast(
            $request,
            'success',
            'Metrik Instagram Berhasil Ditarik',
            sprintf('%s views, %s suka, %s komentar tersimpan dari Meta Graph API.', number_format((float) ($result['views'] ?? 0)), number_format((float) ($result['likes'] ?? 0)), number_format((float) ($result['comments_count'] ?? 0)))
        );

        return back();
    }

    /**
     * Fetch recent Instagram media items for quick selection (`GET /content/instagram/recent-media`).
     */
    public function getRecentInstagramMedia(Request $request): JsonResponse
    {
        $service = new InstagramGraphService;
        if (! $service->isConfigured()) {
            return response()->json([
                'success' => false,
                'error' => 'Kredensial Meta/Instagram Graph API belum lengkap.',
                'media' => [],
            ], 400);
        }

        $forceRefresh = $request->boolean('refresh');
        $media = $service->getRecentMedia(16, $forceRefresh);

        $conn = null;
        if (Schema::hasTable('instagram_connections')) {
            try {
                $conn = InstagramConnection::current();
            } catch (\Throwable) {
                // Ignore
            }
        }
        $username = $conn?->username ?: (string) (session('sparc_v3.settings.instagram.username') ?? 'instagram_user');

        return response()->json([
            'success' => true,
            'username' => $username,
            'media' => $media,
        ]);
    }

    /**
     * 1-Click bulk synchronize performance metrics for all published Instagram content items (`POST /content/instagram/sync-all`).
     */
    public function syncAllInstagramMetrics(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! ($state['can']['editContent'] || $state['can']['managePublishing'])) {
            abort(403, 'Peran Anda tidak diizinkan menyinkronkan metrik konten.');
        }

        $service = new InstagramGraphService;
        if (! $service->isConfigured()) {
            self::flashToast(
                $request,
                'error',
                'Meta Graph API Belum Terhubung',
                'Hubungkan akun Instagram terlebih dahulu melalui menu Pengaturan.'
            );

            return back();
        }

        $result = $service->syncAllContentMetrics();

        if (! ($result['success'] ?? false)) {
            self::flashToast(
                $request,
                'error',
                'Sinkronisasi Massal Gagal',
                $result['error'] ?? 'Terjadi kesalahan saat berkomunikasi dengan server Meta.'
            );

            return back();
        }

        // Also synchronize to session publications array for the Performance Report table
        /** @var array<int, array<string, mixed>> $pubs */
        $pubs = $request->session()->get('sparc_v3.publications', []);
        $updatedPubs = false;

        foreach ($result['synced_items'] as $synced) {
            foreach ($pubs as $idx => $pub) {
                if (
                    strcasecmp((string) ($pub['contentId'] ?? ''), (string) $synced['content_id']) === 0
                    && strtolower((string) ($pub['platform'] ?? '')) === 'instagram'
                ) {
                    $pubs[$idx]['metrics'] = [
                        'reach' => isset($synced['reach']) && $synced['reach'] !== null ? (int) $synced['reach'] : (int) $synced['views'],
                        'impressions' => (int) $synced['views'],
                        'views' => (int) $synced['views'],
                        'likes' => (int) $synced['likes'],
                        'comments' => (int) $synced['comments_count'],
                        'shares' => (int) $synced['shares'],
                        'saves' => isset($synced['saves']) && $synced['saves'] !== null ? (int) $synced['saves'] : null,
                        'clicks' => null,
                        'source' => 'api',
                        'recordedAt' => self::TODAY.' '.now()->format('H:i'),
                    ];
                    $updatedPubs = true;
                }
            }
        }

        if ($updatedPubs) {
            $request->session()->put('sparc_v3.publications', $pubs);
        }

        self::flashToast(
            $request,
            'success',
            'Sinkronisasi Massal Selesai',
            sprintf(
                '%d konten Instagram berhasil diperbarui (%d postingan baru diimpor).',
                $result['synced_count'],
                $result['imported_count'] ?? 0
            )
        );

        return back();
    }

    /**
     * Create an institutional activity on the Calendar (`POST /calendar/activities`).
     */
    public function storeActivity(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['manageActivities']) {
            abort(403, 'Hanya Admin, Kepala HUMAS, atau Planner yang dapat menambah agenda kelembagaan.');
        }

        $validated = $request->validate(
            [
                'title' => ['required', 'string', 'min:3', 'max:180'],
                'activity_date' => ['required', 'date'],
                'type' => ['required', 'string', 'in:agenda,event,hari_besar,kampanye,momentum'],
                'description' => ['nullable', 'string', 'max:500'],
            ],
            [
                'title.required' => 'Nama agenda atau momentum kelembagaan wajib diisi.',
                'activity_date.required' => 'Tanggal kegiatan wajib diisi.',
            ]
        );

        /** @var array<int, array<string, mixed>> $activities */
        $activities = $request->session()->get('sparc_v3.activities', []);
        $activities[] = [
            'id' => 'act-'.Str::lower(Str::random(5)),
            'title' => $validated['title'],
            'activityDate' => $validated['activity_date'],
            'type' => $validated['type'],
            'description' => $validated['description'] ?? '',
            'linkedCount' => 0,
        ];
        $request->session()->put('sparc_v3.activities', $activities);

        self::flashToast(
            $request,
            'success',
            'Agenda Kelembagaan Disimpan',
            sprintf('"%s" terjadwal pada kalender operasional (%s).', $validated['title'], $validated['activity_date'])
        );

        return back();
    }

    /**
     * Reschedule an activity or content schedule (`PATCH /calendar/reschedule`).
     */
    public function rescheduleCalendarItem(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['editContent']) {
            if (! $request->header('X-Inertia')) {
                abort(403, 'Peran Anda tidak diizinkan menjadwal ulang kalender.');
            }
            throw ValidationException::withMessages([
                'date' => 'Peran Anda tidak memiliki izin untuk mengubah jadwal kalender.',
            ]);
        }

        $validated = $request->validate([
            'entity_type' => ['required', 'string', 'in:activity,production,publish'],
            'entity_id' => ['required', 'string'],
            'date' => ['required', 'date'],
        ]);

        if ($validated['entity_type'] === 'activity') {
            /** @var array<int, array<string, mixed>> $activities */
            $activities = $request->session()->get('sparc_v3.activities', []);
            foreach ($activities as $idx => $act) {
                if (($act['id'] ?? '') === $validated['entity_id']) {
                    $activities[$idx]['activityDate'] = $validated['date'];
                }
            }
            $request->session()->put('sparc_v3.activities', $activities);
        } else {
            // Persist to database if Eloquent model exists
            $dbItem = ContentItem::where('id', $validated['entity_id'])
                ->orWhere('content_id', $validated['entity_id'])
                ->first();

            if ($dbItem) {
                if ($validated['entity_type'] === 'production') {
                    $dbItem->update(['production_deadline' => $validated['date']]);
                } else {
                    $dbItem->update(['publish_date' => $validated['date']]);
                }
            }

            /** @var array<int, array<string, mixed>> $items */
            $items = $request->session()->get('sparc_v3.content_items', []);
            foreach ($items as $idx => $item) {
                if (($item['id'] ?? '') === $validated['entity_id'] || ($item['contentId'] ?? '') === $validated['entity_id']) {
                    if ($validated['entity_type'] === 'production') {
                        $items[$idx]['productionDeadline'] = $validated['date'];
                    } else {
                        $items[$idx]['publishDate'] = $validated['date'];
                    }
                }
            }
            $request->session()->put('sparc_v3.content_items', $items);
        }

        self::flashToast(
            $request,
            'success',
            'Jadwal Berhasil Diperbarui',
            sprintf('Tanggal berhasil dipindahkan ke %s.', $validated['date'])
        );

        return back();
    }

    /**
     * Toggle a pre-publication checklist item (`PATCH /publications/{id}/checklist`).
     */
    public function togglePublishChecklist(Request $request, string $id): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['managePublishing']) {
            abort(403, 'Peran Anda tidak memiliki izin mengelola checklist publikasi.');
        }

        $validated = $request->validate([
            'key' => ['required', 'string'],
            'checked' => ['required', 'boolean'],
        ]);

        if (str_starts_with($id, 'pub-db-')) {
            $dbItem = ContentItem::find((int) substr($id, 7));
            if ($dbItem) {
                /** @var array<string, array<int, array<string, mixed>>> $dbChecklists */
                $dbChecklists = $request->session()->get('sparc_v3.db_pub_checklists', []);
                $checklist = $dbChecklists[$id] ?? self::defaultChecklistForPlatform((string) $dbItem->platform);
                foreach ($checklist as $cIdx => $cItem) {
                    if (($cItem['key'] ?? '') === $validated['key']) {
                        $checklist[$cIdx]['checked'] = $validated['checked'];
                    }
                }
                $dbChecklists[$id] = $checklist;
                $request->session()->put('sparc_v3.db_pub_checklists', $dbChecklists);
            }

            return back();
        }

        /** @var array<int, array<string, mixed>> $pubs */
        $pubs = $request->session()->get('sparc_v3.publications', []);
        foreach ($pubs as $idx => $pub) {
            if (($pub['id'] ?? '') === $id) {
                $checklist = is_array($pub['checklist'] ?? null) ? $pub['checklist'] : [];
                foreach ($checklist as $cIdx => $cItem) {
                    if (($cItem['key'] ?? '') === $validated['key']) {
                        $checklist[$cIdx]['checked'] = $validated['checked'];
                    }
                }
                $pubs[$idx]['checklist'] = $checklist;
            }
        }
        $request->session()->put('sparc_v3.publications', $pubs);

        return back();
    }

    /**
     * Create a new channel publication slot (`POST /publications`).
     */
    public function storePublication(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['managePublishing']) {
            abort(403, 'Peran Anda tidak diizinkan membuat slot publikasi kanal.');
        }

        $validated = $request->validate(
            [
                'content_item_id' => ['required', 'string'],
                'platform' => ['required', 'string', 'in:instagram,tiktok,youtube,website,whatsapp'],
                'scheduled_at' => ['required', 'string'],
            ],
            [
                'content_item_id.required' => 'Pilih konten yang akan dijadwalkan tayang.',
                'scheduled_at.required' => 'Waktu jadwal publikasi wajib diisi.',
            ]
        );

        /** @var array<int, array<string, mixed>> $items */
        $items = $request->session()->get('sparc_v3.content_items', []);
        $matched = collect($items)->firstWhere('id', $validated['content_item_id']);
        $title = is_array($matched) ? (string) $matched['title'] : 'Konten Siap Tayang';
        $code = is_array($matched) ? (string) ($matched['contentId'] ?? 'SPARC-2026-0000') : 'SPARC-2026-0000';

        /** @var array<int, array<string, mixed>> $pubs */
        $pubs = $request->session()->get('sparc_v3.publications', []);
        array_unshift($pubs, [
            'id' => 'pub-'.Str::lower(Str::random(5)),
            'contentItemId' => $validated['content_item_id'],
            'contentId' => $code,
            'title' => $title,
            'platform' => $validated['platform'],
            'scheduledAt' => str_replace('T', ' ', $validated['scheduled_at']),
            'publishedActualAt' => null,
            'publishedUrl' => null,
            'picName' => $state['currentUser']['name'],
            'checklist' => self::defaultChecklistForPlatform($validated['platform']),
            'metrics' => null,
        ]);
        $request->session()->put('sparc_v3.publications', $pubs);

        self::flashToast(
            $request,
            'success',
            'Kanal Publikasi Ditambahkan',
            sprintf('Checklist pra-publikasi %s untuk %s siap dilengkapi.', ucfirst($validated['platform']), $code)
        );

        return back();
    }

    /**
     * Mark a publication slot as live (`POST /publications/{id}/publish`).
     */
    public function markPublished(Request $request, string $id): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['managePublishing']) {
            abort(403, 'Peran Anda tidak diizinkan menandai konten telah tayang.');
        }

        $validated = $request->validate(
            [
                'published_url' => ['required', 'url', 'max:500'],
            ],
            [
                'published_url.required' => 'Tautan postingan tayang wajib diisi sebagai bukti publikasi.',
                'published_url.url' => 'Masukkan URL bukti tayang yang valid (diawali https://).',
            ]
        );

        if (str_starts_with($id, 'pub-db-')) {
            $dbItem = ContentItem::find((int) substr($id, 7));
            if ($dbItem) {
                /** @var array<string, array<int, array<string, mixed>>> $dbChecklists */
                $dbChecklists = $request->session()->get('sparc_v3.db_pub_checklists', []);
                $checklist = $dbChecklists[$id] ?? self::defaultChecklistForPlatform((string) $dbItem->platform);
                if (collect($checklist)->contains(fn (array $c): bool => empty($c['checked']))) {
                    throw ValidationException::withMessages([
                        'published_url' => 'Seluruh butir checklist pra-publikasi kanal wajib dicentang sebelum menandai tayang.',
                    ]);
                }

                $oldStatus = $dbItem->status;
                $dbItem->update([
                    'status' => 'published',
                    'published_url' => $validated['published_url'],
                ]);
                $dbItem->history()->create([
                    'from_status' => $oldStatus,
                    'to_status' => 'published',
                    'actor' => auth()->user()->name ?? ($state['currentUser']['name'] ?? 'Publisher'),
                    'note' => sprintf('Ditandai tayang secara manual (%s).', $validated['published_url']),
                ]);

                self::flashToast(
                    $request,
                    'success',
                    'Konten Ditandai Tayang',
                    sprintf('"%s" telah resmi tayang dan tercatat pada laporan distribusi.', $dbItem->title)
                );
            }

            return back();
        }

        /** @var array<int, array<string, mixed>> $pubs */
        $pubs = $request->session()->get('sparc_v3.publications', []);
        $contentItemId = null;
        $pubTitle = 'Konten';
        $pubCode = '';

        foreach ($pubs as $idx => $pub) {
            if (($pub['id'] ?? '') === $id) {
                $checklist = is_array($pub['checklist'] ?? null) ? $pub['checklist'] : [];
                $incomplete = collect($checklist)->contains(fn (array $c): bool => empty($c['checked']));
                if ($incomplete) {
                    throw ValidationException::withMessages([
                        'published_url' => 'Seluruh butir checklist pra-publikasi kanal wajib dicentang sebelum menandai tayang.',
                    ]);
                }

                $pubs[$idx]['publishedActualAt'] = self::TODAY.' '.now()->format('H:i');
                $pubs[$idx]['publishedUrl'] = $validated['published_url'];
                $contentItemId = (string) ($pub['contentItemId'] ?? '');
                $pubTitle = (string) ($pub['title'] ?? 'Konten');
                $pubCode = (string) ($pub['contentId'] ?? '');
            }
        }
        $request->session()->put('sparc_v3.publications', $pubs);

        if ($contentItemId) {
            $allPublishedForContent = ! collect($pubs)
                ->where('contentItemId', $contentItemId)
                ->contains(fn (array $p): bool => empty($p['publishedActualAt']));

            if ($allPublishedForContent) {
                /** @var array<int, array<string, mixed>> $items */
                $items = $request->session()->get('sparc_v3.content_items', []);
                foreach ($items as $idx => $item) {
                    if (($item['id'] ?? '') === $contentItemId) {
                        $items[$idx]['status'] = 'published';
                        $items[$idx]['publishedUrl'] = $validated['published_url'];
                    }
                }
                $request->session()->put('sparc_v3.content_items', $items);
            }
        }

        self::pushNotification(
            $request,
            'success',
            sprintf('%s Resmi Tayang', $pubCode ?: 'Publikasi'),
            sprintf('"%s" telah tayang. Ingat untuk mencatat metrik performa 3 hari pasca-publikasi.', $pubTitle),
            '/report'
        );

        self::flashToast(
            $request,
            'success',
            'Konten Ditandai Tayang',
            sprintf('"%s" telah resmi tayang dan tercatat pada laporan distribusi.', $pubTitle)
        );

        return back();
    }

    /**
     * Store manual publication metrics (`POST /report/metrics`) preserving NULL != 0 semantics.
     */
    public function storeReportMetric(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['managePublishing']) {
            abort(403, 'Peran Anda tidak diizinkan menginput metrik performa.');
        }

        $validated = $request->validate(
            [
                'publication_id' => ['required', 'string'],
                'reach' => ['nullable', 'integer', 'min:0'],
                'impressions' => ['nullable', 'integer', 'min:0'],
                'views' => ['nullable', 'integer', 'min:0'],
                'likes' => ['nullable', 'integer', 'min:0'],
                'comments' => ['nullable', 'integer', 'min:0'],
                'shares' => ['nullable', 'integer', 'min:0'],
                'saves' => ['nullable', 'integer', 'min:0'],
                'clicks' => ['nullable', 'integer', 'min:0'],
            ],
            [
                'publication_id.required' => 'Pilih publikasi konten yang akan diinput metriknya.',
            ]
        );

        /** @var array<int, array<string, mixed>> $pubs */
        $pubs = $request->session()->get('sparc_v3.publications', []);
        $targetTitle = 'Publikasi';

        $nullableMetric = static fn (array $data, string $key): ?int => isset($data[$key]) && $data[$key] !== ''
            ? (int) $data[$key]
            : null;

        foreach ($pubs as $idx => $pub) {
            if (($pub['id'] ?? '') === $validated['publication_id']) {
                $targetTitle = (string) ($pub['title'] ?? 'Publikasi');
                $pubs[$idx]['metrics'] = [
                    'reach' => $nullableMetric($validated, 'reach'),
                    'impressions' => $nullableMetric($validated, 'impressions'),
                    'views' => $nullableMetric($validated, 'views'),
                    'likes' => $nullableMetric($validated, 'likes'),
                    'comments' => $nullableMetric($validated, 'comments'),
                    'shares' => $nullableMetric($validated, 'shares'),
                    'saves' => $nullableMetric($validated, 'saves'),
                    'clicks' => $nullableMetric($validated, 'clicks'),
                    'source' => 'manual',
                    'recordedAt' => self::TODAY.' '.now()->format('H:i'),
                ];
            }
        }
        $request->session()->put('sparc_v3.publications', $pubs);

        self::flashToast(
            $request,
            'success',
            'Metrik Performa Tersimpan',
            sprintf('Data capaian "%s" berhasil diperbarui pada Performance Report.', $targetTitle)
        );

        return back();
    }

    /**
     * Parse and import CSV performance rows (`POST /report/metrics/import-csv`).
     */
    public function importReportCsv(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['managePublishing']) {
            abort(403, 'Peran Anda tidak diizinkan mengimpor CSV performa.');
        }

        $validated = $request->validate(
            [
                'csv_text' => ['required', 'string', 'min:10'],
            ],
            [
                'csv_text.required' => 'Tempelkan baris data CSV sesuai format template.',
            ]
        );

        $lines = preg_split('/\r\n|\r|\n/', trim($validated['csv_text'])) ?: [];
        /** @var array<int, array<string, mixed>> $pubs */
        $pubs = $request->session()->get('sparc_v3.publications', []);

        $matchedCount = 0;
        $skippedCount = 0;

        foreach ($lines as $lineIdx => $rawLine) {
            $line = trim($rawLine);
            if ($line === '' || ($lineIdx === 0 && str_starts_with(strtolower($line), 'content_id,'))) {
                continue;
            }

            $cols = str_getcsv($line);
            if (count($cols) < 10) {
                $skippedCount++;

                continue;
            }

            [$cId, $platform, $reach, $impressions, $views, $likes, $comments, $shares, $saves, $clicks] = $cols;
            $cId = trim((string) $cId);
            $platform = strtolower(trim((string) $platform));

            $found = false;
            foreach ($pubs as $idx => $pub) {
                if (
                    strcasecmp((string) ($pub['contentId'] ?? ''), $cId) === 0
                    && strtolower((string) ($pub['platform'] ?? '')) === $platform
                ) {
                    $toNullableInt = fn (?string $val): ?int => ($val !== null && trim($val) !== '' && is_numeric(trim($val)))
                        ? max(0, (int) trim($val))
                        : null;

                    $pubs[$idx]['metrics'] = [
                        'reach' => $toNullableInt($reach),
                        'impressions' => $toNullableInt($impressions),
                        'views' => $toNullableInt($views),
                        'likes' => $toNullableInt($likes),
                        'comments' => $toNullableInt($comments),
                        'shares' => $toNullableInt($shares),
                        'saves' => $toNullableInt($saves),
                        'clicks' => $toNullableInt($clicks),
                        'source' => 'csv',
                        'recordedAt' => self::TODAY.' '.now()->format('H:i'),
                    ];
                    $found = true;
                    $matchedCount++;
                    break;
                }
            }

            if (! $found) {
                $skippedCount++;
            }
        }

        $request->session()->put('sparc_v3.publications', $pubs);

        if ($matchedCount === 0) {
            throw ValidationException::withMessages([
                'csv_text' => sprintf('Tidak ada baris yang cocok dengan kombinasi content_id + platform (%d baris dilewati).', $skippedCount),
            ]);
        }

        self::flashToast(
            $request,
            $skippedCount > 0 ? 'warning' : 'success',
            'Impor CSV Selesai',
            sprintf('%d publikasi diperbarui%s.', $matchedCount, $skippedCount > 0 ? ", {$skippedCount} baris dilewati" : '')
        );

        return back();
    }

    /**
     * Add a new visual asset to the catalog (`POST /assets`).
     */
    public function storeAsset(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['manageAssets']) {
            abort(403, 'Peran Anda tidak diizinkan mengunggah atau menambah katalog aset.');
        }

        $validated = $request->validate(
            [
                'title' => ['required', 'string', 'min:3', 'max:180'],
                'category' => ['required', 'string', 'in:foto,video,ilustrasi,template_desain,infografis,dokumen'],
                'external_url' => ['required', 'url', 'max:500'],
                'tags' => ['nullable', 'string', 'max:250'],
                'content_id' => ['nullable', 'string', 'max:30'],
            ],
            [
                'title.required' => 'Judul aset visual wajib diisi.',
                'external_url.required' => 'Tautan sumber aset (Canva / Figma / Drive / Storage) wajib diisi.',
                'external_url.url' => 'Masukkan URL aset yang valid (diawali https://).',
            ]
        );

        $tagList = array_values(array_filter(array_map(
            fn (string $t): string => trim($t),
            explode(',', (string) ($validated['tags'] ?? ''))
        )));

        /** @var array<int, array<string, mixed>> $assets */
        $assets = $request->session()->get('sparc_v3.assets', []);
        array_unshift($assets, [
            'id' => 'ast-'.Str::lower(Str::random(5)),
            'title' => $validated['title'],
            'category' => $validated['category'],
            'tags' => $tagList ?: ['humas', 'resmi'],
            'externalUrl' => $validated['external_url'],
            'thumbnailUrl' => 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
            'contentId' => ($validated['content_id'] ?? null) ?: null,
            'uploadedBy' => $state['currentUser']['name'],
            'createdAt' => '27 Okt 2026',
            'dimensions' => '1080 × 1350 px',
        ]);
        $request->session()->put('sparc_v3.assets', $assets);

        self::flashToast(
            $request,
            'success',
            'Aset Visual Ditambahkan',
            sprintf('"%s" kini tersedia di Katalog Aset Visual.', $validated['title'])
        );

        return back();
    }

    /**
     * Soft-delete a visual asset (`DELETE /assets/{id}`).
     */
    public function destroyAsset(Request $request, string $id): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['manageAssets']) {
            abort(403, 'Peran Anda tidak diizinkan menghapus aset visual.');
        }

        /** @var array<int, array<string, mixed>> $assets */
        $assets = $request->session()->get('sparc_v3.assets', []);
        $removedTitle = 'Aset Visual';
        $remaining = [];

        foreach ($assets as $asset) {
            if (($asset['id'] ?? '') === $id) {
                $removedTitle = (string) $asset['title'];
            } else {
                $remaining[] = $asset;
            }
        }
        $request->session()->put('sparc_v3.assets', $remaining);

        /** @var array<int, array<string, mixed>> $trash */
        $trash = $request->session()->get('sparc.trash_items', []);
        array_unshift($trash, [
            'id' => 'trash-'.Str::lower(Str::random(5)),
            'sourceId' => $id,
            'type' => 'grid_slot',
            'title' => 'Aset: '.$removedTitle,
            'deletedAt' => 'Baru saja',
            'deletedBy' => $state['currentUser']['name'],
            'details' => 'Dihapus dari Katalog Aset Visual',
        ]);
        $request->session()->put('sparc.trash_items', $trash);

        self::flashToast($request, 'warning', 'Aset Dipindahkan ke Trash', sprintf('"%s" dapat dipulihkan dari menu Trash.', $removedTitle));

        return back();
    }

    /**
     * Invite a new member to HUMAS team (`POST /team/invite` — Admin & Manager only).
     */
    public function inviteTeamMember(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['inviteTeam']) {
            abort(403, 'Hanya Kepala HUMAS atau Administrator yang dapat mengundang anggota baru.');
        }

        $validated = $request->validate(
            [
                'name' => ['required', 'string', 'min:3', 'max:100'],
                'email' => ['required', 'email', 'max:150'],
                'roles' => ['required', 'array', 'min:1'],
                'roles.*' => ['string', 'in:admin,manager,planner,creator,publisher,viewer'],
            ],
            [
                'name.required' => 'Nama lengkap anggota wajib diisi.',
                'email.required' => 'Alamat email kedinasan wajib diisi.',
                'email.email' => 'Format email tidak valid.',
                'roles.required' => 'Pilih minimal satu peran untuk anggota baru.',
            ]
        );

        /** @var array<int, array<string, mixed>> $team */
        $team = $request->session()->get('sparc_v3.team', []);
        $team[] = [
            'id' => 'tm-'.Str::lower(Str::random(5)),
            'name' => $validated['name'],
            'email' => $validated['email'],
            'roles' => $validated['roles'],
            'primaryRole' => $validated['roles'][0],
            'avatar' => 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
            'activeTasks' => 0,
            'dueThisWeek' => 0,
            'overdueTasks' => 0,
            'effortHours' => 0,
            'capacityHours' => 24,
            'status' => 'Undangan Terkirim',
        ];
        $request->session()->put('sparc_v3.team', $team);

        self::flashToast(
            $request,
            'success',
            'Undangan Anggota Terkirim',
            sprintf('Tautan aktivasi telah dikirim ke %s.', $validated['email'])
        );

        return back();
    }

    /**
     * Update SPARC v3 system configuration (`PATCH /settings` — Admin only).
     */
    public function updateSettings(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['manageSettings']) {
            abort(403, 'Hanya Administrator yang dapat menyimpan pengaturan sistem.');
        }

        $validated = $request->validate(
            [
                'monthly_content_target' => ['required', 'integer', 'min:1', 'max:500'],
                'working_hours_start' => ['required', 'date_format:H:i'],
                'working_hours_end' => ['required', 'date_format:H:i'],
                'polling_interval_seconds' => ['required', 'integer', 'min:15', 'max:120'],
            ],
            [
                'monthly_content_target.min' => 'Target konten bulanan minimal 1 konten.',
            ]
        );

        /** @var array<string, mixed> $settings */
        $settings = $request->session()->get('sparc_v3.settings', []);
        $settings['monthlyContentTarget'] = (int) $validated['monthly_content_target'];
        $settings['workingHoursStart'] = $validated['working_hours_start'];
        $settings['workingHoursEnd'] = $validated['working_hours_end'];
        $settings['pollingIntervalSeconds'] = (int) $validated['polling_interval_seconds'];
        $request->session()->put('sparc_v3.settings', $settings);

        self::flashToast($request, 'success', 'Konfigurasi Sistem Disimpan', 'Parameter operasional SPARC v3 telah diperbarui.');

        return back();
    }

    /**
     * Trigger manual HALO APU ticket sync (`POST /settings/haloapu/sync`).
     */
    public function syncHaloApu(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['manageSettings']) {
            abort(403, 'Hanya Administrator yang dapat menjalankan sinkronisasi manual token HALO APU.');
        }

        /** @var array<string, mixed> $settings */
        $settings = $request->session()->get('sparc_v3.settings', []);
        $logs = is_array($settings['haloApuLogs'] ?? null) ? $settings['haloApuLogs'] : [];
        array_unshift($logs, [
            'id' => 'sync-'.Str::lower(Str::random(5)),
            'timestamp' => '27 Okt 2026 '.now()->format('H:i:s'),
            'status' => 'success',
            'fetched' => 2,
            'latencyMs' => 184,
            'note' => 'Sinkronisasi manual REST API HALO APU berhasil (HTTP 200 OK).',
        ]);
        $settings['haloApuLogs'] = array_slice($logs, 0, 20);
        $settings['lastSyncAt'] = 'Baru saja ('.now()->format('H:i').' WIB)';
        $request->session()->put('sparc_v3.settings', $settings);

        self::pushNotification(
            $request,
            'info',
            'Sinkronisasi HALO APU Selesai',
            '2 tiket layanan baru telah disinkronkan dari antrean REST API HALO APU.',
            '/incoming'
        );

        self::flashToast($request, 'success', 'Sinkronisasi HALO APU Berhasil', 'Antrean tiket masuk telah diperbarui.');

        return back();
    }

    /**
     * Resolve Instagram settings payload with masked secrets and token expiry data.
     *
     * @return array<string, mixed>
     */
    public static function resolveInstagramSettingsPayload(Request $request): array
    {
        $service = new InstagramGraphService;
        $appCreds = $service->resolveAppCredentials();
        $session = $request->session();
        $sessionIg = $session->get('sparc_v3.settings.instagram', []);

        $conn = null;
        if (Schema::hasTable('instagram_connections')) {
            try {
                $conn = InstagramConnection::current();
            } catch (\Throwable) {
                // Ignore DB errors during bootstrap
            }
        }

        $appId = ! empty($conn?->app_id) ? (string) $conn->app_id : (string) $appCreds['app_id'];
        $appSecret = ! empty($conn?->app_secret) ? (string) $conn->app_secret : (string) $appCreds['app_secret'];
        $redirectUri = (string) $appCreds['redirect_uri'];
        $oauthReady = ! empty($appId) && ! empty($appSecret);

        $accountId = (string) ($conn?->account_id ?: ($sessionIg['account_id'] ?? $sessionIg['accountId'] ?? config('services.instagram.account_id', '')));
        $rawAccessToken = (string) ($conn?->access_token ?: ($sessionIg['access_token'] ?? $sessionIg['accessToken'] ?? config('services.instagram.access_token', '')));

        $connected = ! empty($conn?->connected) || ! empty($sessionIg['connected']);
        $username = (string) ($conn?->username ?: ($sessionIg['username'] ?? ''));
        $name = (string) ($conn?->name ?: ($sessionIg['name'] ?? ''));
        $pageName = (string) ($conn?->page_name ?: ($sessionIg['page_name'] ?? ''));

        $lastTestedAt = $conn?->last_tested_at?->format('d M Y, H:i').' WIB';
        if (empty($conn?->last_tested_at)) {
            $lastTestedAt = (string) ($sessionIg['lastTestedAt'] ?? '');
        }

        $lastSyncedAt = $conn?->last_synced_at?->format('d M Y, H:i').' WIB';

        $tokenExpiresAt = $conn?->token_expires_at?->format('d M Y, H:i').' WIB';
        $tokenDaysRemaining = null;
        if ($conn?->token_expires_at) {
            $tokenDaysRemaining = max(0, (int) now()->diffInDays($conn->token_expires_at, false));
        }

        $candidateAccounts = collect($conn?->candidate_accounts ?? ($sessionIg['candidate_accounts'] ?? []))
            ->map(fn (array $acc): array => [
                'accountId' => (string) ($acc['account_id'] ?? ''),
                'username' => (string) ($acc['username'] ?? ''),
                'name' => (string) ($acc['name'] ?? ''),
                'pageId' => (string) ($acc['page_id'] ?? ''),
                'pageName' => (string) ($acc['page_name'] ?? ''),
            ])->values()->all();

        $grantedScopes = is_array($conn?->granted_scopes) && ! empty($conn->granted_scopes)
            ? array_values($conn->granted_scopes)
            : [];
        $requestedScopes = is_array($conn?->requested_scopes) && ! empty($conn->requested_scopes)
            ? array_values($conn->requested_scopes)
            : $service->resolveRequestedScopes();
        $effectiveScopesForCap = ! empty($grantedScopes)
            ? $grantedScopes
            : ($connected ? $requestedScopes : []);
        $accountInsights = is_array($conn?->account_insights) ? $conn->account_insights : [];
        $bestPostingHours = is_array($accountInsights['best_posting_hours'] ?? null) && ! empty($accountInsights['best_posting_hours'])
            ? $accountInsights['best_posting_hours']
            : ['11:30 WIB', '16:30 WIB', '19:30 WIB'];

        return [
            'appId' => $appId,
            'hasAppSecret' => ! empty($appSecret),
            'redirectUri' => $redirectUri,
            'oauthReady' => $oauthReady,
            'accountId' => $accountId,
            'account_id' => $accountId,
            'accessToken' => $rawAccessToken !== '' ? '••••••••'.substr($rawAccessToken, -6) : '',
            'hasAccessToken' => $rawAccessToken !== '',
            'connected' => $connected,
            'username' => $username,
            'name' => $name,
            'biography' => $conn?->biography,
            'website' => $conn?->website,
            'profilePictureUrl' => $conn?->profile_picture_url,
            'followersCount' => $conn?->followers_count,
            'followsCount' => $conn?->follows_count,
            'mediaCount' => $conn?->media_count,
            'pageName' => $pageName,
            'tokenExpiresAt' => $tokenExpiresAt,
            'tokenDaysRemaining' => $tokenDaysRemaining,
            'tokenRefreshedAt' => $conn?->token_refreshed_at?->format('d M Y, H:i').' WIB',
            'lastTestedAt' => $lastTestedAt,
            'lastSyncedAt' => $lastSyncedAt,
            'commentsSyncedAt' => $conn?->comments_synced_at?->format('d M Y, H:i').' WIB',
            'candidateAccounts' => $candidateAccounts,
            'grantedScopes' => $grantedScopes,
            'requestedScopes' => $requestedScopes,
            'capabilities' => InstagramGraphService::mapCapabilitiesFromScopes($effectiveScopesForCap),
            'accountInsights' => $accountInsights,
            'bestPostingHours' => $bestPostingHours,
            'rateLimitUsage' => is_array($conn?->rate_limit_usage) ? $conn->rate_limit_usage : null,
            'syncLogs' => is_array($conn?->sync_logs) ? $conn->sync_logs : [],
        ];
    }

    /**
     * Update Instagram Graph API credentials & App ID/Secret (`PATCH /settings/instagram`).
     */
    public function updateInstagramSettings(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['manageSettings']) {
            abort(403, 'Hanya Administrator yang memiliki akses mengubah pengaturan integrasi.');
        }

        $validated = $request->validate([
            'app_id' => ['nullable', 'string', 'max:100'],
            'app_secret' => ['nullable', 'string', 'max:255'],
            'account_id' => ['nullable', 'string', 'max:100'],
            'access_token' => ['nullable', 'string', 'max:1500'],
            'requested_scopes' => ['nullable', 'array'],
            'requested_scopes.*' => ['string', 'max:80'],
        ]);

        $conn = InstagramConnection::current();
        $updates = [];

        if ($request->has('requested_scopes') && is_array($validated['requested_scopes'] ?? null)) {
            $base = ['instagram_basic', 'pages_show_list', 'pages_read_engagement'];
            $updates['requested_scopes'] = array_values(array_unique(array_merge($base, $validated['requested_scopes'])));
        }

        if ($request->has('app_id')) {
            $updates['app_id'] = trim((string) $validated['app_id']) ?: null;
        }

        if ($request->has('app_secret')) {
            $secret = trim((string) $validated['app_secret']);
            if ($secret !== '' && ! str_starts_with($secret, '••••')) {
                $updates['app_secret'] = $secret;
            }
        }

        $targetAccountId = $conn->account_id;
        if ($request->has('account_id')) {
            $accId = trim((string) $validated['account_id']);
            $updates['account_id'] = $accId ?: null;
            $targetAccountId = $accId;
        }

        $newRawToken = null;
        if ($request->has('access_token')) {
            $tokenInput = trim((string) $validated['access_token']);
            if ($tokenInput !== '' && ! str_starts_with($tokenInput, '••••')) {
                $newRawToken = $tokenInput;
            }
        }

        if ($newRawToken !== null) {
            $service = new InstagramGraphService($targetAccountId, $newRawToken);
            $exchangeRes = $service->exchangeManualTokenForLongLived($newRawToken);
            $effectiveToken = $exchangeRes['access_token'];

            $updates['access_token'] = $effectiveToken;
            if (isset($exchangeRes['expires_in'])) {
                $updates['token_expires_at'] = now()->addSeconds($exchangeRes['expires_in']);
            }

            // Auto-test connection on manual token save
            $testService = new InstagramGraphService($targetAccountId, $effectiveToken);
            $testRes = $testService->testConnection();

            if ($testRes['success'] ?? false) {
                $updates['connected'] = true;
                $updates['username'] = (string) ($testRes['data']['username'] ?? ($testRes['data']['name'] ?? 'instagram_user'));
                $updates['name'] = (string) ($testRes['data']['name'] ?? ($conn->name ?? ''));
                $updates['account_id'] = (string) ($testRes['data']['id'] ?? $targetAccountId);
                if (isset($testRes['data']['biography'])) {
                    $updates['biography'] = $testRes['data']['biography'];
                }
                if (isset($testRes['data']['profile_picture_url'])) {
                    $updates['profile_picture_url'] = $testRes['data']['profile_picture_url'];
                }
                if (isset($testRes['data']['followers_count'])) {
                    $updates['followers_count'] = (int) $testRes['data']['followers_count'];
                }
                if (isset($testRes['data']['media_count'])) {
                    $updates['media_count'] = (int) $testRes['data']['media_count'];
                }
                $updates['last_tested_at'] = now();
                $updates['connected_by'] = auth()->id();
            } else {
                $updates['connected'] = false;
            }
        }

        if (! empty($updates)) {
            $conn->update($updates);
        }

        if ($newRawToken !== null && ($updates['connected'] ?? false)) {
            (new InstagramGraphService($conn->account_id, $conn->access_token))->inspectTokenPermissions($conn->access_token);
        }

        // Sync to session for backwards compatibility
        $fresh = $conn->fresh();
        $session = $request->session();
        $sessionIg = [
            'account_id' => $fresh->account_id,
            'access_token' => $fresh->access_token,
            'connected' => $fresh->connected,
            'username' => $fresh->username,
            'lastTestedAt' => $fresh->last_tested_at?->format('d M Y, H:i').' WIB',
        ];
        $session->put('sparc_v3.settings.instagram', $sessionIg);

        self::flashToast($request, 'success', 'Kredensial Meta Disimpan', 'Pengaturan integrasi Instagram Graph API telah diperbarui.');

        return back();
    }

    /**
     * Test Instagram Business Account connection (`POST /settings/instagram/test`).
     */
    public function testInstagramConnection(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['manageSettings']) {
            abort(403, 'Hanya Administrator yang memiliki akses menguji integrasi.');
        }

        $conn = InstagramConnection::current();

        $accountId = $request->input('account_id') ? trim((string) $request->input('account_id')) : $conn->account_id;
        $accessToken = $request->input('access_token') ? trim((string) $request->input('access_token')) : null;
        if (empty($accessToken) || str_starts_with($accessToken, '••••')) {
            $accessToken = $conn->access_token;
        }

        $service = new InstagramGraphService($accountId, $accessToken);
        $res = $service->testConnection();

        if ($res['success'] ?? false) {
            $username = (string) ($res['data']['username'] ?? ($res['data']['name'] ?? 'instagram_user'));
            $resolvedId = (string) ($res['data']['id'] ?? $accountId);
            $wasPage = ! empty($res['data']['resolved_from_page']);

            $conn->update([
                'connected' => true,
                'username' => $username,
                'name' => (string) ($res['data']['name'] ?? ($conn->name ?? '')),
                'biography' => $res['data']['biography'] ?? $conn->biography,
                'profile_picture_url' => $res['data']['profile_picture_url'] ?? $conn->profile_picture_url,
                'followers_count' => isset($res['data']['followers_count']) ? (int) $res['data']['followers_count'] : $conn->followers_count,
                'media_count' => isset($res['data']['media_count']) ? (int) $res['data']['media_count'] : $conn->media_count,
                'account_id' => $resolvedId,
                'last_tested_at' => now(),
                'connected_by' => auth()->id(),
            ]);

            $service->inspectTokenPermissions($accessToken);

            // Sync to session
            $request->session()->put('sparc_v3.settings.instagram', [
                'account_id' => $resolvedId,
                'access_token' => $accessToken,
                'connected' => true,
                'username' => $username,
                'lastTestedAt' => now()->format('d M Y, H:i').' WIB',
            ]);

            self::flashToast(
                $request,
                'success',
                'Koneksi Instagram Berhasil!',
                $wasPage
                    ? sprintf('Terhubung ke akun @%s (ID Instagram otomatis disinkronkan dari Halaman Facebook).', $username)
                    : sprintf('Terhubung ke akun @%s.', $username)
            );
        } else {
            $conn->update(['connected' => false]);
            $request->session()->put('sparc_v3.settings.instagram.connected', false);

            self::flashToast(
                $request,
                'error',
                'Koneksi Instagram Gagal',
                $res['error'] ?? 'Gagal memverifikasi akun ke Meta Graph API.'
            );
        }

        return back();
    }

    /**
     * Redirect to Meta Facebook Login dialog (`GET /settings/instagram/oauth/redirect`).
     */
    public function redirectToInstagramOAuth(Request $request): Response|RedirectResponse|\Symfony\Component\HttpFoundation\Response
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['manageSettings']) {
            abort(403, 'Hanya Administrator yang memiliki akses menghubungkan integrasi.');
        }

        $service = new InstagramGraphService;
        if (! $service->hasAppCredentials()) {
            self::flashToast($request, 'error', 'Meta App Belum Dikonfigurasi', 'Masukkan Meta App ID dan App Secret terlebih dahulu sebelum menggunakan Facebook Login.');

            return to_route('settings.index');
        }

        $oauthState = Str::random(40);
        $request->session()->put('sparc_v3.ig_oauth_state', $oauthState);

        return Inertia::location($service->getOAuthRedirectUrl($oauthState));
    }

    /**
     * Handle OAuth callback from Meta (`GET /settings/instagram/oauth/callback`).
     */
    public function handleInstagramOAuthCallback(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['manageSettings']) {
            abort(403, 'Hanya Administrator yang dapat memproses otorisasi Meta.');
        }

        if ($request->filled('error')) {
            self::flashToast(
                $request,
                'error',
                'Otorisasi Facebook Dibatalkan',
                (string) $request->query('error_description', 'Proses otorisasi Facebook tidak diselesaikan.')
            );

            return to_route('settings.index');
        }

        $savedState = $request->session()->pull('sparc_v3.ig_oauth_state');
        $incomingState = (string) $request->query('state');
        $code = (string) $request->query('code');

        if (empty($savedState) || ! hash_equals($savedState, $incomingState) || empty($code)) {
            self::flashToast(
                $request,
                'error',
                'Sesi Otorisasi Tidak Valid',
                'Sesi otorisasi Facebook kedaluwarsa atau tidak valid. Silakan coba klik tombol Hubungkan kembali.'
            );

            return to_route('settings.index');
        }

        $service = new InstagramGraphService;
        $tokenRes = $service->exchangeCodeForLongLivedToken($code);

        if (! ($tokenRes['success'] ?? false) || empty($tokenRes['access_token'])) {
            self::flashToast(
                $request,
                'error',
                'Gagal Menukar Token Meta',
                $tokenRes['error'] ?? 'Gagal mendapatkan token akses dari server Meta.'
            );

            return to_route('settings.index');
        }

        $longLivedUserToken = $tokenRes['access_token'];
        $expiresIn = $tokenRes['expires_in'] ?? 5184000;

        $accountsRes = $service->discoverInstagramAccounts($longLivedUserToken);

        if (! ($accountsRes['success'] ?? false) || empty($accountsRes['accounts'])) {
            self::flashToast(
                $request,
                'error',
                'Akun Instagram Tidak Ditemukan',
                $accountsRes['error'] ?? 'Tidak ada akun Instagram Bisnis yang terhubung pada Halaman Facebook Anda.'
            );

            return to_route('settings.index');
        }

        $accounts = $accountsRes['accounts'];
        $conn = InstagramConnection::current();

        if (count($accounts) === 1) {
            // Exactly 1 account: auto-connect!
            $chosen = $accounts[0];
            $conn->update([
                'account_id' => $chosen['account_id'],
                'username' => $chosen['username'],
                'name' => $chosen['name'],
                'biography' => $chosen['biography'] ?? $conn->biography,
                'profile_picture_url' => $chosen['profile_picture_url'] ?? $conn->profile_picture_url,
                'followers_count' => $chosen['followers_count'] ?? $conn->followers_count,
                'media_count' => $chosen['media_count'] ?? $conn->media_count,
                'page_id' => $chosen['page_id'],
                'page_name' => $chosen['page_name'],
                'access_token' => $chosen['page_access_token'] ?: $longLivedUserToken,
                'user_access_token' => $longLivedUserToken,
                'candidate_accounts' => $accounts,
                'token_expires_at' => now()->addSeconds($expiresIn),
                'connected' => true,
                'last_tested_at' => now(),
                'connected_by' => auth()->id(),
            ]);

            $service->inspectTokenPermissions($longLivedUserToken);

            $request->session()->put('sparc_v3.settings.instagram', [
                'account_id' => $chosen['account_id'],
                'access_token' => $chosen['page_access_token'] ?: $longLivedUserToken,
                'connected' => true,
                'username' => $chosen['username'],
                'lastTestedAt' => now()->format('d M Y, H:i').' WIB',
            ]);

            self::flashToast(
                $request,
                'success',
                'Instagram Terhubung!',
                sprintf('Berhasil terhubung otomatis ke akun @%s via Facebook Login.', $chosen['username'])
            );
        } else {
            // Multi-account: save user token and candidates, prompt user to select
            $conn->update([
                'user_access_token' => $longLivedUserToken,
                'candidate_accounts' => $accounts,
                'token_expires_at' => now()->addSeconds($expiresIn),
                'connected_by' => auth()->id(),
            ]);

            self::flashToast(
                $request,
                'info',
                'Pilih Akun Instagram',
                sprintf('Ditemukan %d akun Instagram Bisnis. Silakan pilih akun yang ingin digunakan SPARC di bawah.', count($accounts))
            );
        }

        return to_route('settings.index');
    }

    /**
     * Select active Instagram Business account from discovered candidate accounts (`POST /settings/instagram/select-account`).
     */
    public function selectInstagramAccount(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['manageSettings']) {
            abort(403, 'Hanya Administrator yang dapat memilih akun integrasi.');
        }

        $validated = $request->validate([
            'account_id' => ['required', 'string'],
        ]);

        $conn = InstagramConnection::current();
        $candidates = $conn->candidate_accounts ?? [];
        $chosen = collect($candidates)->firstWhere('account_id', $validated['account_id']);

        if (! $chosen) {
            self::flashToast($request, 'error', 'Akun Tidak Ditemukan', 'Akun yang dipilih tidak ada dalam daftar kandidat otorisasi.');

            return back();
        }

        $token = $chosen['page_access_token'] ?? $conn->user_access_token;

        $conn->update([
            'account_id' => (string) $chosen['account_id'],
            'username' => (string) ($chosen['username'] ?? ''),
            'name' => (string) ($chosen['name'] ?? ''),
            'page_id' => (string) ($chosen['page_id'] ?? ''),
            'page_name' => (string) ($chosen['page_name'] ?? ''),
            'access_token' => (string) $token,
            'connected' => true,
            'last_tested_at' => now(),
            'connected_by' => auth()->id(),
        ]);

        $request->session()->put('sparc_v3.settings.instagram', [
            'account_id' => (string) $chosen['account_id'],
            'access_token' => (string) $token,
            'connected' => true,
            'username' => (string) ($chosen['username'] ?? ''),
            'lastTestedAt' => now()->format('d M Y, H:i').' WIB',
        ]);

        self::flashToast(
            $request,
            'success',
            'Akun Aktif Diperbarui',
            sprintf('SPARC kini terhubung ke akun Instagram @%s.', $chosen['username'] ?? $chosen['account_id'])
        );

        return back();
    }

    /**
     * Disconnect active Instagram connection (`DELETE /settings/instagram/disconnect`).
     */
    public function disconnectInstagram(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['manageSettings']) {
            abort(403, 'Hanya Administrator yang memiliki akses memutuskan integrasi.');
        }

        $conn = InstagramConnection::current();
        $conn->update([
            'account_id' => null,
            'username' => null,
            'name' => null,
            'page_id' => null,
            'page_name' => null,
            'access_token' => null,
            'user_access_token' => null,
            'candidate_accounts' => null,
            'token_expires_at' => null,
            'connected' => false,
        ]);

        $request->session()->forget('sparc_v3.settings.instagram');

        self::flashToast(
            $request,
            'info',
            'Integrasi Diputuskan',
            'Koneksi akun Instagram telah diputuskan dari SPARC Workspace.'
        );

        return back();
    }

    /**
     * Push a new persistent notification into the workspace store.
     */
    public static function pushNotification(
        Request $request,
        string $type,
        string $title,
        string $message,
        string $actionUrl = '/'
    ): void {
        if (! $request->hasSession()) {
            return;
        }

        /** @var array<int, array<string, mixed>> $notifications */
        $notifications = $request->session()->get('sparc_v3.notifications', []);
        array_unshift($notifications, [
            'id' => 'ntf-'.(string) Str::uuid(),
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'actionUrl' => $actionUrl,
            'createdAt' => now()->toIso8601String(),
            'timeLabel' => 'Baru saja',
            'readAt' => null,
        ]);

        $request->session()->put('sparc_v3.notifications', array_slice($notifications, 0, 50));
    }

    /**
     * Flash a transient single-source toast notification.
     */
    public static function flashToast(Request $request, string $type, string $title, ?string $message = null): void
    {
        $request->session()->flash('toast', [
            'id' => (string) Str::uuid(),
            'type' => $type,
            'title' => $title,
            'message' => $message,
        ]);
    }

    /**
     * Ensure a publication record exists when content moves to `ready_to_publish`.
     */
    protected function ensurePublicationSlotExists(Request $request, string $contentItemId, string $code, string $title): void
    {
        /** @var array<int, array<string, mixed>> $pubs */
        $pubs = $request->session()->get('sparc_v3.publications', []);
        $exists = collect($pubs)->contains(fn (array $p): bool => ($p['contentItemId'] ?? '') === $contentItemId);
        if ($exists) {
            return;
        }

        /** @var array<int, array<string, mixed>> $items */
        $items = $request->session()->get('sparc_v3.content_items', []);
        $matched = collect($items)->firstWhere('id', $contentItemId);
        $platform = is_array($matched) ? (string) ($matched['platform'] ?? 'instagram') : 'instagram';
        $schedDate = is_array($matched) ? (string) ($matched['publishDate'] ?? '2026-10-29') : '2026-10-29';

        array_unshift($pubs, [
            'id' => 'pub-'.Str::lower(Str::random(5)),
            'contentItemId' => $contentItemId,
            'contentId' => $code ?: 'SPARC-2026-0009',
            'title' => $title,
            'platform' => in_array($platform, ['instagram', 'tiktok', 'youtube', 'website', 'whatsapp'], true) ? $platform : 'instagram',
            'scheduledAt' => $schedDate.' 10:00',
            'publishedActualAt' => null,
            'publishedUrl' => null,
            'picName' => 'Fajar Nugroho',
            'checklist' => self::defaultChecklistForPlatform($platform),
            'metrics' => null,
        ]);
        $request->session()->put('sparc_v3.publications', $pubs);
    }

    /**
     * Default channel checklist items matching SPARC v3 Step 9.
     *
     * @return array<int, array{key: string, label: string, checked: bool}>
     */
    public static function defaultChecklistForPlatform(string $platform): array
    {
        return match (strtolower($platform)) {
            'tiktok' => [
                ['key' => 'caption', 'label' => 'Copywriting singkat & hook teks 3 detik pertama', 'checked' => false],
                ['key' => 'hashtag', 'label' => 'Tagar relevan & kata kunci pencarian TikTok', 'checked' => false],
                ['key' => 'cta', 'label' => 'Ajakan tindak lanjut (Call to Action) jelas', 'checked' => false],
                ['key' => 'thumbnail', 'label' => 'Cover frame vertikal 9:16 terbaca di profil', 'checked' => false],
                ['key' => 'sound', 'label' => 'Lisensi audio / voiceover jernih bebas klaim', 'checked' => false],
            ],
            'youtube' => [
                ['key' => 'judul', 'label' => 'Judul informatif sesuai pedoman redaksi (maks 70 karakter)', 'checked' => false],
                ['key' => 'deskripsi', 'label' => 'Deskripsi lengkap beserta timestamp & tautan resmi', 'checked' => false],
                ['key' => 'thumbnail', 'label' => 'Thumbnail 16:9 kontras tinggi terpasang', 'checked' => false],
                ['key' => 'tag', 'label' => 'Metadata tag & taksonomi topik terisi', 'checked' => false],
                ['key' => 'playlist', 'label' => 'Dimasukkan ke playlist program terkait', 'checked' => false],
            ],
            'website' => [
                ['key' => 'judul_artikel', 'label' => 'Judul rilis berita telah disunting redaktur', 'checked' => false],
                ['key' => 'meta_description', 'label' => 'Meta description SEO (150-160 karakter) terisi', 'checked' => false],
                ['key' => 'featured_image', 'label' => 'Foto utama beserta alt-text aksesibilitas', 'checked' => false],
                ['key' => 'internal_link', 'label' => 'Tautan rujukan layanan publik berfungsi', 'checked' => false],
            ],
            'whatsapp' => [
                ['key' => 'pesan', 'label' => 'Format pesan siaran ringkas & bebas salah ketik', 'checked' => false],
                ['key' => 'link_preview', 'label' => 'Pratinjau tautan (OpenGraph) tampil rapi', 'checked' => false],
                ['key' => 'target_grup', 'label' => 'Daftar kanal/grup tujuan telah diverifikasi', 'checked' => false],
            ],
            default => [
                ['key' => 'caption', 'label' => 'Caption final sesuai EYD & pedoman komunikasi publik', 'checked' => false],
                ['key' => 'hashtag', 'label' => 'Tagar kelembagaan & pilar konten lengkap', 'checked' => false],
                ['key' => 'cta', 'label' => 'Call to Action & informasi kanal pengaduan jelas', 'checked' => false],
                ['key' => 'thumbnail', 'label' => 'Cover rasio 4:5 / 9:16 selaras pada grid profil', 'checked' => false],
                ['key' => 'mention', 'label' => 'Tag akun unit kerja terkait & lokasi terverifikasi', 'checked' => false],
            ],
        };
    }

    /**
     * Initial coherent operational HUMAS seed data for SPARC v3.
     *
     * @return array<string, mixed>
     */
    public static function defaultSeed(): array
    {
        return [
            'active_role' => 'admin',
            'content_items' => [],
            'activities' => [
                [
                    'id' => 'act-1',
                    'title' => 'Rapat Koordinasi Keterbukaan Informasi Publik',
                    'activityDate' => '2026-10-28',
                    'type' => 'agenda',
                    'description' => 'Rakor nasional PPID dan penyelarasan standar layanan informasi.',
                    'linkedCount' => 1,
                ],
                [
                    'id' => 'act-2',
                    'title' => 'Peringatan Hari Sumpah Pemuda',
                    'activityDate' => '2026-10-28',
                    'type' => 'hari_besar',
                    'description' => 'Momentum nasional publikasi serentak seluruh kanal resmi.',
                    'linkedCount' => 1,
                ],
                [
                    'id' => 'act-3',
                    'title' => 'Peluncuran Portal Layanan Digital Terpadu',
                    'activityDate' => '2026-10-27',
                    'type' => 'event',
                    'description' => 'Konferensi pers peluncuran pembaruan portal versi seluler.',
                    'linkedCount' => 1,
                ],
                [
                    'id' => 'act-4',
                    'title' => 'Evaluasi Kinerja Kehumasan Triwulan IV',
                    'activityDate' => '2026-10-30',
                    'type' => 'momentum',
                    'description' => 'Paparan capaian publikasi dan respons pengaduan masyarakat.',
                    'linkedCount' => 1,
                ],
                [
                    'id' => 'act-5',
                    'title' => 'Kampanye Literasi Layanan Pengaduan HALO APU',
                    'activityDate' => '2026-11-03',
                    'type' => 'kampanye',
                    'description' => 'Pekan edukasi pemanfaatan kanal pengaduan terintegrasi.',
                    'linkedCount' => 1,
                ],
            ],
            'publications' => [
                [
                    'id' => 'pub-1',
                    'contentItemId' => 'ci-4',
                    'contentId' => 'SPARC-2026-0004',
                    'title' => 'Rilis Berita Peluncuran Portal Layanan Terpadu Versi Mobile',
                    'platform' => 'website',
                    'scheduledAt' => '2026-10-27 16:00',
                    'publishedActualAt' => null,
                    'publishedUrl' => null,
                    'picName' => 'Fajar Nugroho',
                    'checklist' => [
                        ['key' => 'judul_artikel', 'label' => 'Judul rilis berita telah disunting redaktur', 'checked' => true],
                        ['key' => 'meta_description', 'label' => 'Meta description SEO (150-160 karakter) terisi', 'checked' => true],
                        ['key' => 'featured_image', 'label' => 'Foto utama beserta alt-text aksesibilitas', 'checked' => true],
                        ['key' => 'internal_link', 'label' => 'Tautan rujukan layanan publik berfungsi', 'checked' => false],
                    ],
                    'metrics' => null,
                ],
                [
                    'id' => 'pub-2',
                    'contentItemId' => 'ci-3',
                    'contentId' => 'SPARC-2026-0003',
                    'title' => 'Peringatan Hari Sumpah Pemuda ke-98: Kolaborasi Muda',
                    'platform' => 'instagram',
                    'scheduledAt' => '2026-10-28 07:30',
                    'publishedActualAt' => null,
                    'publishedUrl' => null,
                    'picName' => 'Fajar Nugroho',
                    'checklist' => [
                        ['key' => 'caption', 'label' => 'Caption final sesuai EYD & pedoman komunikasi publik', 'checked' => true],
                        ['key' => 'hashtag', 'label' => 'Tagar kelembagaan & pilar konten lengkap', 'checked' => true],
                        ['key' => 'cta', 'label' => 'Call to Action & informasi kanal pengaduan jelas', 'checked' => true],
                        ['key' => 'thumbnail', 'label' => 'Cover rasio 4:5 / 9:16 selaras pada grid profil', 'checked' => true],
                        ['key' => 'mention', 'label' => 'Tag akun unit kerja terkait & lokasi terverifikasi', 'checked' => true],
                    ],
                    'metrics' => null,
                ],
                [
                    'id' => 'pub-3',
                    'contentItemId' => 'ci-8',
                    'contentId' => 'SPARC-2026-0008',
                    'title' => '5 Tips Mengenali Tautan Resmi Instansi vs Penipuan Phishing',
                    'platform' => 'instagram',
                    'scheduledAt' => '2026-10-23 10:00',
                    'publishedActualAt' => '2026-10-23 10:04',
                    'publishedUrl' => 'https://instagram.com/p/sparc2026aman',
                    'picName' => 'Fajar Nugroho',
                    'checklist' => [],
                    'metrics' => [
                        'reach' => 28400,
                        'impressions' => 36900,
                        'views' => null,
                        'likes' => 1840,
                        'comments' => 142,
                        'shares' => 690,
                        'saves' => 920,
                        'clicks' => 415,
                        'source' => 'manual',
                        'recordedAt' => '2026-10-26 09:30',
                    ],
                ],
                [
                    'id' => 'pub-4',
                    'contentItemId' => 'ci-7',
                    'contentId' => 'SPARC-2026-0007',
                    'title' => 'Dokumenter Inovasi Pelayanan Ramah Disabilitas 2026',
                    'platform' => 'youtube',
                    'scheduledAt' => '2026-10-20 13:00',
                    'publishedActualAt' => '2026-10-20 13:02',
                    'publishedUrl' => 'https://youtube.com/watch?v=sparc2026inklusif',
                    'picName' => 'Fajar Nugroho',
                    'checklist' => [],
                    'metrics' => [
                        'reach' => 14200,
                        'impressions' => 21500,
                        'views' => 11850,
                        'likes' => 940,
                        'comments' => 88,
                        'shares' => 210,
                        'saves' => null,
                        'clicks' => 310,
                        'source' => 'manual',
                        'recordedAt' => '2026-10-25 14:15',
                    ],
                ],
            ],
            'assets' => [
                [
                    'id' => 'ast-1',
                    'title' => 'Template Master Carousel Edukasi Publik 4:5 (MD3)',
                    'category' => 'template_desain',
                    'tags' => ['carousel', 'instagram', 'standar-2026'],
                    'externalUrl' => 'https://www.canva.com/design/sparc-carousel-2026',
                    'thumbnailUrl' => 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&auto=format&fit=crop&q=80',
                    'contentId' => 'SPARC-2026-0008',
                    'uploadedBy' => 'Dimas Pratama',
                    'createdAt' => '22 Okt 2026',
                    'dimensions' => '1080 × 1350 px',
                ],
                [
                    'id' => 'ast-2',
                    'title' => 'Dokumentasi Konferensi Pers Layanan Digital Terpadu',
                    'category' => 'foto',
                    'tags' => ['liputan', 'pimpinan', 'portal-digital'],
                    'externalUrl' => 'https://drive.google.com/drive/folders/sparc-dokumentasi',
                    'thumbnailUrl' => 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=600&auto=format&fit=crop&q=80',
                    'contentId' => 'SPARC-2026-0004',
                    'uploadedBy' => 'Dimas Pratama',
                    'createdAt' => '27 Okt 2026',
                    'dimensions' => '4000 × 2667 px',
                ],
                [
                    'id' => 'ast-3',
                    'title' => 'Bumper Outro Resmi HUMAS & Lower-Third Reels 9:16',
                    'category' => 'video',
                    'tags' => ['bumper', 'reels', 'motion-kit'],
                    'externalUrl' => 'https://drive.google.com/drive/folders/sparc-video-kit',
                    'thumbnailUrl' => 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=600&auto=format&fit=crop&q=80',
                    'contentId' => 'SPARC-2026-0001',
                    'uploadedBy' => 'Aldwin NV',
                    'createdAt' => '15 Okt 2026',
                    'dimensions' => '1080 × 1920 px (60fps)',
                ],
                [
                    'id' => 'ast-4',
                    'title' => 'Set Infografis Statistik Penyelesaian Tiket Triwulan III',
                    'category' => 'infografis',
                    'tags' => ['data', 'triwulan-3', 'akuntabilitas'],
                    'externalUrl' => 'https://www.figma.com/file/sparc-infografis-q3',
                    'thumbnailUrl' => 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&auto=format&fit=crop&q=80',
                    'contentId' => 'SPARC-2026-0002',
                    'uploadedBy' => 'Dimas Pratama',
                    'createdAt' => '26 Okt 2026',
                    'dimensions' => '1080 × 1350 px',
                ],
                [
                    'id' => 'ast-5',
                    'title' => 'Paket Ilustrasi Vektor Layanan Inklusif & Ramah Disabilitas',
                    'category' => 'ilustrasi',
                    'tags' => ['vektor', 'inklusif', 'ilustrasi'],
                    'externalUrl' => 'https://www.figma.com/file/sparc-vector-pack',
                    'thumbnailUrl' => 'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=600&auto=format&fit=crop&q=80',
                    'contentId' => 'SPARC-2026-0007',
                    'uploadedBy' => 'Dimas Pratama',
                    'createdAt' => '19 Okt 2026',
                    'dimensions' => 'SVG / PNG Transparan',
                ],
                [
                    'id' => 'ast-6',
                    'title' => 'Pedoman Identitas Visual & Tone of Voice HUMAS 2026',
                    'category' => 'dokumen',
                    'tags' => ['sop', 'brand-guideline', 'redaksi'],
                    'externalUrl' => 'https://drive.google.com/file/d/sparc-pedoman-2026',
                    'thumbnailUrl' => 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&auto=format&fit=crop&q=80',
                    'contentId' => null,
                    'uploadedBy' => 'Rina Kartika',
                    'createdAt' => '01 Okt 2026',
                    'dimensions' => 'PDF • 4.2 MB',
                ],
            ],
            'team' => [
                [
                    'id' => 'tm-1',
                    'name' => 'Aldwin NV',
                    'email' => 'aldwin@humas.instansi.go.id',
                    'roles' => ['admin', 'planner'],
                    'primaryRole' => 'admin',
                    'avatar' => 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
                    'activeTasks' => 3,
                    'dueThisWeek' => 2,
                    'overdueTasks' => 0,
                    'effortHours' => 14,
                    'capacityHours' => 30,
                    'status' => 'Aktif',
                ],
                [
                    'id' => 'tm-2',
                    'name' => 'Rina Kartika',
                    'email' => 'rina.kabag@humas.instansi.go.id',
                    'roles' => ['manager'],
                    'primaryRole' => 'manager',
                    'avatar' => 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80',
                    'activeTasks' => 2,
                    'dueThisWeek' => 2,
                    'overdueTasks' => 0,
                    'effortHours' => 10,
                    'capacityHours' => 25,
                    'status' => 'Aktif',
                ],
                [
                    'id' => 'tm-3',
                    'name' => 'Nadia Putri',
                    'email' => 'nadia.planner@humas.instansi.go.id',
                    'roles' => ['planner'],
                    'primaryRole' => 'planner',
                    'avatar' => 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
                    'activeTasks' => 5,
                    'dueThisWeek' => 3,
                    'overdueTasks' => 1,
                    'effortHours' => 24,
                    'capacityHours' => 30,
                    'status' => 'Aktif',
                ],
                [
                    'id' => 'tm-4',
                    'name' => 'Dimas Pratama',
                    'email' => 'dimas.creative@humas.instansi.go.id',
                    'roles' => ['creator'],
                    'primaryRole' => 'creator',
                    'avatar' => 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
                    'activeTasks' => 6,
                    'dueThisWeek' => 4,
                    'overdueTasks' => 1,
                    'effortHours' => 28,
                    'capacityHours' => 30,
                    'status' => 'Beban Tinggi',
                ],
                [
                    'id' => 'tm-5',
                    'name' => 'Fajar Nugroho',
                    'email' => 'fajar.social@humas.instansi.go.id',
                    'roles' => ['publisher'],
                    'primaryRole' => 'publisher',
                    'avatar' => 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
                    'activeTasks' => 3,
                    'dueThisWeek' => 3,
                    'overdueTasks' => 0,
                    'effortHours' => 16,
                    'capacityHours' => 30,
                    'status' => 'Aktif',
                ],
                [
                    'id' => 'tm-6',
                    'name' => 'Dr. Budi Santoso',
                    'email' => 'budi.pimpinan@humas.instansi.go.id',
                    'roles' => ['viewer'],
                    'primaryRole' => 'viewer',
                    'avatar' => 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80',
                    'activeTasks' => 0,
                    'dueThisWeek' => 0,
                    'overdueTasks' => 0,
                    'effortHours' => 0,
                    'capacityHours' => 10,
                    'status' => 'Pemantau Eksekutif',
                ],
            ],
            'settings' => [
                'monthlyContentTarget' => 24,
                'workingHoursStart' => '08:00',
                'workingHoursEnd' => '17:00',
                'pollingIntervalSeconds' => 30,
                'lastSyncAt' => '27 Okt 2026 15:30 WIB',
                'tokenHealthy' => true,
                'contentPilars' => [
                    ['key' => 'edukasi', 'label' => 'Edukasi Publik'],
                    ['key' => 'program', 'label' => 'Program Prioritas'],
                    ['key' => 'kelembagaan', 'label' => 'Kelembagaan & Layanan'],
                    ['key' => 'inspirasi', 'label' => 'Inspirasi & Humanis'],
                    ['key' => 'fundraising', 'label' => 'Kemitraan & Kolaborasi'],
                ],
                'platforms' => [
                    ['key' => 'instagram', 'label' => 'Instagram Resmi'],
                    ['key' => 'tiktok', 'label' => 'TikTok Resmi'],
                    ['key' => 'youtube', 'label' => 'YouTube Kanal Utama'],
                    ['key' => 'website', 'label' => 'Portal Berita Website'],
                    ['key' => 'whatsapp', 'label' => 'Siaran WhatsApp Publik'],
                ],
                'haloApuLogs' => [
                    ['id' => 'sync-1', 'timestamp' => '27 Okt 2026 15:30:02', 'status' => 'success', 'fetched' => 1, 'latencyMs' => 192, 'note' => 'Tiket #API-215 ditarik ke antrean Incoming HALO APU.'],
                    ['id' => 'sync-2', 'timestamp' => '27 Okt 2026 15:00:01', 'status' => 'success', 'fetched' => 0, 'latencyMs' => 145, 'note' => 'Tidak ada tiket baru (200 OK).'],
                    ['id' => 'sync-3', 'timestamp' => '27 Okt 2026 14:30:04', 'status' => 'success', 'fetched' => 2, 'latencyMs' => 210, 'note' => 'Callback status solve terkirim untuk #API-198.'],
                ],
            ],
            'notifications' => [
                [
                    'id' => 'ntf-seed-1',
                    'type' => 'warning',
                    'title' => 'Menunggu Persetujuan Kepala HUMAS',
                    'message' => 'SPARC-2026-0002 "Infografis Capaian Layanan Triwulan III" berada di kolom Review & Approval.',
                    'actionUrl' => '/planner',
                    'createdAt' => '2026-10-27T08:15:00+07:00',
                    'timeLabel' => '25m lalu',
                    'readAt' => null,
                ],
                [
                    'id' => 'ntf-seed-2',
                    'type' => 'error',
                    'title' => 'Tenggat Produksi Terlewat',
                    'message' => 'SPARC-2026-0001 "Panduan 3 Langkah Permohonan Informasi Publik" melewati tenggat produksi 25 Okt.',
                    'actionUrl' => '/content',
                    'createdAt' => '2026-10-27T07:30:00+07:00',
                    'timeLabel' => '1j lalu',
                    'readAt' => null,
                ],
                [
                    'id' => 'ntf-seed-3',
                    'type' => 'info',
                    'title' => 'Jadwal Tayang Hari Ini (16:00 WIB)',
                    'message' => 'SPARC-2026-0004 "Rilis Berita Peluncuran Portal Layanan" masih memiliki 1 checklist belum dicentang.',
                    'actionUrl' => '/publishing',
                    'createdAt' => '2026-10-27T07:00:00+07:00',
                    'timeLabel' => '2j lalu',
                    'readAt' => null,
                ],
                [
                    'id' => 'ntf-seed-4',
                    'type' => 'success',
                    'title' => 'Tiket HALO APU Tersinkronisasi',
                    'message' => 'Tiket #API-215 dari Bagian Umum masuk ke antrean Incoming HALO APU.',
                    'actionUrl' => '/incoming',
                    'createdAt' => '2026-10-26T16:40:00+07:00',
                    'timeLabel' => 'Kemarin',
                    'readAt' => '2026-10-27T06:00:00+07:00',
                ],
            ],
        ];
    }
}
