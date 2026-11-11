<?php

namespace App\Http\Controllers;

use App\Http\Resources\ContentItemResource;
use App\Models\ContentItem;
use App\Models\ContentTask;
use App\Models\HaloApuConnection;
use App\Models\HaloApuSyncLog;
use App\Models\HaloApuTicket;
use App\Models\InstagramComment;
use App\Models\InstagramConnection;
use App\Models\InstagramSchedule;
use App\Models\User;
use App\Services\HaloApuClientService;
use App\Services\InstagramGraphService;
use App\Services\SparcExcelReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
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
    public static function resolveAuthContextData(Request $request): array
    {
        if ($request->isMethodSafe() && $request->attributes->has('_sparc_auth_context')) {
            /** @var array<string, mixed> $cachedAuth */
            $cachedAuth = $request->attributes->get('_sparc_auth_context');

            return $cachedAuth;
        }

        if (! $request->hasSession()) {
            $seed = self::defaultSeed();

            return [
                'currentUser' => self::rolePersonas()['admin'],
                'activeRole' => 'admin',
                'can' => self::permissionsForRole('admin'),
                'personas' => array_values(self::rolePersonas()),
                'session' => null,
                'seedNotifications' => $seed['notifications'] ?? [],
            ];
        }

        $session = $request->session();

        if (! $session->has('sparc_v3.initialized') || $session->get('sparc_v3.seed_version') !== 2) {
            $seed = self::defaultSeed();
            foreach ($seed as $key => $value) {
                $session->put("sparc_v3.{$key}", $value);
            }
            $session->put('sparc_v3.initialized', true);
            $session->put('sparc_v3.seed_version', 2);
        }

        $roleLabels = [
            'admin' => 'Administrator',
            'manager' => 'Kepala HUMAS',
            'planner' => 'Content Planner',
            'creator' => 'Creator / Designer',
            'publisher' => 'Publisher',
            'viewer' => 'Pemantau Eksekutif',
        ];

        $personas = self::rolePersonas();

        if ($authUser = $request->user()) {
            $sessionRole = $session->get('sparc_v3.active_role');
            $userRole = ! empty($sessionRole)
                ? (string) $sessionRole
                : (string) ($authUser->role ?: $authUser->primary_role ?: 'admin');
            $activeRole = $userRole;
            $currentUser = [
                'id' => (string) $authUser->id,
                'name' => $authUser->name,
                'email' => $authUser->email,
                'role' => $userRole,
                'roleLabel' => $roleLabels[$userRole] ?? ucfirst($userRole),
                'avatar' => $authUser->avatar ?: 'https://ui-avatars.com/api/?name='.urlencode($authUser->name).'&background=1546D8&color=fff&size=128&bold=true',
            ];
        } else {
            $activeRole = (string) $session->get('sparc_v3.active_role', 'admin');
            $currentUser = $personas[$activeRole] ?? $personas['admin'];
        }

        $result = [
            'currentUser' => $currentUser,
            'activeRole' => $activeRole,
            'can' => self::permissionsForRole($activeRole),
            'personas' => array_values($personas),
        ];

        if ($request->isMethodSafe()) {
            $request->attributes->set('_sparc_auth_context', $result);
        }

        return $result;
    }

    /**
     * Lightweight Instagram connection summary for shared Inertia props (avoids loading sync_logs/ads_data/content_items).
     *
     * @return array<string, mixed>
     */
    public static function resolveLightweightInstagramStatus(Request $request): array
    {
        if ($request->isMethodSafe() && $request->attributes->has('_sparc_light_ig_status')) {
            /** @var array<string, mixed> $cachedIg */
            $cachedIg = $request->attributes->get('_sparc_light_ig_status');

            return $cachedIg;
        }

        $sessionIg = $request->hasSession() ? $request->session()->get('sparc_v3.settings.instagram', []) : [];
        $conn = null;
        if (Schema::hasTable('instagram_connections')) {
            try {
                $conn = InstagramConnection::query()
                    ->select([
                        'id', 'connected', 'username', 'name', 'biography', 'website',
                        'profile_picture_url', 'followers_count', 'media_count',
                        'last_synced_at', 'granted_scopes', 'requested_scopes', 'account_insights',
                    ])
                    ->first();
            } catch (\Throwable) {
                $conn = null;
            }
        }

        $connected = ! empty($conn?->connected) || ! empty($sessionIg['connected']);
        $grantedScopes = is_array($conn?->granted_scopes) && ! empty($conn->granted_scopes)
            ? array_values($conn->granted_scopes)
            : [];
        $requestedScopes = is_array($conn?->requested_scopes) && ! empty($conn->requested_scopes)
            ? array_values($conn->requested_scopes)
            : [];
        if (empty($requestedScopes) && $connected && empty($grantedScopes)) {
            $requestedScopes = (new InstagramGraphService)->resolveRequestedScopes();
        }
        $effectiveScopes = ! empty($grantedScopes) ? $grantedScopes : ($connected ? $requestedScopes : []);
        $accountInsights = is_array($conn?->account_insights) ? $conn->account_insights : [];
        $bestPostingHours = is_array($accountInsights['best_posting_hours'] ?? null) && ! empty($accountInsights['best_posting_hours'])
            ? $accountInsights['best_posting_hours']
            : ['11:30 WIB', '16:30 WIB', '19:30 WIB'];

        $status = [
            'connected' => $connected,
            'username' => (string) ($conn?->username ?: ($sessionIg['username'] ?? '')),
            'name' => (string) ($conn?->name ?: ($sessionIg['name'] ?? '')),
            'biography' => (string) ($conn?->biography ?? ''),
            'website' => (string) ($conn?->website ?? ''),
            'profilePictureUrl' => $conn?->profile_picture_url,
            'followersCount' => $conn?->followers_count,
            'mediaCount' => $conn?->media_count,
            'lastSyncedAt' => $conn?->last_synced_at?->format('d M Y, H:i').' WIB',
            'capabilities' => InstagramGraphService::mapCapabilitiesFromScopes($effectiveScopes),
            'bestPostingHours' => $bestPostingHours,
            'accountInsights' => $accountInsights,
        ];

        if ($request->isMethodSafe()) {
            $request->attributes->set('_sparc_light_ig_status', $status);
        }

        return $status;
    }

    /**
     * Lightweight sidebar badge counts using aggregate SQL COUNT(*) queries instead of hydrating thousands of models.
     *
     * @return array{incoming: int, readyToPublish: int, reviewApproval: int, unrepliedComments: int}
     */
    public static function resolveLightweightNavigationBadges(Request $request): array
    {
        if ($request->isMethodSafe() && $request->attributes->has('_sparc_light_badges')) {
            /** @var array{incoming: int, readyToPublish: int, reviewApproval: int, unrepliedComments: int} $cachedBadges */
            $cachedBadges = $request->attributes->get('_sparc_light_badges');

            return $cachedBadges;
        }

        $reviewQueue = 0;
        $readyQueue = 0;
        if (Schema::hasTable('content_items')) {
            try {
                $reviewQueue = ContentItem::query()->where('status', 'review_approval')->count();
                $readyQueue = ContentItem::query()->where('status', 'ready_to_publish')->count();
            } catch (\Throwable) {
                $reviewQueue = 0;
                $readyQueue = 0;
            }
        }

        if ($request->hasSession()) {
            /** @var array<int, array<string, mixed>> $sessionItems */
            $sessionItems = (array) $request->session()->get('sparc_v3.content_items', []);
            foreach ($sessionItems as $sItem) {
                if (($sItem['status'] ?? '') === 'review_approval') {
                    $reviewQueue++;
                }
            }
            /** @var array<int, array<string, mixed>> $sessionPubs */
            $sessionPubs = (array) $request->session()->get('sparc_v3.publications', []);
            foreach ($sessionPubs as $sPub) {
                if (empty($sPub['publishedActualAt'])) {
                    $readyQueue++;
                }
            }
        }

        $pendingIncoming = 0;
        if (Schema::hasTable('haloapu_tickets')) {
            try {
                /** @var array<string, string> $overrides */
                $overrides = $request->hasSession() ? (array) $request->session()->get('sparc.ticket_overrides', []) : [];
                if (empty($overrides)) {
                    $pendingIncoming = HaloApuTicket::query()->where('sync_status', 'pending')->count();
                } else {
                    $tickets = HaloApuTicket::query()->select(['id', 'haloapu_ticket_id', 'sync_status'])->limit(50)->get();
                    foreach ($tickets as $t) {
                        $effective = $overrides[(string) $t->id] ?? ($overrides[(string) $t->haloapu_ticket_id] ?? $t->sync_status);
                        if ($effective === 'pending') {
                            $pendingIncoming++;
                        }
                    }
                }
            } catch (\Throwable) {
                $pendingIncoming = 0;
            }
        }

        $unrepliedComments = 0;
        if (Schema::hasTable('instagram_comments')) {
            try {
                $unrepliedComments = InstagramComment::query()
                    ->whereNull('parent_ig_comment_id')
                    ->where('is_replied', false)
                    ->where('is_hidden', false)
                    ->count();
            } catch (\Throwable) {
                $unrepliedComments = 0;
            }
        }

        $badges = [
            'incoming' => $pendingIncoming,
            'readyToPublish' => $readyQueue,
            'reviewApproval' => $reviewQueue,
            'unrepliedComments' => $unrepliedComments,
        ];

        if ($request->isMethodSafe()) {
            $request->attributes->set('_sparc_light_badges', $badges);
        }

        return $badges;
    }

    /**
     * Load all pulled Instagram posts as ultra-lightweight plain arrays without hydrating relations (prevents 256MB OOM).
     *
     * @return array<int, array<string, mixed>>
     */
    public static function loadInstagramLibraryItems(): array
    {
        if (! Schema::hasTable('content_items')) {
            return [];
        }

        $rows = ContentItem::query()
            ->whereNotNull('ig_media_id')
            ->select([
                'id', 'content_id', 'title', 'status', 'priority',
                'platform', 'format', 'pillar', 'pic_name', 'pic_role', 'pic_avatar',
                'production_deadline', 'publish_date', 'publish_time', 'caption',
                'published_url', 'ig_media_id', 'ig_thumbnail_url',
                'reach', 'views', 'likes', 'comments_count', 'shares', 'saves',
            ])
            ->orderByDesc('publish_date')
            ->orderByDesc('id')
            ->toBase()
            ->get();

        $items = [];
        foreach ($rows as $row) {
            $pubDate = $row->publish_date ? substr((string) $row->publish_date, 0, 10) : '';
            $entry = [
                'id' => (string) $row->id,
                'contentId' => (string) $row->content_id,
                'title' => (string) $row->title,
                'status' => (string) $row->status,
                'priority' => (string) ($row->priority ?? 'normal'),
                'platform' => (string) ($row->platform ?? 'instagram'),
                'format' => (string) ($row->format ?? 'feed'),
                'pillar' => (string) ($row->pillar ?? 'kelembagaan'),
                'picName' => (string) ($row->pic_name ?? 'Instagram Auto-Sync'),
                'picAvatar' => (string) ($row->pic_avatar ?? ''),
                'productionDeadline' => $row->production_deadline ? substr((string) $row->production_deadline, 0, 10) : $pubDate,
                'publishDate' => $pubDate,
                'views' => (int) ($row->views ?? 0),
                'likes' => (int) ($row->likes ?? 0),
                'commentsCount' => (int) ($row->comments_count ?? 0),
                'shares' => (int) ($row->shares ?? 0),
                'hasFullDetail' => false,
            ];
            if ($row->publish_time) {
                $entry['publishTime'] = $row->publish_time;
            }
            if ($row->caption) {
                $entry['caption'] = Str::limit((string) $row->caption, 140);
            }
            if ($row->published_url) {
                $entry['publishedUrl'] = $row->published_url;
            }
            if ($row->ig_media_id) {
                $entry['igMediaId'] = $row->ig_media_id;
            }
            if ($row->ig_thumbnail_url) {
                $entry['igThumbnailUrl'] = $row->ig_thumbnail_url;
            }
            if ($row->reach !== null) {
                $entry['reach'] = (int) $row->reach;
            }
            if ($row->saves !== null) {
                $entry['saves'] = (int) $row->saves;
            }
            $items[] = $entry;
        }
        unset($rows);

        return $items;
    }

    /**
     * Ensure the SPARC v3 operational workspace state is initialized in session.
     *
     * @param  array{includePublications?: bool, includeRelations?: bool, liteRelations?: bool, month?: string|null, currentMonth?: string|null}  $options
     * @return array<string, mixed>
     */
    public static function hydrateWorkspace(Request $request, array $options = []): array
    {
        $includePublications = (bool) ($options['includePublications'] ?? true);
        $includeRelations = (bool) ($options['includeRelations'] ?? true);
        $liteRelations = (bool) ($options['liteRelations'] ?? false);
        $scopeMonth = isset($options['month']) && is_string($options['month']) ? $options['month'] : null;
        $scopeCurrentMonth = isset($options['currentMonth']) && is_string($options['currentMonth']) ? $options['currentMonth'] : null;
        $cacheAttrKey = sprintf(
            '_sparc_hydrated_workspace_%d_%d_%d_%s_%s',
            $includePublications ? 1 : 0,
            $includeRelations ? 1 : 0,
            $liteRelations ? 1 : 0,
            $scopeMonth ?? 'all',
            $scopeCurrentMonth ?? 'none'
        );

        if ($request->isMethodSafe() && $request->attributes->has($cacheAttrKey)) {
            /** @var array<string, mixed> $cachedState */
            $cachedState = $request->attributes->get($cacheAttrKey);

            return $cachedState;
        }

        if (! $request->hasSession()) {
            return self::defaultSeed();
        }
        $session = $request->session();

        $authCtx = self::resolveAuthContextData($request);
        $currentUser = $authCtx['currentUser'];
        $activeRole = $authCtx['activeRole'];
        $personas = self::rolePersonas();

        /** @var array<int, array<string, mixed>> $contentItems */
        $contentItems = $session->get('sparc_v3.content_items', []);

        /** @var array<int, array<string, mixed>> $legacyItems */
        $legacyItems = $session->get('sparc.planner_items', []);
        /** @var array<string, array<string, mixed>> $legacyUpdates */
        $legacyUpdates = $session->get('sparc.planner_updates', []);
        /** @var array<int, string> $legacyDeleted */
        $legacyDeleted = $session->get('sparc.deleted_planner_ids', []);

        $existingSessionItemIds = [];
        foreach ($contentItems as $c) {
            if (isset($c['id'])) {
                $existingSessionItemIds[(string) $c['id']] = true;
            }
        }

        foreach ($legacyItems as $idx => $legacy) {
            $legacyId = (string) ($legacy['id'] ?? 'legacy-'.$idx);
            if (! isset($existingSessionItemIds[$legacyId])) {
                $existingSessionItemIds[$legacyId] = true;
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
                if (Schema::hasTable('haloapu_tickets') && (app()->runningUnitTests() || Cache::add('sparc_halo_autoconvert_lock', true, now()->addSeconds(30)))) {
                    $unconverted = HaloApuTicket::whereNull('content_item_id')
                        ->where('sync_status', '!=', 'ignored')
                        ->limit(10)
                        ->get();
                    if ($unconverted->isNotEmpty()) {
                        $haloService = app(HaloApuClientService::class);
                        foreach ($unconverted as $uTicket) {
                            $haloService->autoConvertToInbox($uTicket, keepPendingSyncStatus: true);
                        }
                    }
                }

                if (! $includeRelations || $liteRelations) {
                    $rowsQuery = ContentItem::query()
                        ->select([
                            'id', 'content_id', 'ticket_id', 'title', 'status', 'priority',
                            'platform', 'format', 'pillar', 'pic_name', 'pic_role', 'pic_avatar',
                            'production_deadline', 'publish_date', 'publish_time', 'activity_title', 'campaign_title',
                            'brief', 'caption', 'published_url', 'ig_media_id', 'ig_media_url', 'ig_thumbnail_url',
                            'ref_design_url', 'result_design_url', 'revision_note', 'performance_notes',
                            'reach', 'views', 'likes', 'comments_count', 'shares', 'saves',
                            'reels_watch_time', 'reels_avg_watch_time', 'is_ad_boosted', 'ad_spend',
                            'metrics_synced_at', 'grid_position', 'created_by',
                        ]);

                    if ($scopeMonth !== null && $scopeCurrentMonth !== null) {
                        $monthStart = $scopeMonth.'-01';
                        $nextMonthStart = Carbon::createFromFormat('Y-m', $scopeMonth)->addMonthNoOverflow()->format('Y-m-01');
                        $rowsQuery->where(function ($q) use ($monthStart, $nextMonthStart, $scopeMonth, $scopeCurrentMonth): void {
                            $q->where(function ($qm) use ($monthStart, $nextMonthStart): void {
                                $qm->where('publish_date', '>=', $monthStart)
                                    ->where('publish_date', '<', $nextMonthStart);
                            });
                            if ($scopeMonth === $scopeCurrentMonth) {
                                $q->orWhereNull('publish_date')
                                    ->orWhere(function ($qCarry) use ($monthStart): void {
                                        $qCarry->where('publish_date', '<', $monthStart)
                                            ->where('status', '!=', 'published');
                                    });
                            }
                        });
                    }

                    $rows = $rowsQuery
                        ->orderByDesc('publish_date')
                        ->orderByDesc('id')
                        ->toBase()
                        ->get();

                    $tasksByItemId = [];
                    if ($liteRelations && Schema::hasTable('content_tasks')) {
                        $taskRows = ContentTask::query()
                            ->select(['id', 'content_item_id', 'title', 'task_type', 'status', 'assigned_to', 'due_date'])
                            ->toBase()
                            ->get();
                        foreach ($taskRows as $t) {
                            $tasksByItemId[(string) $t->content_item_id][] = [
                                'id' => (string) $t->id,
                                'title' => (string) $t->title,
                                'taskType' => (string) $t->task_type,
                                'status' => (string) $t->status,
                                'assignedTo' => (string) $t->assigned_to,
                                'dueDate' => $t->due_date ? substr((string) $t->due_date, 0, 10) : '',
                            ];
                        }
                    }

                    $ticketsByItemId = [];
                    if (Schema::hasTable('haloapu_tickets')) {
                        $ticketRows = HaloApuTicket::query()
                            ->whereNotNull('content_item_id')
                            ->select([
                                'id', 'content_item_id', 'haloapu_ticket_id', 'haloapu_status',
                                'is_result_accepted', 'revision_count', 'deliverable_url',
                                'requester_name', 'requester_unit', 'requester_avatar', 'assigned_operator_name',
                            ])
                            ->toBase()
                            ->get();
                        foreach ($ticketRows as $tk) {
                            $ticketsByItemId[(string) $tk->content_item_id] = $tk;
                        }
                    }

                    $haloBaseUrl = 'http://127.0.0.1:8001';
                    if (! empty($ticketsByItemId) && Schema::hasTable('haloapu_connections')) {
                        $haloBaseUrl = rtrim((string) (HaloApuConnection::current()->base_url ?: 'http://127.0.0.1:8001'), '/');
                    }

                    $existingContentById = [];
                    $existingContentByCode = [];
                    foreach ($contentItems as $c) {
                        if (isset($c['id']) && $c['id'] !== '') {
                            $existingContentById[(string) $c['id']] = true;
                        }
                        if (! empty($c['contentId'])) {
                            $existingContentByCode[(string) $c['contentId']] = true;
                        }
                    }

                    $pubIdxByContentItemId = [];
                    $pubIdxByCodePlatform = [];
                    if ($includePublications) {
                        foreach ($publications as $pIdx => $existingPub) {
                            if (! empty($existingPub['contentItemId'])) {
                                $pubIdxByContentItemId[(string) $existingPub['contentItemId']] = $pIdx;
                            }
                            if (! empty($existingPub['contentId'])) {
                                $cpKey = strtolower((string) $existingPub['contentId']).'|'.strtolower((string) ($existingPub['platform'] ?? ''));
                                $pubIdxByCodePlatform[$cpKey] = $pIdx;
                            }
                        }
                    }

                    foreach ($rows as $row) {
                        $idStr = (string) $row->id;
                        $codeStr = (string) ($row->content_id ?? '');
                        $ticket = $ticketsByItemId[$idStr] ?? null;
                        $pubDate = $row->publish_date ? substr((string) $row->publish_date, 0, 10) : null;
                        $prodDeadline = $row->production_deadline ? substr((string) $row->production_deadline, 0, 10) : null;

                        if (($idStr === '' || ! isset($existingContentById[$idStr])) && ($codeStr === '' || ! isset($existingContentByCode[$codeStr]))) {
                            $requesterName = $ticket?->requester_name ? trim((string) $ticket->requester_name) : null;
                            $requesterUnit = $ticket?->requester_unit ? trim((string) $ticket->requester_unit) : null;
                            $requesterAvatar = null;
                            if ($ticket && $requesterName) {
                                $rawAvatar = trim((string) ($ticket->requester_avatar ?? ''));
                                if ($rawAvatar !== '') {
                                    if (! str_starts_with($rawAvatar, 'http')) {
                                        $requesterAvatar = $haloBaseUrl.'/'.ltrim($rawAvatar, '/');
                                    } elseif (str_contains($rawAvatar, ':8000/storage/avatars/')) {
                                        $requesterAvatar = str_replace(':8000/storage/avatars/', ':8001/storage/avatars/', $rawAvatar);
                                    } else {
                                        $requesterAvatar = $rawAvatar;
                                    }
                                } else {
                                    $requesterAvatar = 'https://ui-avatars.com/api/?name='.urlencode($requesterName).'&background=1546D8&color=fff&size=96&bold=true';
                                }
                            }

                            $picAvatar = trim((string) ($row->pic_avatar ?? ''));
                            $isLiveRow = $row->status === 'published';
                            $entry = [
                                'id' => $idStr,
                                'contentId' => $codeStr,
                                'title' => (string) $row->title,
                                'status' => (string) $row->status,
                                'priority' => (string) $row->priority,
                                'platform' => (string) $row->platform,
                                'format' => (string) $row->format,
                                'pillar' => (string) $row->pillar,
                                'picName' => (string) $row->pic_name,
                                'picRole' => (string) $row->pic_role,
                                'picAvatar' => $picAvatar,
                                'productionDeadline' => $prodDeadline ?? '',
                                'publishDate' => $pubDate ?? '',
                                'views' => (int) ($row->views ?? 0),
                                'likes' => (int) ($row->likes ?? 0),
                                'commentsCount' => (int) ($row->comments_count ?? 0),
                                'shares' => (int) ($row->shares ?? 0),
                                'hasFullDetail' => false,
                            ];
                            if (! empty($tasksByItemId[$idStr])) {
                                $entry['tasks'] = $tasksByItemId[$idStr];
                            }
                            if ($row->ticket_id !== null) {
                                $entry['ticketId'] = $row->ticket_id;
                            }
                            if ($ticket) {
                                $entry['haloapuTicketId'] = $ticket->haloapu_ticket_id;
                                $entry['haloapuStatus'] = $ticket->haloapu_status;
                                $entry['isResultAccepted'] = (bool) $ticket->is_result_accepted;
                                $entry['revisionCount'] = $ticket->revision_count;
                                $entry['deliverableUrl'] = $ticket->deliverable_url;
                                $entry['haloApuDbId'] = (string) $ticket->id;
                                $entry['requesterName'] = $requesterName;
                                $entry['requesterUnit'] = $requesterUnit;
                                $entry['requesterAvatar'] = $requesterAvatar;
                                $entry['assignedOperatorName'] = $ticket->assigned_operator_name ? trim((string) $ticket->assigned_operator_name) : null;
                            }
                            if ($row->publish_time) {
                                $entry['publishTime'] = $row->publish_time;
                            }
                            if ($row->activity_title) {
                                $entry['activityTitle'] = $row->activity_title;
                            }
                            if ($row->campaign_title) {
                                $entry['campaignTitle'] = $row->campaign_title;
                            }
                            if ($row->brief) {
                                $entry['brief'] = $isLiveRow ? Str::limit((string) $row->brief, 140) : $row->brief;
                            }
                            if ($row->caption) {
                                $entry['caption'] = $isLiveRow ? Str::limit((string) $row->caption, 140) : $row->caption;
                            }
                            if ($row->published_url) {
                                $entry['publishedUrl'] = $row->published_url;
                            }
                            if ($row->ig_media_id) {
                                $entry['igMediaId'] = $row->ig_media_id;
                            }
                            if ($row->ig_media_url) {
                                $entry['igMediaUrl'] = $row->ig_media_url;
                            }
                            if ($row->ig_thumbnail_url) {
                                $entry['igThumbnailUrl'] = $row->ig_thumbnail_url;
                            }
                            if ($row->ref_design_url) {
                                $entry['refDesignUrl'] = $row->ref_design_url;
                            }
                            if ($row->result_design_url) {
                                $entry['resultDesignUrl'] = $row->result_design_url;
                            }
                            if ($row->revision_note) {
                                $entry['revisionNote'] = $row->revision_note;
                            }
                            if ($row->performance_notes) {
                                $entry['performanceNotes'] = $row->performance_notes;
                            }
                            if ($row->reach !== null) {
                                $entry['reach'] = (int) $row->reach;
                            }
                            if ($row->saves !== null) {
                                $entry['saves'] = (int) $row->saves;
                            }
                            if ($row->reels_watch_time !== null) {
                                $entry['reelsWatchTime'] = (int) $row->reels_watch_time;
                            }
                            if ($row->reels_avg_watch_time !== null) {
                                $entry['reelsAvgWatchTime'] = (float) $row->reels_avg_watch_time;
                            }
                            if ($row->is_ad_boosted) {
                                $entry['isAdBoosted'] = true;
                            }
                            if ($row->ad_spend !== null) {
                                $entry['adSpend'] = (float) $row->ad_spend;
                            }
                            if ($row->grid_position !== null) {
                                $entry['gridPosition'] = (int) $row->grid_position;
                            }
                            if ($row->created_by) {
                                $entry['createdBy'] = (string) $row->created_by;
                            }
                            $contentItems[] = $entry;
                            if ($idStr !== '') {
                                $existingContentById[$idStr] = true;
                            }
                            if ($codeStr !== '') {
                                $existingContentByCode[$codeStr] = true;
                            }
                        }

                        if (! $includePublications || ! in_array($row->status, ['ready_to_publish', 'published'], true)) {
                            continue;
                        }

                        $matchedPubIdx = null;
                        if (isset($pubIdxByContentItemId[$idStr])) {
                            $matchedPubIdx = $pubIdxByContentItemId[$idStr];
                        } elseif ($codeStr !== '') {
                            $cpKey = strtolower($codeStr).'|'.strtolower((string) $row->platform);
                            if (isset($pubIdxByCodePlatform[$cpKey])) {
                                $matchedPubIdx = $pubIdxByCodePlatform[$cpKey];
                            }
                        }

                        $hasApiMetrics = $row->metrics_synced_at !== null
                            || $row->reach !== null
                            || (int) $row->views > 0
                            || (int) $row->likes > 0
                            || (int) $row->comments_count > 0
                            || (int) $row->shares > 0
                            || $row->saves !== null;

                        $effectiveReach = $row->reach !== null
                            ? (int) $row->reach
                            : ((int) $row->views > 0
                                ? (int) $row->views
                                : (($row->likes !== null || $row->comments_count !== null) && ((int) $row->likes > 0 || (int) $row->comments_count > 0)
                                    ? ((int) $row->likes + (int) $row->comments_count)
                                    : null));

                        $schedStr = ($pubDate ?? now()->toDateString()).' '.($row->publish_time ?: '10:00');
                        $recordedAtStr = $row->metrics_synced_at
                            ? Carbon::parse((string) $row->metrics_synced_at)->format('Y-m-d H:i')
                            : $schedStr;

                        if ($matchedPubIdx !== null) {
                            if ($row->status === 'published' && empty($publications[$matchedPubIdx]['publishedUrl']) && ! empty($row->published_url)) {
                                $publications[$matchedPubIdx]['publishedUrl'] = $row->published_url;
                            }
                            $existingMetricSource = (string) ($publications[$matchedPubIdx]['metrics']['source'] ?? 'api');
                            if ($row->status === 'published' && $hasApiMetrics && $row->metrics_synced_at !== null && $existingMetricSource === 'api') {
                                $publications[$matchedPubIdx]['metrics'] = [
                                    'reach' => $effectiveReach,
                                    'impressions' => (int) $row->views > 0 ? (int) $row->views : $effectiveReach,
                                    'views' => (int) $row->views,
                                    'likes' => (int) $row->likes,
                                    'comments' => (int) $row->comments_count,
                                    'shares' => (int) $row->shares,
                                    'saves' => $row->saves !== null ? (int) $row->saves : null,
                                    'clicks' => $publications[$matchedPubIdx]['metrics']['clicks'] ?? null,
                                    'source' => 'api',
                                    'recordedAt' => $recordedAtStr,
                                ];
                            }

                            continue;
                        }

                        $synId = 'pub-db-'.$idStr;
                        $isLive = $row->status === 'published';
                        $newPubIdx = count($publications);
                        $publications[] = [
                            'id' => $synId,
                            'contentItemId' => $idStr,
                            'contentId' => $codeStr,
                            'title' => (string) $row->title,
                            'platform' => (string) $row->platform,
                            'format' => (string) $row->format,
                            'caption' => $row->caption ? Str::limit((string) $row->caption, 140) : '',
                            'mediaPreviewUrl' => $row->result_design_url ?: $row->ig_thumbnail_url ?: $row->ig_media_url,
                            'scheduledAt' => $schedStr,
                            'publishedActualAt' => $isLive ? $schedStr : null,
                            'publishedUrl' => $row->published_url,
                            'picName' => (string) ($row->pic_name ?: 'Publisher HUMAS'),
                            'checklist' => $isLive
                                ? []
                                : ($dbChecklists[$synId] ?? self::defaultChecklistForPlatform((string) $row->platform)),
                            'metrics' => ($isLive && $hasApiMetrics) ? [
                                'reach' => $effectiveReach,
                                'impressions' => (int) $row->views > 0 ? (int) $row->views : $effectiveReach,
                                'views' => (int) $row->views,
                                'likes' => (int) $row->likes,
                                'comments' => (int) $row->comments_count,
                                'shares' => (int) $row->shares,
                                'saves' => $row->saves !== null ? (int) $row->saves : null,
                                'clicks' => null,
                                'source' => $row->metrics_synced_at !== null ? 'api' : 'manual',
                                'recordedAt' => $recordedAtStr,
                            ] : null,
                        ];
                        $pubIdxByContentItemId[$idStr] = $newPubIdx;
                        if ($codeStr !== '') {
                            $pubIdxByCodePlatform[strtolower($codeStr).'|'.strtolower((string) $row->platform)] = $newPubIdx;
                        }
                    }
                    unset($rows, $tasksByItemId, $ticketsByItemId);
                } else {
                    $relations = [
                        'tasks',
                        'comments' => static fn ($q) => $q->latest('id')->limit(20),
                        'history' => static fn ($q) => $q->reorder('id', 'desc')->limit(15),
                        'haloApuTicket',
                    ];
                    if (Schema::hasTable('instagram_comments')) {
                        $relations['igComments'] = static fn ($q) => $q->limit(20);
                    }
                    $dbQuery = ContentItem::with($relations);

                    if ($scopeMonth !== null && $scopeCurrentMonth !== null) {
                        $monthStart = $scopeMonth.'-01';
                        $nextMonthStart = Carbon::createFromFormat('Y-m', $scopeMonth)->addMonthNoOverflow()->format('Y-m-01');
                        $dbQuery->where(function ($q) use ($monthStart, $nextMonthStart, $scopeMonth, $scopeCurrentMonth): void {
                            $q->where(function ($qm) use ($monthStart, $nextMonthStart): void {
                                $qm->where('publish_date', '>=', $monthStart)
                                    ->where('publish_date', '<', $nextMonthStart);
                            });
                            if ($scopeMonth === $scopeCurrentMonth) {
                                $q->orWhereNull('publish_date')
                                    ->orWhere(function ($qCarry) use ($monthStart): void {
                                        $qCarry->where('publish_date', '<', $monthStart)
                                            ->where('status', '!=', 'published');
                                    });
                            }
                        });
                    }

                    $dbItems = $dbQuery
                        ->orderByDesc('publish_date')
                        ->orderByDesc('id')
                        ->get();

                    $resolvedDbItems = ContentItemResource::collection($dbItems)->resolve();
                    $existingContentById = [];
                    $existingContentByCode = [];
                    foreach ($contentItems as $c) {
                        if (isset($c['id']) && $c['id'] !== '') {
                            $existingContentById[(string) $c['id']] = true;
                        }
                        if (! empty($c['contentId'])) {
                            $existingContentByCode[(string) $c['contentId']] = true;
                        }
                    }
                    foreach ($resolvedDbItems as $dbArr) {
                        $dbIdKey = (string) ($dbArr['id'] ?? '');
                        $dbCodeKey = (string) ($dbArr['contentId'] ?? '');
                        if (($dbIdKey !== '' && isset($existingContentById[$dbIdKey])) || ($dbCodeKey !== '' && isset($existingContentByCode[$dbCodeKey]))) {
                            continue;
                        }
                        $contentItems[] = $dbArr;
                        if ($dbIdKey !== '') {
                            $existingContentById[$dbIdKey] = true;
                        }
                        if ($dbCodeKey !== '') {
                            $existingContentByCode[$dbCodeKey] = true;
                        }
                    }

                    if ($includePublications) {
                        $pubIdxByContentItemId = [];
                        $pubIdxByCodePlatform = [];
                        foreach ($publications as $pIdx => $existingPub) {
                            if (! empty($existingPub['contentItemId'])) {
                                $pubIdxByContentItemId[(string) $existingPub['contentItemId']] = $pIdx;
                            }
                            if (! empty($existingPub['contentId'])) {
                                $cpKey = strtolower((string) $existingPub['contentId']).'|'.strtolower((string) ($existingPub['platform'] ?? ''));
                                $pubIdxByCodePlatform[$cpKey] = $pIdx;
                            }
                        }

                        foreach ($dbItems as $dbItem) {
                            if (! in_array($dbItem->status, ['ready_to_publish', 'published'], true)) {
                                continue;
                            }

                            $matchedPubIdx = null;
                            $dbItemIdStr = (string) $dbItem->id;
                            if (isset($pubIdxByContentItemId[$dbItemIdStr])) {
                                $matchedPubIdx = $pubIdxByContentItemId[$dbItemIdStr];
                            } elseif (! empty($dbItem->content_id)) {
                                $cpKey = strtolower((string) $dbItem->content_id).'|'.strtolower((string) $dbItem->platform);
                                if (isset($pubIdxByCodePlatform[$cpKey])) {
                                    $matchedPubIdx = $pubIdxByCodePlatform[$cpKey];
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
                                : ((int) $dbItem->views > 0
                                    ? (int) $dbItem->views
                                    : (($dbItem->likes !== null || $dbItem->comments_count !== null) && ((int) $dbItem->likes > 0 || (int) $dbItem->comments_count > 0)
                                        ? ((int) $dbItem->likes + (int) $dbItem->comments_count)
                                        : null));

                            $schedStr = ($dbItem->publish_date?->toDateString() ?? now()->toDateString()).' '.($dbItem->publish_time ?: '10:00');

                            if ($matchedPubIdx !== null) {
                                if ($dbItem->status === 'published' && empty($publications[$matchedPubIdx]['publishedUrl']) && ! empty($dbItem->published_url)) {
                                    $publications[$matchedPubIdx]['publishedUrl'] = $dbItem->published_url;
                                }
                                $existingMetricSource = (string) ($publications[$matchedPubIdx]['metrics']['source'] ?? 'api');
                                if ($dbItem->status === 'published' && $hasApiMetrics && $dbItem->metrics_synced_at !== null && $existingMetricSource === 'api') {
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
                            $newPubIdx = count($publications);
                            $publications[] = [
                                'id' => $synId,
                                'contentItemId' => (string) $dbItem->id,
                                'contentId' => (string) $dbItem->content_id,
                                'title' => (string) $dbItem->title,
                                'platform' => (string) $dbItem->platform,
                                'format' => (string) $dbItem->format,
                                'caption' => $dbItem->caption ? Str::limit((string) $dbItem->caption, 140) : '',
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
                            $pubIdxByContentItemId[(string) $dbItem->id] = $newPubIdx;
                            if (! empty($dbItem->content_id)) {
                                $pubIdxByCodePlatform[strtolower((string) $dbItem->content_id).'|'.strtolower((string) $dbItem->platform)] = $newPubIdx;
                            }
                        }
                    }
                    unset($dbItems, $resolvedDbItems);
                }
            } catch (\Throwable) {
                // Ignore DB errors during early bootstrap
            }
        }

        $state = [
            'currentUser' => $currentUser,
            'can' => self::permissionsForRole($activeRole),
            'personas' => array_values($personas),
            'contentItems' => $contentItems,
            'activities' => $session->get('sparc_v3.activities', []),
            'publications' => $publications,
            'assets' => (function () use ($session) {
                $assets = $session->get('sparc_v3.assets');
                if ($assets === null || (! $session->has('sparc_v3.assets_touched') && empty($assets))) {
                    $assets = self::defaultSeedAssets();
                    $session->put('sparc_v3.assets', $assets);
                }

                return $assets;
            })(),
            'team' => self::loadRealTeam(),
            'settings' => (function () use ($session, $request) {
                $s = $session->get('sparc_v3.settings', []);
                $s['instagram'] = self::resolveInstagramSettingsPayload($request);
                $s['haloApu'] = self::resolveHaloApuSettingsPayload();

                return $s;
            })(),
            'notifications' => $session->get('sparc_v3.notifications', []),
        ];

        if ($request->isMethodSafe() && count($contentItems) <= 200) {
            $request->attributes->set($cacheAttrKey, $state);
        }

        return $state;
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
     * Resolve `?month=YYYY-MM`; invalid or missing input falls back to the current month.
     */
    private static function resolveRequestedMonth(Request $request): string
    {
        $month = (string) $request->query('month', '');

        return preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month) === 1 ? $month : now()->format('Y-m');
    }

    /**
     * Keep items whose publishDate falls in $month. When $month is the current month, also keep
     * undated items and unpublished items from earlier months (flagged `isCarryOver`).
     *
     * @param  array<int, array<string, mixed>>  $items
     * @return array<int, array<string, mixed>>
     */
    private static function scopeItemsToMonth(array $items, string $month, string $currentMonth): array
    {
        $scoped = [];

        foreach ($items as $item) {
            $itemMonth = substr((string) ($item['publishDate'] ?? ''), 0, 7);
            if ($itemMonth === $month) {
                $scoped[] = $item;

                continue;
            }

            if ($month !== $currentMonth) {
                continue;
            }

            if ($itemMonth === '') {
                $scoped[] = $item;

                continue;
            }

            if ($itemMonth < $month && self::normalizeStatus((string) ($item['status'] ?? '')) !== 'published') {
                $item['isCarryOver'] = true;
                $scoped[] = $item;
            }
        }

        return $scoped;
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
        $state = self::hydrateWorkspace($request, ['liteRelations' => true]);
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
        if ($request->isMethodSafe() && $request->attributes->has('_sparc_incoming_tickets')) {
            /** @var array<int, array<string, mixed>> $cachedTickets */
            $cachedTickets = $request->attributes->get('_sparc_incoming_tickets');

            return $cachedTickets;
        }

        if (! Schema::hasTable('haloapu_tickets')) {
            return [];
        }

        /** @var array<string, string> $overrides */
        $overrides = $request->hasSession() ? $request->session()->get('sparc.ticket_overrides', []) : [];

        $tickets = HaloApuTicket::orderBy('id')
            ->limit(50)
            ->get()
            ->map(function (HaloApuTicket $t) use ($overrides): array {
                $id = (string) $t->id;
                $statusOverride = $overrides[$id] ?? ($overrides[$t->haloapu_ticket_id] ?? null);

                return [
                    'id' => $id,
                    'haloapuTicketId' => $t->haloapu_ticket_id,
                    'sourceType' => $t->source_type,
                    'title' => $t->title,
                    'brief' => $t->brief ?? '',
                    'requesterName' => $t->requester_name,
                    'requesterUnit' => $t->requester_unit ?? '',
                    'requesterAvatar' => (function () use ($t) {
                        $avatar = (string) ($t->requester_avatar ?? '');
                        if (! empty($avatar)) {
                            if (! str_starts_with($avatar, 'http')) {
                                $conn = HaloApuConnection::current();
                                $haloBase = rtrim((string) ($conn->base_url ?: 'http://127.0.0.1:8001'), '/');

                                return $haloBase.'/'.ltrim($avatar, '/');
                            }
                            if (str_contains($avatar, ':8000/storage/avatars/')) {
                                return str_replace(':8000/storage/avatars/', ':8001/storage/avatars/', $avatar);
                            }

                            return $avatar;
                        }

                        return 'https://ui-avatars.com/api/?name='.urlencode($t->requester_name ?: 'HaloAPU').'&background=1546D8&color=fff&size=128&bold=true';
                    })(),
                    'targetDate' => $t->target_date?->toDateString() ?? '',
                    'haloapuStatus' => $statusOverride ?: $t->haloapu_status,
                    'syncStatus' => $statusOverride ? 'converted' : $t->sync_status,
                    'revisionCount' => (int) $t->revision_count,
                    'isResultAccepted' => (bool) $t->is_result_accepted,
                    'isSlaBreached' => (bool) $t->is_sla_breached,
                    'slaResponseDeadline' => $t->sla_response_deadline?->toIso8601String(),
                    'slaResolutionDeadline' => $t->sla_resolution_deadline?->toIso8601String(),
                    'createdAt' => $t->haloapu_created_at ? $t->haloapu_created_at->format('d M Y, H:i').' WIB' : '',
                    'formSnapshot' => (array) ($t->form_snapshot ?? []),
                    'attachments' => collect($t->attachments_payload ?? [])->map(fn ($a): array => [
                        'id' => isset($a['id']) ? (string) $a['id'] : null,
                        'fileName' => (string) ($a['fileName'] ?? 'Lampiran'),
                        'url' => (string) ($a['url'] ?? ''),
                        'fileSize' => isset($a['fileSize']) ? (string) $a['fileSize'] : null,
                    ])->all(),
                    'logs' => collect($t->logs_payload ?? [])->map(fn ($l): array => [
                        'id' => (string) ($l['id'] ?? Str::uuid()->toString()),
                        'aksi' => (string) ($l['aksi'] ?? 'update'),
                        'actor' => (string) ($l['actor'] ?? 'Sistem'),
                        'catatan' => (string) ($l['catatan'] ?? ''),
                        'timestamp' => (string) ($l['timestamp'] ?? ''),
                    ])->all(),
                ];
            })
            ->all();

        if ($request->isMethodSafe()) {
            $request->attributes->set('_sparc_incoming_tickets', $tickets);
        }

        return $tickets;
    }

    /**
     * Build 6-month Reach vs Interaction trend series, dynamically incorporating live October publications.
     *
     * @param  array<int, array<string, mixed>>  $publications
     * @return array<int, array{key: string, label: string, fullLabel: string, reach: int, interactions: int, byPlatform: array<string, array{reach: int, interactions: int}>}>
     */
    public static function buildPerformanceTrend(array $publications): array
    {
        $shortLabels = [
            1 => 'Jan', 2 => 'Feb', 3 => 'Mar', 4 => 'Apr', 5 => 'Mei', 6 => 'Jun',
            7 => 'Jul', 8 => 'Agu', 9 => 'Sep', 10 => 'Okt', 11 => 'Nov', 12 => 'Des',
        ];
        $fullLabels = [
            1 => 'Januari', 2 => 'Februari', 3 => 'Maret', 4 => 'April', 5 => 'Mei', 6 => 'Juni',
            7 => 'Juli', 8 => 'Agustus', 9 => 'September', 10 => 'Oktober', 11 => 'November', 12 => 'Desember',
        ];

        // Trailing 6 months ending at current operational month
        $referenceDate = Carbon::parse(self::TODAY);
        if (now()->gt($referenceDate)) {
            $referenceDate = now();
        }

        $historical = [];
        $byKey = [];

        for ($i = 5; $i >= 0; $i--) {
            $d = $referenceDate->copy()->subMonths($i);
            $mNum = (int) $d->format('n');
            $y = $d->format('Y');
            $key = $d->format('Y-m');

            $historical[] = [
                'key' => $key,
                'label' => $shortLabels[$mNum] ?? $d->format('M'),
                'fullLabel' => ($fullLabels[$mNum] ?? $d->format('F')).' '.$y,
                'byPlatform' => [
                    'instagram' => ['reach' => 0, 'interactions' => 0],
                    'youtube' => ['reach' => 0, 'interactions' => 0],
                    'tiktok' => ['reach' => 0, 'interactions' => 0],
                    'website' => ['reach' => 0, 'interactions' => 0],
                ],
            ];
            $byKey[$key] = count($historical) - 1;
        }

        // Dynamically add live publication metrics into their respective month bucket
        foreach ($publications as $pub) {
            $metrics = $pub['metrics'] ?? null;
            if (! is_array($metrics)) {
                continue;
            }
            $date = (string) ($pub['publishedActualAt'] ?? $pub['scheduledAt'] ?? '');
            $monthKey = strlen($date) >= 7 ? substr($date, 0, 7) : '';
            if (! isset($byKey[$monthKey])) {
                continue;
            }
            $targetIdx = $byKey[$monthKey];

            $platform = (string) ($pub['platform'] ?? 'other');
            if (! isset($historical[$targetIdx]['byPlatform'][$platform])) {
                $historical[$targetIdx]['byPlatform'][$platform] = ['reach' => 0, 'interactions' => 0];
            }
            $historical[$targetIdx]['byPlatform'][$platform]['reach'] += (int) ($metrics['reach'] ?? 0);
            $historical[$targetIdx]['byPlatform'][$platform]['interactions'] +=
                (int) ($metrics['likes'] ?? 0) +
                (int) ($metrics['comments'] ?? 0) +
                (int) ($metrics['shares'] ?? 0) +
                (int) ($metrics['saves'] ?? 0) +
                (int) ($metrics['clicks'] ?? 0);
        }

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
        $currentMonth = now()->format('Y-m');
        $month = self::resolveRequestedMonth($request);
        $state = self::hydrateWorkspace($request, [
            'includePublications' => false,
            'month' => $month,
            'currentMonth' => $currentMonth,
        ]);
        $items = $state['contentItems'];
        usort($items, static fn (array $a, array $b): int => strcmp((string) ($a['publishDate'] ?? ''), (string) ($b['publishDate'] ?? '')));
        $items = self::scopeItemsToMonth($items, $month, $currentMonth);

        return Inertia::render('Content/Index', [
            'today' => now()->toDateString(),
            'month' => $month,
            'currentMonth' => $currentMonth,
            'contentItems' => $items,
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
        $currentMonth = now()->format('Y-m');
        $month = self::resolveRequestedMonth($request);
        $state = self::hydrateWorkspace($request, [
            'includePublications' => false,
            'month' => $month,
            'currentMonth' => $currentMonth,
        ]);
        $items = $state['contentItems'];
        usort($items, static fn (array $a, array $b): int => strcmp((string) ($a['publishDate'] ?? ''), (string) ($b['publishDate'] ?? '')));
        $items = self::scopeItemsToMonth($items, $month, $currentMonth);

        return Inertia::render('Planner/Index', [
            'today' => now()->toDateString(),
            'month' => $month,
            'currentMonth' => $currentMonth,
            'contentItems' => $items,
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
        $state = self::hydrateWorkspace($request, ['includeRelations' => false]);
        $contentItems = $state['contentItems'];
        usort($contentItems, static fn (array $a, array $b): int => strcmp((string) ($a['publishDate'] ?? ''), (string) ($b['publishDate'] ?? '')));

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
        $state = self::hydrateWorkspace($request, ['includeRelations' => false]);
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
        $state = self::hydrateWorkspace($request, ['includeRelations' => false]);

        return Inertia::render('Report/Index', [
            'today' => now()->toDateString(),
            'contentItems' => $state['contentItems'],
            'publications' => $state['publications'],
            'team' => self::buildRealTeamWorkload($state['team'], $state['contentItems']),
            'instagramSettings' => $state['settings']['instagram'] ?? [],
        ]);
    }

    /**
     * Load real team directory directly from the database `users` table.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function loadRealTeam(): array
    {
        if (! Schema::hasTable('users')) {
            return [];
        }

        return User::orderBy('id')->get()->map(function (User $u): array {
            $role = (string) ($u->role ?: $u->primary_role ?: 'creator');

            return [
                'id' => (string) $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'roles' => [$role],
                'primaryRole' => $role,
                'avatar' => $u->avatar ?: 'https://ui-avatars.com/api/?name='.urlencode($u->name).'&background=1546D8&color=fff&size=128&bold=true',
                'activeTasks' => 0,
                'dueThisWeek' => 0,
                'overdueTasks' => 0,
                'effortHours' => 0,
                'capacityHours' => (int) ($u->capacity_hours ?: 30),
                'status' => 'Aktif',
            ];
        })->all();
    }

    /**
     * Build real operational team workload dynamically from assigned content items and deadlines.
     *
     * @param  array<int, array<string, mixed>>  $team
     * @param  array<int, array<string, mixed>>  $contentItems
     * @return array<int, array<string, mixed>>
     */
    public static function buildRealTeamWorkload(array $team, array $contentItems): array
    {
        $todayStr = now()->toDateString();
        $nextWeekStr = now()->addDays(7)->toDateString();

        return array_map(function (array $member) use ($contentItems, $todayStr, $nextWeekStr): array {
            $memberName = (string) ($member['name'] ?? '');
            $memberRole = (string) ($member['primaryRole'] ?? '');
            $memberId = (string) ($member['id'] ?? '');

            $assigned = collect($contentItems)->filter(function (array $item) use ($memberName, $memberId): bool {
                $picName = (string) ($item['picName'] ?? '');
                $createdBy = (string) ($item['created_by'] ?? $item['createdBy'] ?? '');

                return ($memberName !== '' && strcasecmp($picName, $memberName) === 0)
                    || ($memberId !== '' && $createdBy === $memberId);
            });

            $activeTasks = $assigned->filter(fn (array $i): bool => ($i['status'] ?? '') !== 'published')->count();

            $dueThisWeek = $assigned->filter(function (array $i) use ($todayStr, $nextWeekStr): bool {
                $deadline = (string) ($i['productionDeadline'] ?? ($i['publishDate'] ?? ''));

                return $deadline !== '' && $deadline >= $todayStr && $deadline <= $nextWeekStr;
            })->count();

            $overdueTasks = $assigned->filter(function (array $i) use ($todayStr): bool {
                $deadline = (string) ($i['productionDeadline'] ?? ($i['publishDate'] ?? ''));

                return ($i['status'] ?? '') !== 'published' && $deadline !== '' && $deadline < $todayStr;
            })->count();

            $capacityHours = (int) ($member['capacityHours'] ?? 30);
            $effortHours = $activeTasks * 5;

            $status = 'Aktif';
            if ($memberRole === 'viewer') {
                $status = 'Pemantau Eksekutif';
            } elseif ($overdueTasks > 0) {
                $status = 'Perlu Perhatian';
            } elseif ($effortHours > $capacityHours) {
                $status = 'Beban Tinggi';
            } elseif ($activeTasks > 0) {
                $status = 'Optimal';
            }

            $avatar = ! empty($member['avatar'])
                ? $member['avatar']
                : 'https://ui-avatars.com/api/?name='.urlencode($memberName).'&background=1546D8&color=fff&size=128&bold=true';

            return array_merge($member, [
                'activeTasks' => $activeTasks,
                'dueThisWeek' => $dueThisWeek,
                'overdueTasks' => $overdueTasks,
                'effortHours' => $effortHours,
                'capacityHours' => $capacityHours,
                'avatar' => $avatar,
                'status' => $status,
            ]);
        }, $team);
    }

    /**
     * Render Visual Asset Catalog (`GET /assets`).
     */
    public function assets(Request $request): Response
    {
        $state = self::hydrateWorkspace($request, ['includePublications' => false, 'includeRelations' => false]);

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
        $state = self::hydrateWorkspace($request, ['includePublications' => false, 'includeRelations' => false]);

        return Inertia::render('Team/Index', [
            'team' => self::buildRealTeamWorkload($state['team'], $state['contentItems']),
            'contentItems' => $state['contentItems'],
        ]);
    }

    /**
     * Render System Settings & HALO APU Integration (`GET /settings` — Admin only).
     */
    public function settings(Request $request): Response
    {
        $auth = self::resolveAuthContextData($request);
        if (! $auth['can']['manageSettings']) {
            abort(403, 'Hanya Administrator yang memiliki izin membuka Pengaturan Sistem.');
        }

        $settings = $request->hasSession() ? $request->session()->get('sparc_v3.settings', []) : [];
        $settings['instagram'] = self::resolveInstagramSettingsPayload($request);
        $settings['haloApu'] = self::resolveHaloApuSettingsPayload();

        return Inertia::render('Settings/Index', [
            'settings' => $settings,
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
        $since = $request->query('since');
        $sinceTs = is_string($since) && $since !== '' ? strtotime($since) : false;

        /** @var array<int, array<string, mixed>> $notifications */
        $notifications = $request->hasSession() ? (array) $request->session()->get('sparc_v3.notifications', []) : [];

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

        $hasContentTable = Schema::hasTable('content_items');
        $overdueCount = $hasContentTable
            ? ContentItem::where('status', '!=', 'published')
                ->whereNotNull('production_deadline')
                ->whereDate('production_deadline', '<', self::TODAY)
                ->count()
            : 0;

        $publishTodayCount = $hasContentTable
            ? ContentItem::where('status', 'ready_to_publish')
                ->whereDate('publish_date', self::TODAY)
                ->count()
            : 0;

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

    /**
     * Return full details (caption, brief, tasks, comments, history, igComments) for one ContentItem (`GET /content/{id}/detail`).
     */
    public function showContentDetail(Request $request, string $id): JsonResponse
    {
        $item = $this->resolveContentItem($id);
        if (! $item) {
            return response()->json(['message' => 'Konten tidak ditemukan.'], 404);
        }

        $relations = [
            'tasks',
            'comments' => static fn ($q) => $q->latest('id')->limit(30),
            'history' => static fn ($q) => $q->reorder('id', 'desc')->limit(25),
            'haloApuTicket',
        ];
        if (Schema::hasTable('instagram_comments')) {
            $relations['igComments'] = static fn ($q) => $q->limit(30);
        }
        $item->load($relations);
        $item->setAttribute('_sparc_has_full_detail', true);

        return response()->json((new ContentItemResource($item))->resolve($request));
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

        if (! empty($validated['pic_name']) && $validated['pic_name'] !== 'Belum Ditugaskan' && $item->haloApuTicket) {
            $item->haloApuTicket->update([
                'assigned_operator_name' => $validated['pic_name'],
            ]);
        }

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

        if ($targetStatus === 'published') {
            app(HaloApuClientService::class)->handlePublishedContent($item, $item->published_url);
        }

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

        $result = $service->syncAndAutoImportRecentMedia(0, true);

        if (! ($result['success'] ?? false)) {
            self::flashToast(
                $request,
                'error',
                'Sinkronisasi Massal Gagal',
                $result['error'] ?? 'Terjadi kesalahan saat berkomunikasi dengan server Meta.'
            );

            return back();
        }

        $this->syncSessionPublicationsFromIgResult($request, $result['synced_items']);
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
     * Execute one resumable Instagram sync batch (`POST /content/instagram/sync-batch`) for unlimited cPanel-safe sync.
     */
    public function syncInstagramBatch(Request $request): JsonResponse
    {
        $authUser = $request->user();
        $sessionRole = $request->hasSession() ? $request->session()->get('sparc_v3.active_role') : null;
        $activeRole = ! empty($sessionRole)
            ? (string) $sessionRole
            : (string) ($authUser?->role ?: $authUser?->primary_role ?: 'admin');
        $can = self::permissionsForRole($activeRole);
        if (! ($can['editContent'] || $can['managePublishing'])) {
            abort(403, 'Peran Anda tidak diizinkan menyinkronkan metrik konten.');
        }

        $validated = $request->validate([
            'after' => ['nullable', 'string', 'max:1000'],
            'batch_size' => ['nullable', 'integer', 'min:10', 'max:100'],
            'finish' => ['nullable', 'boolean'],
        ]);

        $service = new InstagramGraphService;
        if (! $service->isConfigured()) {
            return response()->json([
                'success' => false,
                'error' => 'Kredensial Instagram Graph API belum terhubung. Hubungkan akun Instagram di menu Pengaturan terlebih dahulu.',
            ], 422);
        }

        if ($request->boolean('finish')) {
            $service->syncAccountProfileAndInsights();

            return response()->json([
                'success' => true,
                'finished' => true,
            ]);
        }

        $after = isset($validated['after']) && trim((string) $validated['after']) !== ''
            ? trim((string) $validated['after'])
            : null;
        $batchSize = (int) ($validated['batch_size'] ?? 100);

        $result = $service->syncAndAutoImportRecentMedia($batchSize, true, $after);
        if (! ($result['success'] ?? false)) {
            return response()->json([
                'success' => false,
                'error' => $result['error'] ?? 'Terjadi kesalahan saat berkomunikasi dengan server Meta.',
            ], 422);
        }

        $this->syncSessionPublicationsFromIgResult($request, $result['synced_items']);

        return response()->json([
            'success' => true,
            'fetched_count' => (int) ($result['fetched_count'] ?? count($result['synced_items'])),
            'synced_count' => (int) ($result['synced_count'] ?? 0),
            'imported_count' => (int) ($result['imported_count'] ?? 0),
            'next_cursor' => $result['next_cursor'] ?? null,
            'has_more' => (bool) ($result['has_more'] ?? false),
        ]);
    }

    /**
     * Mirror synchronized Instagram metrics into session publications array for the Performance Report table.
     *
     * @param  array<int, array<string, mixed>>  $syncedItems
     */
    private function syncSessionPublicationsFromIgResult(Request $request, array $syncedItems): void
    {
        if (empty($syncedItems)) {
            return;
        }

        /** @var array<int, array<string, mixed>> $pubs */
        $pubs = $request->session()->get('sparc_v3.publications', []);
        $updatedPubs = false;

        foreach ($syncedItems as $synced) {
            foreach ($pubs as $idx => $pub) {
                if (
                    strcasecmp((string) ($pub['contentId'] ?? ''), (string) ($synced['content_id'] ?? '')) === 0
                    && strtolower((string) ($pub['platform'] ?? '')) === 'instagram'
                ) {
                    $pubs[$idx]['metrics'] = [
                        'reach' => isset($synced['reach']) && $synced['reach'] !== null ? (int) $synced['reach'] : (int) ($synced['views'] ?? 0),
                        'impressions' => (int) ($synced['views'] ?? 0),
                        'views' => (int) ($synced['views'] ?? 0),
                        'likes' => (int) ($synced['likes'] ?? 0),
                        'comments' => (int) ($synced['comments_count'] ?? 0),
                        'shares' => (int) ($synced['shares'] ?? 0),
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
     * Delete an item from the calendar (`DELETE /calendar/items`).
     */
    public function destroyCalendarItem(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['editContent']) {
            abort(403, 'Peran Anda tidak diizinkan menghapus jadwal kalender.');
        }

        $validated = $request->validate([
            'uid' => ['required', 'string'],
            'entity_type' => ['required', 'string', 'in:activity,production,publish'],
            'entity_id' => ['required', 'string'],
        ]);

        $uid = $validated['uid'];
        $entityType = $validated['entity_type'];
        $entityId = $validated['entity_id'];

        $idCandidates = array_values(array_unique(array_filter([
            $entityId,
            $uid,
            preg_replace('/^act-/', '', $entityId),
            preg_replace('/^act-/', '', $uid),
            'act-'.ltrim($entityId, 'act-'),
            'act-'.ltrim($uid, 'act-'),
            'e-'.preg_replace('/^(ev|e)-/', '', $entityId),
            'e-'.preg_replace('/^(ev|e)-/', '', $uid),
        ])));

        if ($entityType === 'activity' || str_starts_with($uid, 'act-')) {
            /** @var array<int, array<string, mixed>> $activities */
            $activities = $request->session()->get('sparc_v3.activities', []);
            $activities = array_values(array_filter(
                $activities,
                fn (array $act): bool => ! in_array($act['id'] ?? '', $idCandidates, true)
            ));
            $request->session()->put('sparc_v3.activities', $activities);

            self::flashToast(
                $request,
                'info',
                'Agenda Dihapus',
                'Agenda kelembagaan berhasil dihapus dari kalender.'
            );

            return back();
        }

        if (str_starts_with($uid, 'ev-') || str_starts_with($uid, 'e-')) {
            /** @var array<int, array<string, mixed>> $events */
            $events = $request->session()->get('sparc.calendar_events', []);
            $events = array_values(array_filter(
                $events,
                fn (array $ev): bool => ! in_array($ev['id'] ?? '', $idCandidates, true)
            ));
            $request->session()->put('sparc.calendar_events', $events);

            self::flashToast(
                $request,
                'info',
                'Jadwal Dihapus',
                'Jadwal publikasi berhasil dihapus dari kalender.'
            );

            return back();
        }

        // Production / Publication linked to ContentItem
        $cleanContentId = preg_replace('/^(prod|pub)-/', '', $entityId);
        $dbItem = ContentItem::where('id', $entityId)
            ->orWhere('content_id', $entityId)
            ->orWhere('id', $cleanContentId)
            ->orWhere('content_id', $cleanContentId)
            ->first();

        if ($dbItem) {
            $title = $dbItem->title;
            $dbItem->delete();

            $deleted = (array) $request->session()->get('sparc.deleted_planner_ids', []);
            $deleted[] = (string) $dbItem->id;
            $deleted[] = $dbItem->content_id;
            $request->session()->put('sparc.deleted_planner_ids', array_unique($deleted));

            self::flashToast(
                $request,
                'info',
                'Jadwal Konten Dihapus',
                sprintf('"%s" berhasil dihapus dari kalender dan dipindahkan ke Trash.', $title)
            );
        } else {
            /** @var array<int, array<string, mixed>> $items */
            $items = $request->session()->get('sparc_v3.content_items', []);
            $items = array_values(array_filter(
                $items,
                fn (array $item): bool => ($item['id'] ?? '') !== $entityId && ($item['contentId'] ?? '') !== $entityId
            ));
            $request->session()->put('sparc_v3.content_items', $items);

            self::flashToast(
                $request,
                'info',
                'Jadwal Dihapus',
                'Jadwal berhasil dihapus dari kalender.'
            );
        }

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
        if ($validated['key'] === '__all__') {
            if (str_starts_with($id, 'pub-db-')) {
                $dbItem = ContentItem::find((int) substr($id, 7));
                if ($dbItem) {
                    $dbChecklists = $request->session()->get('sparc_v3.db_pub_checklists', []);
                    $checklist = $dbChecklists[$id] ?? self::defaultChecklistForPlatform((string) $dbItem->platform);
                    foreach ($checklist as $cIdx => $cItem) {
                        $checklist[$cIdx]['checked'] = $validated['checked'];
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
                        $checklist[$cIdx]['checked'] = $validated['checked'];
                    }
                    $pubs[$idx]['checklist'] = $checklist;
                }
            }
            $request->session()->put('sparc_v3.publications', $pubs);

            return back();
        }

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
                app(HaloApuClientService::class)->handlePublishedContent($dbItem, $validated['published_url'] ?? null);

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
     * Export complete 5-sheet styled OpenXML Excel (.xlsx) Performance Report (`GET /report/export-excel`).
     */
    public function exportReportExcel(Request $request, SparcExcelReportService $excelService): HttpResponse
    {
        $state = self::hydrateWorkspace($request);
        $today = now()->toDateString();

        $validated = $request->validate([
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'format' => ['nullable', 'in:all,reels,feed,carousel'],
            'platform' => ['nullable', 'string'],
            'layer' => ['nullable', 'string'],
        ]);

        $platformFilter = (string) ($validated['platform'] ?? $request->query('platform', 'all'));
        $activeLayer = (string) ($validated['layer'] ?? $request->query('layer', 'content'));
        $formatFilter = (string) ($validated['format'] ?? $request->query('format', 'all'));
        $dateFrom = $validated['date_from'] ?? null;
        $dateTo = $validated['date_to'] ?? null;

        $binary = $excelService->generateReportWorkbook([
            'today' => $today,
            'platformFilter' => $platformFilter,
            'formatFilter' => $formatFilter,
            'dateFrom' => $dateFrom,
            'dateTo' => $dateTo,
            'activeLayer' => $activeLayer,
            'publications' => $state['publications'],
            'contentItems' => $state['contentItems'],
            'team' => self::buildRealTeamWorkload($state['team'], $state['contentItems']),
            'instagramSettings' => $state['settings']['instagram'] ?? [],
        ]);

        if (! empty($dateFrom) || ! empty($dateTo)) {
            $filename = sprintf(
                'Laporan-Performa-SPARC-%s_sd_%s.xlsx',
                $dateFrom ?: 'awal',
                $dateTo ?: 'sekarang'
            );
        } else {
            $filename = sprintf('Laporan-Performa-SPARC-%s.xlsx', $today);
        }

        return response($binary, 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
            'Cache-Control' => 'max-age=0, no-cache, no-store, must-revalidate',
        ]);
    }

    /**
     * Download pre-populated Excel (.xlsx) template for batch metric import (`GET /report/template-excel`).
     */
    public function downloadReportTemplateExcel(Request $request, SparcExcelReportService $excelService): HttpResponse
    {
        $state = self::hydrateWorkspace($request);
        $today = now()->toDateString();

        $binary = $excelService->generateImportTemplateWorkbook($state['publications'], $today);
        $filename = sprintf('Template-Impor-Metrik-SPARC-%s.xlsx', $today);

        return response($binary, 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
            'Cache-Control' => 'max-age=0, no-cache, no-store, must-revalidate',
        ]);
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
        $pubs = $state['publications'];
        $targetTitle = 'Publikasi';

        $nullableMetric = static fn (array $data, string $key): ?int => isset($data[$key]) && $data[$key] !== ''
            ? (int) $data[$key]
            : null;

        foreach ($pubs as $idx => $pub) {
            if (($pub['id'] ?? '') === $validated['publication_id']) {
                $targetTitle = (string) ($pub['title'] ?? 'Publikasi');
                $newMetrics = [
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
                $pubs[$idx]['metrics'] = $newMetrics;
                self::syncPublicationMetricsToDb($pub, $newMetrics);
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
     * Parse and import Excel (.xlsx) or CSV/TSV performance rows (`POST /report/metrics/import-excel` & `/report/metrics/import-csv`).
     */
    public function importReportCsv(Request $request, SparcExcelReportService $excelService): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['managePublishing']) {
            abort(403, 'Peran Anda tidak diizinkan mengimpor data performa.');
        }

        $validated = $request->validate(
            [
                'excel_file' => ['nullable', 'file', 'max:10240'],
                'csv_text' => ['nullable', 'string'],
            ]
        );

        $hasFile = $request->hasFile('excel_file') && $request->file('excel_file')?->isValid();
        $csvText = trim((string) ($validated['csv_text'] ?? ''));

        if (! $hasFile && $csvText === '') {
            throw ValidationException::withMessages([
                'excel_file' => 'Pilih berkas Excel (.xlsx) atau tempelkan baris data dari tabel Excel.',
                'csv_text' => 'Pilih berkas Excel (.xlsx) atau tempelkan baris data dari tabel Excel.',
            ]);
        }

        try {
            $parsedRows = $hasFile
                ? $excelService->parseUploadedFile($request->file('excel_file'))
                : $excelService->parseTabularText($csvText);
        } catch (\Throwable $e) {
            throw ValidationException::withMessages([
                'excel_file' => $e->getMessage(),
                'csv_text' => $e->getMessage(),
            ]);
        }

        /** @var array<int, array<string, mixed>> $pubs */
        $pubs = $state['publications'];
        $sourceLabel = $hasFile ? 'excel' : 'csv';

        $matchedCount = 0;
        $skippedCount = 0;

        foreach ($parsedRows as $row) {
            $cId = trim((string) ($row['content_id'] ?? ''));
            $platform = strtolower(trim((string) ($row['platform'] ?? '')));

            if ($cId === '' || $platform === '') {
                $skippedCount++;

                continue;
            }

            $found = false;
            foreach ($pubs as $idx => $pub) {
                if (
                    strcasecmp((string) ($pub['contentId'] ?? ''), $cId) === 0
                    && strtolower((string) ($pub['platform'] ?? '')) === $platform
                ) {
                    $newMetrics = [
                        'reach' => $row['reach'],
                        'impressions' => $row['impressions'],
                        'views' => $row['views'],
                        'likes' => $row['likes'],
                        'comments' => $row['comments'],
                        'shares' => $row['shares'],
                        'saves' => $row['saves'],
                        'clicks' => $row['clicks'],
                        'source' => $sourceLabel,
                        'recordedAt' => self::TODAY.' '.now()->format('H:i'),
                    ];
                    $pubs[$idx]['metrics'] = $newMetrics;
                    self::syncPublicationMetricsToDb($pub, $newMetrics);
                    $found = true;
                    $matchedCount++;
                    break;
                }
            }

            if (! $found) {
                // Also check if a matching ContentItem exists in the workspace and auto-register its publication slot
                foreach ($state['contentItems'] as $cItem) {
                    if (strcasecmp((string) ($cItem['contentId'] ?? ''), $cId) === 0) {
                        $newMetrics = [
                            'reach' => $row['reach'],
                            'impressions' => $row['impressions'],
                            'views' => $row['views'],
                            'likes' => $row['likes'],
                            'comments' => $row['comments'],
                            'shares' => $row['shares'],
                            'saves' => $row['saves'],
                            'clicks' => $row['clicks'],
                            'source' => $sourceLabel,
                            'recordedAt' => self::TODAY.' '.now()->format('H:i'),
                        ];
                        $newPub = [
                            'id' => 'pub-excel-'.($cItem['id'] ?? Str::lower(Str::random(6))),
                            'contentItemId' => (string) ($cItem['id'] ?? ''),
                            'contentId' => (string) $cItem['contentId'],
                            'title' => (string) ($cItem['title'] ?? 'Konten Publikasi'),
                            'platform' => $platform !== '' ? $platform : strtolower((string) ($cItem['platform'] ?? 'instagram')),
                            'scheduledAt' => ((string) ($cItem['publishDate'] ?? self::TODAY)).' '.((string) ($cItem['publishTime'] ?? '10:00')),
                            'publishedActualAt' => self::TODAY.' '.now()->format('H:i'),
                            'publishedUrl' => $cItem['publishedUrl'] ?? null,
                            'picName' => (string) ($cItem['picName'] ?? 'Publisher HUMAS'),
                            'checklist' => [],
                            'metrics' => $newMetrics,
                        ];
                        $pubs[] = $newPub;
                        self::syncPublicationMetricsToDb($newPub, $newMetrics);
                        $found = true;
                        $matchedCount++;
                        break;
                    }
                }
            }

            if (! $found) {
                $skippedCount++;
            }
        }

        $request->session()->put('sparc_v3.publications', $pubs);

        if ($matchedCount === 0) {
            $errorMsg = sprintf(
                'Tidak ada baris yang cocok dengan kombinasi Kode Konten + Platform (%d baris dilewati). Pastikan Kode Konten sesuai dengan daftar publikasi.',
                $skippedCount
            );
            throw ValidationException::withMessages([
                'excel_file' => $errorMsg,
                'csv_text' => $errorMsg,
            ]);
        }

        self::flashToast(
            $request,
            $skippedCount > 0 ? 'warning' : 'success',
            'Impor Data Excel Selesai',
            sprintf('%d publikasi berhasil diperbarui%s.', $matchedCount, $skippedCount > 0 ? ", {$skippedCount} baris dilewati" : '')
        );

        return back();
    }

    /**
     * Synchronize manual or Excel-imported publication metrics back to the database `content_items` row when present.
     *
     * @param  array<string, mixed>  $pub
     * @param  array<string, mixed>  $metrics
     */
    protected static function syncPublicationMetricsToDb(array $pub, array $metrics): void
    {
        if (! Schema::hasTable('content_items')) {
            return;
        }

        try {
            $contentId = (string) ($pub['contentId'] ?? '');
            $platform = strtolower((string) ($pub['platform'] ?? ''));
            if ($contentId === '') {
                return;
            }

            $item = ContentItem::query()
                ->where('content_id', $contentId)
                ->when($platform !== '', static fn ($q) => $q->whereRaw('LOWER(platform) = ?', [$platform]))
                ->first();

            if (! $item) {
                return;
            }

            $item->update([
                'reach' => $metrics['reach'] ?? $item->reach,
                'views' => $metrics['views'] ?? $item->views ?? 0,
                'likes' => $metrics['likes'] ?? $item->likes ?? 0,
                'comments_count' => $metrics['comments'] ?? $item->comments_count ?? 0,
                'shares' => $metrics['shares'] ?? $item->shares ?? 0,
                'saves' => $metrics['saves'] ?? $item->saves,
            ]);
        } catch (\Throwable) {
            // Non-blocking sync to database
        }
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
                'category' => ['required', 'string', 'in:foto,video,ilustrasi,template_desain,infografis,dokumen,offline,online'],
                'session' => ['nullable', 'string', 'max:80'],
                'external_url' => [
                    'required',
                    'string',
                    'max:500',
                    function ($attribute, $value, $fail) use ($request) {
                        $cat = (string) $request->input('category');
                        if ($cat === 'offline') {
                            return;
                        }
                        if (in_array($cat, ['foto', 'video', 'ilustrasi', 'template_desain', 'infografis', 'dokumen'], true)) {
                            if (! filter_var($value, FILTER_VALIDATE_URL)) {
                                $fail('Masukkan URL aset yang valid (diawali https://).');
                            }
                        }
                    },
                ],
                'tags' => ['nullable', 'string', 'max:250'],
                'content_id' => ['nullable', 'string', 'max:30'],
            ],
            [
                'title.required' => 'Judul aset visual wajib diisi.',
                'external_url.required' => 'Tautan sumber aset atau lokasi media penyimpanan wajib diisi.',
            ]
        );

        $tagList = array_values(array_filter(array_map(
            fn (string $t): string => trim($t),
            explode(',', (string) ($validated['tags'] ?? ''))
        )));

        $externalUrl = trim($validated['external_url']);
        if ($validated['category'] === 'online' && ! preg_match('#^https?://#i', $externalUrl) && str_contains($externalUrl, '.')) {
            $externalUrl = 'https://'.$externalUrl;
        }

        $dimensions = match ($validated['category']) {
            'offline' => 'Media Fisik (Flashdisk / HDD / SSD)',
            'online' => 'Cloud Storage / Tautan Online',
            'video' => '1080p / 4K Footage',
            default => '1080 × 1350 px',
        };

        /** @var array<int, array<string, mixed>> $assets */
        $assets = $request->session()->get('sparc_v3.assets', []);
        array_unshift($assets, [
            'id' => 'ast-'.Str::lower(Str::random(5)),
            'title' => $validated['title'],
            'category' => $validated['category'],
            'session' => ($validated['session'] ?? null) ? trim((string) $validated['session']) : null,
            'tags' => $tagList ?: ['humas', 'resmi'],
            'externalUrl' => $externalUrl,
            'thumbnailUrl' => self::deriveAssetThumbnailUrl($externalUrl),
            'contentId' => ($validated['content_id'] ?? null) ?: null,
            'uploadedBy' => $state['currentUser']['name'],
            'createdAt' => now()->format('d M Y'),
            'dimensions' => $dimensions,
        ]);
        $request->session()->put('sparc_v3.assets', $assets);
        $request->session()->put('sparc_v3.assets_touched', true);

        self::flashToast(
            $request,
            'success',
            'Aset Visual Ditambahkan',
            sprintf('"%s" kini tersedia di Katalog Aset Visual.', $validated['title'])
        );

        return back();
    }

    /**
     * Derive a direct image thumbnail or domain favicon from an external asset URL.
     */
    public static function deriveAssetThumbnailUrl(string $url): string
    {
        $clean = trim($url);

        // YouTube video thumbnail
        if (preg_match('/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/', $clean, $m)) {
            return "https://img.youtube.com/vi/{$m[1]}/hqdefault.jpg";
        }

        // Direct image URL (extension in path or query)
        $path = (string) (parse_url($clean, PHP_URL_PATH) ?? '');
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'], true)) {
            return $clean;
        }

        if (preg_match('/\.(jpg|jpeg|png|webp|gif|svg)($|\?)/i', $clean) ||
            preg_match('/(images\.unsplash\.com|images\.pexels\.com|i\.imgur\.com|res\.cloudinary\.com)/i', $clean)) {
            return $clean;
        }

        // Domain favicon fallback
        $host = parse_url($clean, PHP_URL_HOST);
        if ($host) {
            $domain = preg_replace('/^www\./', '', $host);

            return "https://www.google.com/s2/favicons?domain={$domain}&sz=128";
        }

        return '';
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
        $request->session()->put('sparc_v3.assets_touched', true);

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
                'email' => ['required', 'email', 'max:150', 'unique:users,email'],
                'role' => ['nullable', 'string', 'in:admin,manager,planner,creator,publisher,viewer'],
                'roles' => ['nullable', 'array'],
                'roles.*' => ['string', 'in:admin,manager,planner,creator,publisher,viewer'],
                'password' => ['nullable', 'string', 'min:6', 'max:100'],
            ],
            [
                'name.required' => 'Nama lengkap anggota wajib diisi.',
                'email.required' => 'Alamat email kedinasan wajib diisi.',
                'email.email' => 'Format email tidak valid.',
                'email.unique' => 'Alamat email ini sudah terdaftar sebagai personel.',
            ]
        );

        $primaryRole = $validated['role'] ?? ($validated['roles'][0] ?? 'creator');
        $rawPassword = ! empty($validated['password']) ? $validated['password'] : Str::random(12);

        User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($rawPassword),
            'role' => $primaryRole,
            'primary_role' => $primaryRole,
            'capacity_hours' => 30,
            'avatar' => 'https://ui-avatars.com/api/?name='.urlencode($validated['name']).'&background=1546D8&color=fff&size=128&bold=true',
        ]);
        self::flashToast(
            $request,
            'success',
            'Personel Berhasil Ditambahkan',
            sprintf('Akun personel untuk %s (%s) telah resmi aktif di database SPARC.', $validated['name'], $validated['email'])
        );

        return back();
    }

    /**
     * Update a team member's role (`PATCH /team/{id}/role` — Admin & Manager only).
     */
    public function updateTeamMemberRole(Request $request, string $id): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['inviteTeam']) {
            abort(403, 'Hanya Kepala HUMAS atau Administrator yang dapat mengubah peran anggota.');
        }

        $validated = $request->validate([
            'role' => ['required', 'string', 'in:admin,manager,planner,creator,publisher,viewer'],
        ]);

        $user = User::findOrFail($id);
        $user->update([
            'role' => $validated['role'],
            'primary_role' => $validated['role'],
        ]);

        self::flashToast(
            $request,
            'success',
            'Peran Diperbarui',
            sprintf('Peran %s berhasil diubah ke %s.', $user->name, self::rolePersonas()[$validated['role']]['roleLabel'] ?? $validated['role'])
        );

        return back();
    }

    /**
     * Remove a member from HUMAS team (`DELETE /team/{id}` — Admin & Manager only).
     */
    public function destroyTeamMember(Request $request, string $id): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['inviteTeam']) {
            abort(403, 'Hanya Kepala HUMAS atau Administrator yang dapat menghapus anggota tim.');
        }

        if ((string) auth()->id() === (string) $id) {
            self::flashToast($request, 'error', 'Tindakan Ditolak', 'Anda tidak dapat menghapus akun Anda sendiri.');

            return back();
        }

        $user = User::findOrFail($id);
        $name = $user->name;
        $user->delete();

        self::flashToast(
            $request,
            'info',
            'Personel Dihapus',
            sprintf('%s telah dihapus dari direktori tim HUMAS.', $name)
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

        $start = microtime(true);
        try {
            $count = app(HaloApuClientService::class)->syncTickets();
            $latency = (int) round((microtime(true) - $start) * 1000);
            $status = 'success';
            $note = "Sinkronisasi manual berhasil. {$count} tiket diperbarui.";
            self::flashToast($request, 'success', 'Sinkronisasi HALO APU Berhasil', $note);
        } catch (\Throwable $e) {
            $latency = (int) round((microtime(true) - $start) * 1000);
            $status = 'error';
            $note = 'Gagal: '.$e->getMessage();
            self::flashToast($request, 'error', 'Sinkronisasi Gagal', $e->getMessage());
            $count = 0;
        }

        if (Schema::hasTable('haloapu_sync_logs')) {
            HaloApuSyncLog::create([
                'direction' => 'manual_pull',
                'event_type' => 'sync',
                'status' => $status,
                'fetched_count' => $count,
                'latency_ms' => $latency,
                'note' => $note,
            ]);
        }

        $settings = $request->session()->get('sparc_v3.settings', []);
        $logs = is_array($settings['haloApuLogs'] ?? null) ? $settings['haloApuLogs'] : [];
        array_unshift($logs, [
            'id' => 'sync-'.Str::lower(Str::random(5)),
            'timestamp' => now()->format('d M Y H:i:s'),
            'status' => $status === 'success' ? 'success' : 'error',
            'fetched' => $count,
            'latencyMs' => $latency,
            'note' => $note,
        ]);
        $settings['haloApuLogs'] = array_slice($logs, 0, 20);
        $settings['lastSyncAt'] = 'Baru saja ('.now()->format('H:i').' WIB)';
        $request->session()->put('sparc_v3.settings', $settings);

        self::pushNotification(
            $request,
            'info',
            'Sinkronisasi HALO APU',
            $note,
            '/incoming'
        );

        return back();
    }

    public function testHaloApuConnection(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['manageSettings']) {
            abort(403, 'Akses ditolak.');
        }

        $res = app(HaloApuClientService::class)->testConnection();
        if ($res['success']) {
            self::flashToast($request, 'success', 'Koneksi HaloAPU Berhasil', $res['message']);
        } else {
            self::flashToast($request, 'error', 'Koneksi HaloAPU Gagal', $res['message']);
        }

        return back();
    }

    public function updateHaloApuSettings(Request $request): RedirectResponse
    {
        $state = self::hydrateWorkspace($request);
        if (! $state['can']['manageSettings']) {
            abort(403, 'Akses ditolak.');
        }

        $validated = $request->validate([
            'base_url' => ['required', 'url', 'max:255'],
            'api_token' => ['nullable', 'string', 'max:255'],
            'webhook_secret' => ['nullable', 'string', 'max:255'],
            'auto_solve_on_publish' => ['nullable', 'boolean'],
        ]);

        $conn = HaloApuConnection::current();
        $updates = [
            'is_enabled' => true,
            'base_url' => rtrim($validated['base_url'], '/'),
            'auto_solve_on_publish' => $request->boolean('auto_solve_on_publish', true),
        ];

        if (! empty($validated['api_token'])) {
            $updates['api_token'] = $validated['api_token'];
        }
        if (! empty($validated['webhook_secret'])) {
            $updates['webhook_secret'] = $validated['webhook_secret'];
        }

        $conn->update($updates);

        self::flashToast($request, 'success', 'Pengaturan HaloAPU Disimpan', 'Konfigurasi integrasi berhasil diperbarui.');

        return back();
    }

    public static function resolveHaloApuSettingsPayload(): array
    {
        if (! Schema::hasTable('haloapu_connections')) {
            return [
                'isEnabled' => false,
                'baseUrl' => '',
                'autoSolveOnPublish' => true,
                'lastSyncAt' => 'Belum pernah',
                'lastStatus' => 'disconnected',
            ];
        }

        $conn = HaloApuConnection::current();

        return [
            'isEnabled' => (bool) $conn->is_enabled,
            'baseUrl' => (string) ($conn->base_url ?? ''),
            'autoSolveOnPublish' => (bool) ($conn->auto_solve_on_publish ?? true),
            'lastSyncAt' => $conn->last_synced_at ? $conn->last_synced_at->format('d M Y, H:i').' WIB' : 'Belum pernah',
            'lastStatus' => (string) ($conn->last_status ?? 'disconnected'),
        ];
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
            'adsData' => is_array($conn?->ads_data) ? $conn->ads_data : null,
            'demographicsData' => is_array($conn?->demographics_data) ? $conn->demographics_data : null,
            'storiesData' => is_array($conn?->stories_data) ? $conn->stories_data : [],
            'mentionsData' => is_array($conn?->mentions_data) ? $conn->mentions_data : null,
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
            'activities' => [],
            'publications' => [],
            'assets' => self::defaultSeedAssets(),
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
                'lastSyncAt' => 'Belum pernah',
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
                'haloApuLogs' => [],
            ],
            'notifications' => [],
        ];
    }

    /**
     * Default visual assets seeded for HUMAS catalog.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function defaultSeedAssets(): array
    {
        return [
            [
                'id' => 'ast-raw01',
                'title' => 'Master Footage Liputan 4K Hari Keterbukaan Informasi Publik',
                'category' => 'offline',
                'session' => 'Sesi 1 (Pembukaan & Pleno)',
                'tags' => ['footage', 'liputan', 'raw', 'offline', 'harddisk'],
                'externalUrl' => 'Harddisk Eksternal Humas 01 (Folder: RAW_2026/KIP)',
                'thumbnailUrl' => '',
                'contentId' => null,
                'uploadedBy' => 'Dimas Pratama',
                'createdAt' => '25 Okt 2026',
                'dimensions' => 'Media Fisik (HDD 2TB)',
            ],
            [
                'id' => 'ast-cld02',
                'title' => 'Folder Shared Drive Dokumentasi Video Humas Q3-Q4',
                'category' => 'online',
                'session' => 'Sesi Dokumentasi Tahunan',
                'tags' => ['drive', 'cloud', 'arsip', 'online'],
                'externalUrl' => 'https://drive.google.com/drive/folders/humas-dokumentasi-2026',
                'thumbnailUrl' => 'https://www.google.com/s2/favicons?domain=drive.google.com&sz=128',
                'contentId' => null,
                'uploadedBy' => 'Nadia Putri',
                'createdAt' => '26 Okt 2026',
                'dimensions' => 'Cloud Storage (Google Drive)',
            ],
            [
                'id' => 'ast-tpl03',
                'title' => 'Master Template Feed & Carousel Instagram SPARC 2026',
                'category' => 'template_desain',
                'tags' => ['template', 'canva', 'feed', 'carousel'],
                'externalUrl' => 'https://www.canva.com/design/DAFxxxxx/view',
                'thumbnailUrl' => 'https://www.google.com/s2/favicons?domain=canva.com&sz=128',
                'contentId' => null,
                'uploadedBy' => 'Dimas Pratama',
                'createdAt' => '27 Okt 2026',
                'dimensions' => '1080 × 1350 px',
            ],
        ];
    }
}
