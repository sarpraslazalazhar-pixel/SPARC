<?php

namespace Tests\Feature;

use App\Models\ContentItem;
use App\Models\InstagramConnection;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class WorkspaceFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        ContentItem::factory(3)->create();

        $user = User::factory()->create(['role' => 'admin', 'primary_role' => 'admin']);
        $this->actingAs($user);
        $this->withoutMiddleware(PreventRequestForgery::class);
    }

    /**
     * Ensure all SPARC v3 workspace pages render their expected Inertia components with 200 status.
     */
    public function test_all_workspace_pages_render_expected_inertia_components(): void
    {
        $routesToComponents = [
            '/' => 'Dashboard/Index',
            '/dashboard' => 'Dashboard/Index',
            '/incoming' => 'Incoming/Index',
            '/content' => 'Content/Index',
            '/planner' => 'Planner/Index',
            '/calendar' => 'Calendar/Index',
            '/publishing' => 'Publishing/Index',
            '/report' => 'Report/Index',
            '/analytics' => 'Analytics/Index',
            '/studio' => 'Studio/Index',
            '/studio/proj-1' => 'Studio/Show',
            '/grid' => 'Grid/Index',
            '/resources' => 'Resources/Index',
            '/assets' => 'Assets/Index',
            '/team' => 'Team/Index',
            '/settings' => 'Settings/Index',
            '/trash' => 'Trash/Index',
        ];

        foreach ($routesToComponents as $uri => $expectedComponent) {
            $this->get($uri)
                ->assertOk()
                ->assertInertia(fn (AssertableInertia $page): AssertableInertia => $page
                    ->component($expectedComponent)
                    ->has('auth.user')
                    ->has('auth.can')
                    ->has('workspaceNotifications')
                    ->has('flash')
                );
        }
    }

    /**
     * Ensure creating a planner item validates input and does not flash a success toast on failure.
     */
    public function test_store_planner_item_validates_payload_and_preserves_clean_flash_on_error(): void
    {
        $response = $this->from(route('planner.index'))->post(route('planner.items.store'), [
            'title' => 'ab',
            'platform' => 'invalid_platform',
        ]);

        $response
            ->assertRedirect(route('planner.index'))
            ->assertSessionHasErrors(['title', 'platform'])
            ->assertSessionMissing('toast');
    }

    /**
     * Ensure creating, updating, changing status, and deleting planner items persist in session and flash toasts once.
     */
    public function test_planner_crud_and_status_lifecycle_persists_session_state_and_single_flash_toast(): void
    {
        $createResponse = $this->post(route('planner.items.store'), [
            'title' => 'Kampanye Literasi Digital 2026',
            'platform' => 'instagram',
            'format' => 'reels_shorts',
            'pillar' => 'edukasi',
            'publish_date' => '2026-11-10',
            'caption' => 'Draft caption edukasi.',
            'status' => 'todo',
            'redirect_to' => 'planner',
        ]);

        $createResponse
            ->assertRedirect(route('planner.index'))
            ->assertSessionHas('toast.type', 'success')
            ->assertSessionHas('toast.title', 'Konten Berhasil Dibuat');

        $this->get(route('planner.index'))
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page): AssertableInertia => $page
                ->component('Planner/Index')
                ->where('flash.toast.type', 'success')
                ->where('sessionItems.0.title', 'Kampanye Literasi Digital 2026')
            );

        $this->get(route('planner.index'))
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page): AssertableInertia => $page
                ->where('flash.toast', null)
            );

        $this->from(route('planner.index'))
            ->put(route('planner.items.update', ['id' => 'p-1']), [
                'title' => 'Judul Konten Diperbarui',
                'platform' => 'instagram',
                'pillar' => 'promosi',
                'publish_date' => '2026-11-12',
                'caption' => 'Caption diperbarui',
                'published_url' => 'https://instagram.com/p/sparc123',
                'status' => 'in_progress',
            ])
            ->assertRedirect(route('planner.index'))
            ->assertSessionHas('toast.type', 'success')
            ->assertSessionHas('sparc.planner_updates.p-1.title', 'Judul Konten Diperbarui');

        $this->from(route('planner.index'))
            ->patch(route('planner.items.status', ['id' => 'p-1']), [
                'status' => 'published',
                'title' => 'Judul Konten Diperbarui',
            ])
            ->assertRedirect(route('planner.index'))
            ->assertSessionHas('toast.type', 'success')
            ->assertSessionHas('toast.title', 'Konten Berhasil Dipublikasikan')
            ->assertSessionHas('sparc.planner_updates.p-1.status', 'published');

        $this->from(route('planner.index'))
            ->delete(route('planner.items.destroy', ['id' => 'p-1']), [
                'title' => 'Judul Konten Diperbarui',
            ])
            ->assertRedirect(route('planner.index'))
            ->assertSessionHas('toast.type', 'warning')
            ->assertSessionHas('sparc.deleted_planner_ids', ['p-1']);

        $this->get(route('trash.index'))
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page): AssertableInertia => $page
                ->component('Trash/Index')
                ->where('sessionTrash.0.sourceId', 'p-1')
                ->where('sessionTrash.0.title', 'Judul Konten Diperbarui')
            );
    }

    /**
     * Ensure calendar scheduling, incoming ticket conversion, manual analytics metrics, and studio project creation work end-to-end.
     */
    public function test_calendar_incoming_analytics_and_studio_actions_validate_and_flash_toasts(): void
    {
        $this->from(route('calendar.index'))
            ->post(route('calendar.events.store'), [
                'title' => '',
                'platform' => 'instagram',
                'day' => 40,
                'time' => 'invalid',
            ])
            ->assertRedirect(route('calendar.index'))
            ->assertSessionHasErrors(['title', 'day', 'time']);

        $this->from(route('calendar.index'))
            ->post(route('calendar.events.store'), [
                'title' => 'Tayang Reels Hari Pahlawan',
                'platform' => 'instagram',
                'format' => 'reels',
                'day' => 10,
                'time' => '09:30',
                'caption' => 'Siap tayang pagi.',
            ])
            ->assertRedirect(route('calendar.index'))
            ->assertSessionHas('toast.type', 'success')
            ->assertSessionHas('sparc.calendar_events.0.title', 'Tayang Reels Hari Pahlawan');

        $this->post(route('incoming.convert', ['id' => '1']), [
            'title' => 'Liputan Wisuda Periode II',
            'ticket_code' => 'TKT-2026-089',
            'format' => 'reels_shorts',
            'pillar' => 'event_liputan',
            'pic_name' => 'Aldwin',
            'target_date' => '2026-11-15',
        ])
            ->assertRedirect(route('planner.index'))
            ->assertSessionHas('toast.type', 'success')
            ->assertSessionHas('sparc.ticket_overrides.1', 'converted');

        $this->from(route('analytics.index'))
            ->post(route('analytics.metrics.store'), [
                'title' => 'Reels Edukasi Beasiswa',
                'platform' => 'instagram',
                'published_url' => 'https://instagram.com/reel/abc123',
                'views' => 12500,
                'reach' => 10000,
                'likes' => 650,
                'comments' => 50,
                'shares' => 100,
                'saves' => 200,
            ])
            ->assertRedirect(route('analytics.index'))
            ->assertSessionHas('toast.type', 'success')
            ->assertSessionHas('sparc.analytics_posts.0.er', 10.0);

        $studioResponse = $this->post(route('studio.store'), [
            'title' => 'Naskah Podcast Alumni',
            'format' => 'reels_shorts',
            'pillar' => 'edukasi',
            'pic_name' => 'Aldwin',
            'target_date' => '2026-11-20',
        ]);

        $studioResponse
            ->assertSessionHas('toast.type', 'success')
            ->assertSessionHas('toast.title', 'Proyek Naskah Berhasil Dibuat');

        $createdProjectId = session('sparc.studio_projects.0.id');
        $this->assertNotEmpty($createdProjectId);
        $studioResponse->assertRedirect(route('studio.show', ['id' => $createdProjectId]));
    }

    /**
     * Ensure SPARC v3 RBAC enforces server-side permissions and returns graceful rollback validation errors for Inertia Kanban transitions.
     */
    public function test_sparc_v3_rbac_enforces_server_permissions_and_graceful_inertia_rollback(): void
    {
        // Switch role to Creator
        $this->post(route('workspace.role'), ['role' => 'creator'])
            ->assertRedirect();

        // Creator cannot access Admin-only Settings
        $this->get(route('settings.index'))->assertForbidden();

        // Creator cannot approve content to `ready_to_publish` via raw request -> 403
        $this->patch(route('content.status', ['id' => 'ci-2']), [
            'status' => 'ready_to_publish',
        ])->assertForbidden();

        // Creator dragging card on Inertia Kanban (`X-Inertia: true`) receives validation error for clean UI rollback
        $this->from(route('planner.index'))
            ->withHeader('X-Inertia', 'true')
            ->patch(route('content.status', ['id' => 'ci-2']), [
                'status' => 'ready_to_publish',
            ])
            ->assertRedirect(route('planner.index'))
            ->assertSessionHasErrors(['status']);

        // Switch role to Viewer -> cannot create content
        $this->post(route('workspace.role'), ['role' => 'viewer'])->assertRedirect();
        $this->post(route('content.store'), [
            'title' => 'Konten Ilegal dari Viewer',
            'platform' => 'instagram',
            'format' => 'reels_shorts',
            'pillar' => 'edukasi',
            'priority' => 'normal',
            'pic_name' => 'Nadia Putri',
            'production_deadline' => '2026-10-30',
            'publish_date' => '2026-11-01',
        ])->assertForbidden();
    }

    /**
     * Ensure SPARC v3 polling notifications, mark-read, checklist-gated publishing, and NULL-preserving report metrics work accurately.
     */
    public function test_sparc_v3_polling_notifications_publishing_checklist_and_nullable_metrics(): void
    {
        $baselineTime = now()->subSeconds(5)->toIso8601String();

        // Create a SPARC v3 content item as Admin -> generates persistent notification
        $this->from(route('content.index'))
            ->post(route('content.store'), [
                'title' => 'Infografis Capaian Layanan Q4',
                'platform' => 'instagram',
                'format' => 'carousel',
                'pillar' => 'kelembagaan',
                'priority' => 'tinggi',
                'pic_name' => 'Dimas Pratama',
                'production_deadline' => '2026-10-29',
                'publish_date' => '2026-10-31',
                'publish_time' => '10:00',
                'brief' => 'Ringkasan data layanan publik.',
            ])
            ->assertRedirect(route('content.index'))
            ->assertSessionHas('toast.type', 'success');

        $pollResponse = $this->getJson(route('poll.updates', ['since' => $baselineTime]));
        $pollResponse
            ->assertOk()
            ->assertJsonStructure([
                'server_time',
                'unread_notification_count',
                'overdue_content_count',
                'upcoming_publish_today',
                'notifications',
                'new_notifications',
            ]);

        $this->assertGreaterThanOrEqual(1, count($pollResponse->json('new_notifications')));

        // Mark all notifications read -> unread count drops to 0
        $this->postJson(route('notifications.readAll'))
            ->assertOk()
            ->assertJsonPath('unread_notification_count', 0);

        // Publishing slot `pub-1` cannot be marked live while checklist has unchecked items
        $this->from(route('publishing.index'))
            ->post(route('publications.publish', ['id' => 'pub-1']), [
                'published_url' => 'https://instagram.com/p/sparc-live-proof',
            ])
            ->assertRedirect(route('publishing.index'))
            ->assertSessionHasErrors(['published_url']);

        // Complete remaining checklist items on `pub-1`
        /** @var array<int, array<string, mixed>> $pubs */
        $pubs = session('sparc_v3.publications', []);
        $pub1 = collect($pubs)->firstWhere('id', 'pub-1');
        $this->assertIsArray($pub1);
        foreach ($pub1['checklist'] as $cItem) {
            if (empty($cItem['checked'])) {
                $this->patch(route('publications.checklist', ['id' => 'pub-1']), [
                    'key' => $cItem['key'],
                    'checked' => true,
                ])->assertRedirect();
            }
        }

        // Now marking `pub-1` as published succeeds
        $this->from(route('publishing.index'))
            ->post(route('publications.publish', ['id' => 'pub-1']), [
                'published_url' => 'https://instagram.com/p/sparc-live-proof',
            ])
            ->assertRedirect(route('publishing.index'))
            ->assertSessionHas('toast.type', 'success');

        // Record manual metrics with `clicks` omitted -> stored as NULL (not 0)
        $this->from(route('report.index'))
            ->post(route('report.metrics.store'), [
                'publication_id' => 'pub-1',
                'reach' => 14500,
                'views' => 21000,
                'likes' => 980,
                'comments' => 64,
                'shares' => 210,
                'saves' => 340,
                'clicks' => '',
            ])
            ->assertRedirect(route('report.index'))
            ->assertSessionHas('toast.type', 'success');

        $updatedPub1 = collect(session('sparc_v3.publications', []))->firstWhere('id', 'pub-1');
        $this->assertSame(14500, $updatedPub1['metrics']['reach']);
        $this->assertNull($updatedPub1['metrics']['clicks']);
    }

    /**
     * Ensure the Bento Dashboard exposes synchronized HALO APU incoming tickets, live subtask toggling, and dynamic performance trends.
     */
    public function test_bento_dashboard_exposes_synchronized_tickets_and_live_performance_trend(): void
    {
        $this->get(route('dashboard'))
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page): AssertableInertia => $page
                ->component('Dashboard/Index')
                ->has('incomingTickets', 6)
                ->has('performanceTrend', 6)
                ->where('workspaceBadges.incoming', 3)
            );

        // Toggle production task directly from Dashboard
        $this->from(route('dashboard'))
            ->patch(route('tasks.status', ['id' => 't-102']), [
                'content_item_id' => 'ci-1',
                'status' => 'done',
            ])
            ->assertRedirect(route('dashboard'))
            ->assertSessionHas('toast.type', 'info');

        // Convert pending HALO APU ticket '1' -> pending incoming badge decrements to 2
        $this->post(route('incoming.convert', ['id' => '1']), [
            'title' => 'Tutorial Pendaftaran Online Layanan Informasi Publik',
            'ticket_code' => '045-812-901',
            'format' => 'reels_shorts',
            'pillar' => 'edukasi',
            'pic_name' => 'Aldwin NV',
            'target_date' => '2026-11-02',
        ])->assertRedirect(route('planner.index'));

        $this->get(route('dashboard'))
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page): AssertableInertia => $page
                ->component('Dashboard/Index')
                ->where('workspaceBadges.incoming', 2)
                ->where('incomingTickets.0.syncStatus', 'converted')
            );
    }

    public function test_content_item_performance_fields_and_kanban_attributes(): void
    {
        $storeResponse = $this->post(route('content.store'), [
            'title' => 'Infografis Hak Cipta 2026',
            'platform' => 'instagram',
            'format' => 'carousel',
            'pillar' => 'edukasi',
            'pic_name' => 'Nadia Putri',
            'priority' => 'high',
            'production_deadline' => '2026-11-05',
            'publish_date' => '2026-11-08',
            'publish_time' => '10:00',
            'brief' => 'Brief edukasi hak cipta',
            'ref_design_url' => 'https://canva.com/design/test',
            'caption' => 'Pahami hak cipta karya kreatif Anda.',
        ]);

        $storeResponse->assertRedirect(route('content.index'));

        $item = ContentItem::where('title', 'Infografis Hak Cipta 2026')->first();
        $this->assertNotNull($item);
        $this->assertSame('https://canva.com/design/test', $item->ref_design_url);
        $this->assertSame('Pahami hak cipta karya kreatif Anda.', $item->caption);

        $updateResponse = $this->patch(route('content.update', ['id' => $item->id]), [
            'result_design_url' => 'https://drive.google.com/file/d/test',
            'published_url' => 'https://instagram.com/p/test12345',
            'revision_note' => 'Ganti font judul sesuai pedoman SPARC',
            'performance_notes' => 'Engagement tinggi di jam makan siang',
            'views' => 12500,
            'likes' => 840,
            'comments_count' => 95,
            'shares' => 42,
        ]);

        $updateResponse->assertRedirect(route('content.index'));

        $fresh = $item->fresh();
        $this->assertSame('https://drive.google.com/file/d/test', $fresh->result_design_url);
        $this->assertSame('https://instagram.com/p/test12345', $fresh->published_url);
        $this->assertSame('Ganti font judul sesuai pedoman SPARC', $fresh->revision_note);
        $this->assertSame('Engagement tinggi di jam makan siang', $fresh->performance_notes);
        $this->assertSame(12500, (int) $fresh->views);
        $this->assertSame(840, (int) $fresh->likes);
        $this->assertSame(95, (int) $fresh->comments_count);
        $this->assertSame(42, (int) $fresh->shares);
    }

    public function test_instagram_graph_api_settings_and_metrics_sync(): void
    {
        config([
            'services.instagram.account_id' => '17841400123456789',
            'services.instagram.access_token' => 'EAATestToken123',
            'services.instagram.graph_version' => 'v21.0',
        ]);

        $settingsResponse = $this->patch(route('settings.instagram.update'), [
            'account_id' => '17841400123456789',
            'access_token' => 'EAATestToken123',
        ]);
        $settingsResponse->assertRedirect();
        $this->assertSame('17841400123456789', session('sparc_v3.settings.instagram.account_id'));

        Http::fake([
            'https://graph.facebook.com/v21.0/17841400123456789?*' => Http::response([
                'id' => '17841400123456789',
                'username' => 'sparc_official',
                'followers_count' => 45200,
            ], 200),
        ]);

        $testResponse = $this->post(route('settings.instagram.test'), [
            'account_id' => '17841400123456789',
            'access_token' => 'EAATestToken123',
        ]);
        $testResponse->assertRedirect();
        $this->assertTrue(session('sparc_v3.settings.instagram.connected'));
        $this->assertSame('sparc_official', session('sparc_v3.settings.instagram.username'));

        $item = ContentItem::factory()->create([
            'platform' => 'instagram',
            'published_url' => 'https://www.instagram.com/p/DFxyz999/',
            'views' => 0,
            'likes' => 0,
        ]);

        Http::fake([
            'https://graph.facebook.com/v21.0/17841400123456789/media*' => Http::response([
                'data' => [
                    [
                        'id' => '180999888777666',
                        'shortcode' => 'DFxyz999',
                        'permalink' => 'https://www.instagram.com/p/DFxyz999/',
                        'like_count' => 380,
                        'comments_count' => 45,
                        'media_type' => 'VIDEO',
                    ],
                ],
            ], 200),
            'https://graph.facebook.com/v21.0/180999888777666/insights*' => Http::response([
                'data' => [
                    [
                        'name' => 'reach',
                        'values' => [['value' => 8900]],
                    ],
                    [
                        'name' => 'views',
                        'values' => [['value' => 12400]],
                    ],
                    [
                        'name' => 'saved',
                        'values' => [['value' => 92]],
                    ],
                ],
            ], 200),
        ]);

        $syncResponse = $this->post(route('content.syncInstagram', ['id' => $item->id]));
        $syncResponse->assertRedirect();

        $fresh = $item->fresh();
        $this->assertSame(12400, (int) $fresh->views);
        $this->assertSame(380, (int) $fresh->likes);
        $this->assertSame(45, (int) $fresh->comments_count);
        $this->assertSame(92, (int) $fresh->shares);
    }

    public function test_instagram_oauth_redirect_and_callback_flow(): void
    {
        config([
            'services.instagram.app_id' => '1234567890',
            'services.instagram.app_secret' => 'meta_app_secret_abc',
            'services.instagram.graph_version' => 'v21.0',
        ]);

        $redirectRes = $this->get(route('settings.instagram.oauth.redirect'));
        $redirectRes->assertRedirect();
        $this->assertStringContainsString('facebook.com', (string) $redirectRes->headers->get('Location'));
        $this->assertNotEmpty(session('sparc_v3.ig_oauth_state'));
        $oauthState = session('sparc_v3.ig_oauth_state');

        Http::fake([
            'https://graph.facebook.com/v21.0/oauth/access_token*' => Http::sequence()
                ->push(['access_token' => 'short_lived_user_token_123', 'expires_in' => 3600], 200)
                ->push(['access_token' => 'long_lived_user_token_60d', 'expires_in' => 5184000], 200),
            'https://graph.facebook.com/v21.0/me/accounts*' => Http::response([
                'data' => [
                    [
                        'id' => '100111222',
                        'name' => 'SPARC FB Page',
                        'access_token' => 'page_access_token_xyz',
                        'instagram_business_account' => [
                            'id' => '1784140099998888',
                            'username' => 'sparc_official_oauth',
                            'name' => 'SPARC Official Instagram',
                        ],
                    ],
                ],
            ], 200),
        ]);

        $callbackRes = $this->get(route('settings.instagram.oauth.callback', [
            'code' => 'meta_auth_code_xyz',
            'state' => $oauthState,
        ]));
        $callbackRes->assertRedirect(route('settings.index'));

        $conn = InstagramConnection::current();
        $this->assertTrue((bool) $conn->connected);
        $this->assertSame('1784140099998888', $conn->account_id);
        $this->assertSame('sparc_official_oauth', $conn->username);
        $this->assertSame('page_access_token_xyz', $conn->access_token);
        $this->assertSame('long_lived_user_token_60d', $conn->user_access_token);
    }

    public function test_instagram_candidate_selection_and_disconnect(): void
    {
        $conn = InstagramConnection::current();
        $candidates = [
            [
                'account_id' => '178414001',
                'username' => 'sparc_brand_a',
                'name' => 'SPARC Brand A',
                'page_id' => '1001',
                'page_name' => 'Page A',
                'page_access_token' => 'token_a',
            ],
            [
                'account_id' => '178414002',
                'username' => 'sparc_brand_b',
                'name' => 'SPARC Brand B',
                'page_id' => '1002',
                'page_name' => 'Page B',
                'page_access_token' => 'token_b',
            ],
        ];

        $conn->update([
            'candidate_accounts' => $candidates,
            'user_access_token' => 'user_token_long',
            'account_id' => '178414001',
            'username' => 'sparc_brand_a',
            'access_token' => 'token_a',
            'connected' => true,
        ]);

        $selectRes = $this->post(route('settings.instagram.selectAccount'), [
            'account_id' => '178414002',
        ]);
        $selectRes->assertRedirect();

        $fresh = $conn->fresh();
        $this->assertSame('178414002', $fresh->account_id);
        $this->assertSame('sparc_brand_b', $fresh->username);
        $this->assertSame('token_b', $fresh->access_token);
        $this->assertTrue((bool) $fresh->connected);

        $disconnectRes = $this->delete(route('settings.instagram.disconnect'));
        $disconnectRes->assertRedirect();

        $disconnected = $conn->fresh();
        $this->assertFalse((bool) $disconnected->connected);
        $this->assertNull($disconnected->account_id);
        $this->assertNull($disconnected->access_token);
    }

    public function test_instagram_bulk_sync_and_artisan_command(): void
    {
        config([
            'services.instagram.account_id' => '17841400123456789',
            'services.instagram.access_token' => 'EAATestToken123',
            'services.instagram.graph_version' => 'v21.0',
        ]);

        InstagramConnection::current()->update([
            'account_id' => '17841400123456789',
            'access_token' => 'EAATestToken123',
            'connected' => true,
        ]);
        $item1 = ContentItem::factory()->create([
            'platform' => 'instagram',
            'published_url' => 'https://www.instagram.com/p/DFbulk01/',
            'views' => 0,
            'likes' => 0,
        ]);

        $item2 = ContentItem::factory()->create([
            'platform' => 'instagram',
            'published_url' => 'https://www.instagram.com/reel/DFbulk02/',
            'views' => 0,
            'likes' => 0,
        ]);

        Http::fake([
            'https://graph.facebook.com/v21.0/17841400123456789/media*' => Http::response([
                'data' => [
                    [
                        'id' => '9001',
                        'shortcode' => 'DFbulk01',
                        'permalink' => 'https://www.instagram.com/p/DFbulk01/',
                        'like_count' => 500,
                        'comments_count' => 60,
                        'media_type' => 'IMAGE',
                    ],
                    [
                        'id' => '9002',
                        'shortcode' => 'DFbulk02',
                        'permalink' => 'https://www.instagram.com/reel/DFbulk02/',
                        'like_count' => 1200,
                        'comments_count' => 150,
                        'media_type' => 'VIDEO',
                    ],
                ],
            ], 200),
            'https://graph.facebook.com/v21.0/9001/insights*' => Http::response([
                'data' => [
                    ['name' => 'reach', 'values' => [['value' => 5500]]],
                    ['name' => 'views', 'values' => [['value' => 7200]]],
                    ['name' => 'saved', 'values' => [['value' => 45]]],
                ],
            ], 200),
            'https://graph.facebook.com/v21.0/9002/insights*' => Http::response([
                'data' => [
                    ['name' => 'reach', 'values' => [['value' => 15000]]],
                    ['name' => 'views', 'values' => [['value' => 22000]]],
                    ['name' => 'saved', 'values' => [['value' => 210]]],
                ],
            ], 200),
        ]);

        $bulkResponse = $this->post(route('content.syncAllInstagram'));
        $bulkResponse->assertRedirect();

        $fresh1 = $item1->fresh();
        $this->assertSame(7200, (int) $fresh1->views);
        $this->assertSame(500, (int) $fresh1->likes);
        $this->assertSame(60, (int) $fresh1->comments_count);
        $this->assertSame(45, (int) $fresh1->shares);

        $fresh2 = $item2->fresh();
        $this->assertSame(22000, (int) $fresh2->views);
        $this->assertSame(1200, (int) $fresh2->likes);
        $this->assertSame(150, (int) $fresh2->comments_count);
        $this->assertSame(210, (int) $fresh2->shares);

        $exitCode = Artisan::call('instagram:sync-metrics');
        $this->assertSame(0, $exitCode);
    }
}
