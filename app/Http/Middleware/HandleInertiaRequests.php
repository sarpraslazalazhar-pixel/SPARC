<?php

namespace App\Http\Middleware;

use App\Http\Controllers\WorkspaceV3Controller;
use App\Models\InstagramComment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default across all SPARC v3 modules.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'auth' => fn (): array => $this->resolveAuthContext($request),
            'workspaceNotifications' => fn (): array => $this->resolveNotificationsContext($request),
            'workspaceBadges' => fn (): array => $this->resolveNavigationBadges($request),
            'instagramStatus' => fn (): array => $this->resolveInstagramStatus($request),
            'flash' => [
                'toast' => fn (): ?array => $this->resolveFlashToast($request),
            ],
        ];
    }

    /**
     * Share current role persona, RBAC capability flags, and quick-switch personas.
     *
     * @return array<string, mixed>
     */
    protected function resolveAuthContext(Request $request): array
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);

        return [
            'user' => $state['currentUser'],
            'can' => $state['can'],
            'personas' => $state['personas'],
        ];
    }

    /**
     * Share persistent database-style notifications and unread badge count.
     *
     * @return array{unreadCount: int, items: array<int, array<string, mixed>>, serverTime: string}
     */
    protected function resolveNotificationsContext(Request $request): array
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        /** @var array<int, array<string, mixed>> $notifications */
        $notifications = $state['notifications'];
        $unreadCount = count(array_filter(
            $notifications,
            fn (array $n): bool => empty($n['readAt'])
        ));

        return [
            'unreadCount' => $unreadCount,
            'items' => array_slice($notifications, 0, 30),
            'serverTime' => now()->toIso8601String(),
        ];
    }

    /**
     * Share connected Instagram account status for UI badges and pickers.
     *
     * @return array<string, mixed>
     */
    protected function resolveInstagramStatus(Request $request): array
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        $ig = $state['settings']['instagram'] ?? [];

        return [
            'connected' => ! empty($ig['connected']),
            'username' => (string) ($ig['username'] ?? ''),
            'name' => (string) ($ig['name'] ?? ''),
            'biography' => (string) ($ig['biography'] ?? ''),
            'website' => (string) ($ig['website'] ?? ''),
            'profilePictureUrl' => $ig['profilePictureUrl'] ?? null,
            'followersCount' => $ig['followersCount'] ?? null,
            'mediaCount' => $ig['mediaCount'] ?? null,
            'lastSyncedAt' => $ig['lastSyncedAt'] ?? null,
            'capabilities' => $ig['capabilities'] ?? [
                'basic' => false,
                'insights' => false,
                'publish' => false,
                'comments' => false,
            ],
            'bestPostingHours' => $ig['bestPostingHours'] ?? ['11:30 WIB', '16:30 WIB', '19:30 WIB'],
            'accountInsights' => $ig['accountInsights'] ?? [],
        ];
    }

    /**
     * Share real operational counts for sidebar badges.
     *
     * @return array{incoming: int, readyToPublish: int, reviewApproval: int, unrepliedComments: int}
     */
    protected function resolveNavigationBadges(Request $request): array
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        /** @var array<int, array<string, mixed>> $items */
        $items = $state['contentItems'];
        /** @var array<int, array<string, mixed>> $pubs */
        $pubs = $state['publications'];

        $readyQueue = count(array_filter($pubs, fn (array $p): bool => empty($p['publishedActualAt'])));
        $reviewQueue = count(array_filter($items, fn (array $i): bool => ($i['status'] ?? '') === 'review_approval'));
        $pendingIncoming = count(array_filter(
            WorkspaceV3Controller::defaultIncomingTickets($request),
            fn (array $t): bool => ($t['syncStatus'] ?? '') === 'pending'
        ));

        $unrepliedComments = 0;
        try {
            if (Schema::hasTable('instagram_comments')) {
                $unrepliedComments = InstagramComment::query()
                    ->whereNull('parent_ig_comment_id')
                    ->where('is_replied', false)
                    ->where('is_hidden', false)
                    ->count();
            }
        } catch (\Throwable) {
            $unrepliedComments = 0;
        }

        return [
            'incoming' => $pendingIncoming,
            'readyToPublish' => $readyQueue,
            'reviewApproval' => $reviewQueue,
            'unrepliedComments' => $unrepliedComments,
        ];
    }

    /**
     * Resolve structured or standard session flash notifications for the MD3 Toast system.
     *
     * @return array{id: string, type: string, title: string, message: string|null}|null
     */
    protected function resolveFlashToast(Request $request): ?array
    {
        if (! $request->hasSession()) {
            return null;
        }

        $session = $request->session();

        $structured = $session->get('toast');
        if (is_array($structured) && isset($structured['title'])) {
            return [
                'id' => (string) ($structured['id'] ?? Str::uuid()),
                'type' => (string) ($structured['type'] ?? 'info'),
                'title' => (string) $structured['title'],
                'message' => isset($structured['message']) ? (string) $structured['message'] : null,
            ];
        }

        /** @var array<string, string> $fallbackMap */
        $fallbackMap = [
            'success' => 'Berhasil',
            'error' => 'Terjadi Kesalahan',
            'warning' => 'Perhatian',
            'info' => 'Informasi',
        ];

        foreach ($fallbackMap as $type => $defaultTitle) {
            $value = $session->get($type);
            if (is_string($value) && $value !== '') {
                return [
                    'id' => (string) Str::uuid(),
                    'type' => $type,
                    'title' => $defaultTitle,
                    'message' => $value,
                ];
            }
        }

        return null;
    }
}
