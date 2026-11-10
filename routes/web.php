<?php

use App\Http\Controllers\Auth\AuthenticatedSessionController;
use App\Http\Controllers\HaloApuOperationsController;
use App\Http\Controllers\InstagramOperationsController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\WorkspaceActionController;
use App\Http\Controllers\WorkspaceV3Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// =========================================================================
// 0. AUTHENTICATION — Login & Session Management
// =========================================================================
Route::middleware('guest')->group(function () {
    Route::get('/login', [AuthenticatedSessionController::class, 'create'])->name('login');
    Route::post('/login', [AuthenticatedSessionController::class, 'store'])->name('login.store');
});

Route::post('/logout', [AuthenticatedSessionController::class, 'destroy'])->name('logout');

Route::middleware('auth')->group(function () {
    // =====================================================================
    // 1. OVERVIEW — Dashboard HUMAS & Incoming HALO APU
    // =====================================================================
    Route::get('/', [WorkspaceV3Controller::class, 'dashboard'])->name('dashboard');
    Route::get('/dashboard', [WorkspaceV3Controller::class, 'dashboard'])->name('dashboard.alias');

    Route::get('/incoming', function (Request $request) {
        WorkspaceV3Controller::hydrateWorkspace($request);

        return Inertia::render('Incoming/Index', [
            'tickets' => WorkspaceV3Controller::defaultIncomingTickets($request),
            'ticketOverrides' => $request->session()->get('sparc.ticket_overrides', []),
        ]);
    })->name('incoming.index');

    Route::post('/incoming/{id}/convert', [WorkspaceActionController::class, 'convertIncomingTicket'])
        ->name('incoming.convert');
    Route::post('/incoming/{id}/convert-db', [HaloApuOperationsController::class, 'convertTicket'])->name('incoming.convert.db');
    Route::post('/incoming/{id}/ignore', [HaloApuOperationsController::class, 'ignoreTicket'])->name('incoming.ignore');
    Route::post('/incoming/{id}/reply', [HaloApuOperationsController::class, 'replyTicket'])->name('incoming.reply');
    Route::patch('/incoming/{id}/remote-status', [HaloApuOperationsController::class, 'updateRemoteStatus'])->name('incoming.remoteStatus');
    Route::post('/incoming/{id}/deliver', [HaloApuOperationsController::class, 'deliverResult'])->name('incoming.deliver');
    Route::get('/incoming/{id}/attachments/{attachmentId}/proxy', [HaloApuOperationsController::class, 'proxyAttachment'])->name('incoming.attachment.proxy');
    Route::post('/incoming/{id}/attachments/{attachmentId}/save-asset', [HaloApuOperationsController::class, 'saveAttachmentToAssets'])->name('incoming.attachment.saveAsset');

    // =====================================================================
    // 2. CONTENT WORKFLOW — Content Plan, Production Board (Kanban) & Calendar
    // =====================================================================
    Route::get('/content', [WorkspaceV3Controller::class, 'contentPlan'])->name('content.index');
    Route::post('/content', [WorkspaceV3Controller::class, 'storeContent'])->name('content.store');
    Route::post('/content/bulk', [WorkspaceV3Controller::class, 'bulkUpdateContent'])->name('content.bulk');
    Route::patch('/content/{id}', [WorkspaceV3Controller::class, 'updateContent'])->name('content.update');
    Route::patch('/content/{id}/status', [WorkspaceV3Controller::class, 'updateContentStatus'])->name('content.status');
    Route::post('/content/{id}/duplicate', [WorkspaceV3Controller::class, 'duplicateContent'])->name('content.duplicate');
    Route::delete('/content/{id}', [WorkspaceV3Controller::class, 'destroyContent'])->name('content.destroy');
    Route::post('/content/{id}/comments', [WorkspaceV3Controller::class, 'storeComment'])->name('content.comments.store');
    Route::post('/content/{id}/sync-instagram', [WorkspaceV3Controller::class, 'syncInstagramContentMetric'])->name('content.syncInstagram');
    Route::get('/content/instagram/recent-media', [WorkspaceV3Controller::class, 'getRecentInstagramMedia'])->name('content.recentInstagramMedia');
    Route::post('/content/instagram/sync-all', [WorkspaceV3Controller::class, 'syncAllInstagramMetrics'])->name('content.syncAllInstagram');

    Route::post('/tasks', [WorkspaceV3Controller::class, 'storeTask'])->name('tasks.store');
    Route::patch('/tasks/{id}/status', [WorkspaceV3Controller::class, 'toggleTaskStatus'])->name('tasks.status');

    Route::get('/planner', [WorkspaceV3Controller::class, 'productionBoard'])->name('planner.index');
    Route::post('/planner/items', [WorkspaceActionController::class, 'storePlannerItem'])->name('planner.items.store');
    Route::put('/planner/items/{id}', [WorkspaceActionController::class, 'updatePlannerItem'])->name('planner.items.update');
    Route::patch('/planner/items/{id}/status', [WorkspaceActionController::class, 'updatePlannerStatus'])->name('planner.items.status');
    Route::delete('/planner/items/{id}', [WorkspaceActionController::class, 'destroyPlannerItem'])->name('planner.items.destroy');

    Route::get('/calendar', [WorkspaceV3Controller::class, 'calendar'])->name('calendar.index');
    Route::post('/calendar/events', [WorkspaceActionController::class, 'storeCalendarEvent'])->name('calendar.events.store');
    Route::post('/calendar/activities', [WorkspaceV3Controller::class, 'storeActivity'])->name('calendar.activities.store');
    Route::patch('/calendar/reschedule', [WorkspaceV3Controller::class, 'rescheduleCalendarItem'])->name('calendar.reschedule');
    Route::delete('/calendar/items', [WorkspaceV3Controller::class, 'destroyCalendarItem'])->name('calendar.items.destroy');
    Route::post('/calendar/items/delete', [WorkspaceV3Controller::class, 'destroyCalendarItem'])->name('calendar.items.destroy.post');

    // =====================================================================
    // 3. DISTRIBUTION & INSIGHTS — Publishing & Performance Report
    // =====================================================================
    Route::get('/publishing', [WorkspaceV3Controller::class, 'publishing'])->name('publishing.index');
    Route::post('/publications', [WorkspaceV3Controller::class, 'storePublication'])->name('publications.store');
    Route::patch('/publications/{id}/checklist', [WorkspaceV3Controller::class, 'togglePublishChecklist'])->name('publications.checklist');
    Route::post('/publications/{id}/publish', [WorkspaceV3Controller::class, 'markPublished'])->name('publications.publish');
    Route::post('/publishing/instagram/publish', [InstagramOperationsController::class, 'publishOrSchedule'])->name('publishing.instagram.publish');
    Route::delete('/publishing/instagram/schedules/{schedule}', [InstagramOperationsController::class, 'cancelSchedule'])->name('publishing.instagram.cancelSchedule');

    Route::get('/instagram/comments', [InstagramOperationsController::class, 'commentsIndex'])->name('instagram.comments.index');
    Route::post('/instagram/comments/sync', [InstagramOperationsController::class, 'syncComments'])->name('instagram.comments.sync');
    Route::post('/instagram/comments/{comment}/reply', [InstagramOperationsController::class, 'replyComment'])->name('instagram.comments.reply');
    Route::patch('/instagram/comments/{comment}/hide', [InstagramOperationsController::class, 'toggleHideComment'])->name('instagram.comments.hide');
    Route::delete('/instagram/comments/{comment}', [InstagramOperationsController::class, 'destroyComment'])->name('instagram.comments.destroy');
    Route::post('/instagram/comments/{comment}/convert', [InstagramOperationsController::class, 'convertToContent'])->name('instagram.comments.convert');

    Route::get('/report', [WorkspaceV3Controller::class, 'report'])->name('report.index');
    Route::get('/report/export-excel', [WorkspaceV3Controller::class, 'exportReportExcel'])->name('report.export.excel');
    Route::get('/report/template-excel', [WorkspaceV3Controller::class, 'downloadReportTemplateExcel'])->name('report.template.excel');
    Route::post('/report/metrics', [WorkspaceV3Controller::class, 'storeReportMetric'])->name('report.metrics.store');
    Route::post('/report/metrics/import-excel', [WorkspaceV3Controller::class, 'importReportCsv'])->name('report.metrics.excel');
    Route::post('/report/metrics/import-csv', [WorkspaceV3Controller::class, 'importReportCsv'])->name('report.metrics.csv');

    Route::get('/analytics', function (Request $request) {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);

        return Inertia::render('Analytics/Index', [
            'today' => WorkspaceV3Controller::TODAY,
            'contentItems' => $state['contentItems'],
            'publications' => $state['publications'],
            'team' => $state['team'],
            'sessionMetrics' => $request->session()->get('sparc.analytics_posts', []),
            'instagramSettings' => $state['settings']['instagram'] ?? [],
        ]);
    })->name('analytics.index');
    Route::post('/analytics/metrics', [WorkspaceActionController::class, 'storeAnalyticsMetric'])->name('analytics.metrics.store');

    // =====================================================================
    // 4. CREATIVE RESOURCES — Studio, Grid, Resource Library & Visual Assets
    // =====================================================================
    Route::get('/studio', function (Request $request) {
        WorkspaceV3Controller::hydrateWorkspace($request);

        return Inertia::render('Studio/Index', [
            'sessionProjects' => $request->session()->get('sparc.studio_projects', []),
        ]);
    })->name('studio.index');

    Route::post('/studio/projects', [WorkspaceActionController::class, 'storeStudioProject'])->name('studio.store');

    Route::get('/studio/{id}', function (Request $request, string $id) {
        WorkspaceV3Controller::hydrateWorkspace($request);
        /** @var array<int, array<string, mixed>> $sessionProjects */
        $sessionProjects = $request->session()->get('sparc.studio_projects', []);
        $matched = collect($sessionProjects)->firstWhere('id', $id);

        return Inertia::render('Studio/Show', [
            'projectId' => $id,
            'sessionProject' => $matched,
        ]);
    })->name('studio.show');

    Route::get('/grid', [InstagramOperationsController::class, 'gridIndex'])->name('grid.index');
    Route::post('/grid/slots', [InstagramOperationsController::class, 'saveGridSlot'])->name('grid.slots.store');
    Route::patch('/grid/reorder', [InstagramOperationsController::class, 'reorderGrid'])->name('grid.reorder');
    Route::delete('/grid/slots/{slot}', [InstagramOperationsController::class, 'destroyGridSlot'])->name('grid.slots.destroy');
    Route::post('/grid/sync-live-feed', [InstagramOperationsController::class, 'syncLiveGridFeed'])->name('grid.syncLiveFeed');

    Route::get('/assets', [WorkspaceV3Controller::class, 'assets'])->name('assets.index');
    Route::post('/assets', [WorkspaceV3Controller::class, 'storeAsset'])->name('assets.store');
    Route::delete('/assets/{id}', [WorkspaceV3Controller::class, 'destroyAsset'])->name('assets.destroy');

    // =====================================================================
    // 5. COLLABORATION — Team & Integration
    // =====================================================================
    Route::get('/team', [WorkspaceV3Controller::class, 'team'])->name('team.index');
    Route::post('/team/invite', [WorkspaceV3Controller::class, 'inviteTeamMember'])->name('team.invite');
    Route::patch('/team/{id}/role', [WorkspaceV3Controller::class, 'updateTeamMemberRole'])->name('team.role');
    Route::delete('/team/{id}', [WorkspaceV3Controller::class, 'destroyTeamMember'])->name('team.destroy');

    // =====================================================================
    // 6. ADMINISTRATION, ROLE SWITCHING & REAL POLLING NOTIFICATIONS
    // =====================================================================
    Route::get('/settings', [WorkspaceV3Controller::class, 'settings'])->name('settings.index');
    Route::patch('/settings', [WorkspaceV3Controller::class, 'updateSettings'])->name('settings.update');
    Route::post('/settings/haloapu/sync', [WorkspaceV3Controller::class, 'syncHaloApu'])->name('settings.haloapu.sync');
    Route::post('/settings/haloapu/test', [WorkspaceV3Controller::class, 'testHaloApuConnection'])->name('settings.haloapu.test');
    Route::patch('/settings/haloapu', [WorkspaceV3Controller::class, 'updateHaloApuSettings'])->name('settings.haloapu.update');
    Route::patch('/settings/instagram', [WorkspaceV3Controller::class, 'updateInstagramSettings'])->name('settings.instagram.update');
    Route::post('/settings/instagram/test', [WorkspaceV3Controller::class, 'testInstagramConnection'])->name('settings.instagram.test');
    Route::get('/settings/instagram/oauth/redirect', [WorkspaceV3Controller::class, 'redirectToInstagramOAuth'])->name('settings.instagram.oauth.redirect');
    Route::get('/settings/instagram/oauth/callback', [WorkspaceV3Controller::class, 'handleInstagramOAuthCallback'])->name('settings.instagram.oauth.callback');
    Route::post('/settings/instagram/select-account', [WorkspaceV3Controller::class, 'selectInstagramAccount'])->name('settings.instagram.selectAccount');
    Route::post('/settings/instagram/refresh-token', [InstagramOperationsController::class, 'refreshToken'])->name('settings.instagram.refreshToken');
    Route::post('/settings/instagram/sync-profile', [InstagramOperationsController::class, 'syncProfileAndInsights'])->name('settings.instagram.syncProfile');
    Route::post('/settings/instagram/sync-ads', [InstagramOperationsController::class, 'syncAds'])->name('settings.instagram.syncAds');
    Route::post('/settings/instagram/sync-demographics', [InstagramOperationsController::class, 'syncDemographics'])->name('settings.instagram.syncDemographics');
    Route::post('/settings/instagram/sync-stories', [InstagramOperationsController::class, 'syncStories'])->name('settings.instagram.syncStories');
    Route::post('/settings/instagram/sync-mentions', [InstagramOperationsController::class, 'syncMentions'])->name('settings.instagram.syncMentions');
    Route::delete('/settings/instagram/disconnect', [WorkspaceV3Controller::class, 'disconnectInstagram'])->name('settings.instagram.disconnect');

    Route::get('/trash', function (Request $request) {
        WorkspaceV3Controller::hydrateWorkspace($request);

        return Inertia::render('Trash/Index', [
            'sessionTrash' => $request->session()->get('sparc.trash_items', []),
        ]);
    })->name('trash.index');

    Route::post('/workspace/role', [WorkspaceV3Controller::class, 'switchRole'])->name('workspace.role');
    Route::get('/poll/updates', [WorkspaceV3Controller::class, 'pollUpdates'])->name('poll.updates');
    Route::post('/notifications/{id}/read', [WorkspaceV3Controller::class, 'markNotificationRead'])->name('notifications.read');
    Route::post('/notifications/read-all', [WorkspaceV3Controller::class, 'markAllNotificationsRead'])->name('notifications.readAll');

    // =====================================================================
    // 7. USER PROFILE & ACCOUNT MANAGEMENT
    // =====================================================================
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::post('/profile/avatar', [ProfileController::class, 'updateAvatar'])->name('profile.avatar');
    Route::put('/profile/password', [ProfileController::class, 'updatePassword'])->name('profile.password');
});
