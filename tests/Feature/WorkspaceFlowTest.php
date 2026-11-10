<?php

namespace Tests\Feature;

use App\Models\ContentItem;
use App\Models\HaloApuTicket;
use App\Models\InstagramConnection;
use App\Models\User;
use App\Services\InstagramGraphService;
use App\Services\SparcExcelReportService;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
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
        Http::fake([
            '*/api/integrations/sparc/*' => Http::response(['status' => 'ok', 'data' => []], 200),
        ]);

        HaloApuTicket::create([
            'id' => 1,
            'haloapu_ticket_id' => '045-812-901',
            'raw_ticket_id' => 101,
            'source_type' => 'video_reels',
            'sub_unit_name' => 'Editing & Produksi Video',
            'title' => 'Tutorial Pendaftaran Online Layanan Informasi Publik',
            'brief' => 'Mohon dibuatkan video reels panduan singkat cara pendaftaran online dan verifikasi akun untuk masyarakat umum.',
            'requester_name' => 'Budi Santoso (Dit. Layanan)',
            'target_date' => '2026-11-02',
            'haloapu_status' => 'open',
            'sync_status' => 'pending',
            'haloapu_created_at' => '2026-10-27 09:15:00',
        ]);
        HaloApuTicket::create([
            'id' => 2,
            'haloapu_ticket_id' => '042-119-002',
            'raw_ticket_id' => 102,
            'source_type' => 'desain_feed',
            'sub_unit_name' => 'Pengajuan Desain Grafis',
            'title' => 'Feed IG - Infografis Capaian Kinerja Triwulan III',
            'brief' => 'Desain infografis carousel 5 slide mengenai capaian dan realisasi program prioritas tahun 2026.',
            'requester_name' => 'Siti Rahma (Biro Perencanaan)',
            'target_date' => '2026-10-31',
            'haloapu_status' => 'on_proses',
            'sync_status' => 'converted',
            'haloapu_created_at' => '2026-10-26 14:00:00',
        ]);
        HaloApuTicket::create([
            'id' => 3,
            'haloapu_ticket_id' => '041-908-112',
            'raw_ticket_id' => 103,
            'source_type' => 'desain_feed',
            'sub_unit_name' => 'Pengajuan Desain Grafis',
            'title' => 'Feed IG - Peringatan Hari Sumpah Pemuda 2026',
            'brief' => 'Desain single feed ucapan peringatan resmi Hari Sumpah Pemuda dengan nuansa dinamis dan berani.',
            'requester_name' => 'Ahmad Faiz (Bagian Protokol)',
            'target_date' => '2026-10-28',
            'haloapu_status' => 'open',
            'sync_status' => 'pending',
            'haloapu_created_at' => '2026-10-26 11:30:00',
        ]);
        HaloApuTicket::create([
            'id' => 4,
            'haloapu_ticket_id' => '039-551-789',
            'raw_ticket_id' => 104,
            'source_type' => 'video_reels',
            'sub_unit_name' => 'Editing & Produksi Video',
            'title' => 'Reels Liputan Serah Terima Jabatan Pejabat Baru',
            'brief' => 'Dokumentasi video singkat suasana serah terima jabatan pejabat fungsional di aula utama.',
            'requester_name' => 'Hendra Setiawan (Bagian Kepegawaian)',
            'target_date' => '2026-10-25',
            'haloapu_status' => 'solve',
            'sync_status' => 'converted',
            'haloapu_created_at' => '2026-10-24 16:45:00',
        ]);
        HaloApuTicket::create([
            'id' => 5,
            'haloapu_ticket_id' => '038-102-445',
            'raw_ticket_id' => 105,
            'source_type' => 'desain_feed',
            'sub_unit_name' => 'Pengajuan Desain Grafis',
            'title' => 'Feed IG - Poster Sayembara Desain Maskot',
            'brief' => 'Poster publikasi sayembara logo dan maskot terbuka untuk umum.',
            'requester_name' => 'Rina Kusuma (Bagian Tata Usaha)',
            'target_date' => '2026-10-20',
            'haloapu_status' => 'dibatalkan',
            'sync_status' => 'ignored',
            'haloapu_created_at' => '2026-10-20 10:00:00',
        ]);
        HaloApuTicket::create([
            'id' => 6,
            'haloapu_ticket_id' => '046-330-518',
            'raw_ticket_id' => 106,
            'source_type' => 'video_reels',
            'sub_unit_name' => 'Editing & Produksi Video',
            'title' => 'Reels Sosialisasi Kanal Pengaduan Terpadu 24 Jam',
            'brief' => 'Permintaan video edukasi 45 detik mengenai tata cara pelaporan cepat melalui aplikasi mobile dan WhatsApp resmi.',
            'requester_name' => 'Dewi Lestari (Biro Hukum & Humas)',
            'target_date' => '2026-11-04',
            'haloapu_status' => 'open',
            'sync_status' => 'pending',
            'haloapu_created_at' => '2026-10-27 13:40:00',
        ]);

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

        session()->put('sparc_v3.publications', [
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
        ]);

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

    public function test_instagram_discovery_falls_back_to_business_portfolio_and_connected_ig_account(): void
    {
        config([
            'services.instagram.graph_version' => 'v21.0',
        ]);

        Http::fake([
            'https://graph.facebook.com/v21.0/me/accounts*' => Http::response(['data' => []], 200),
            'https://graph.facebook.com/v21.0/me/businesses*' => Http::response([
                'data' => [
                    [
                        'id' => 'biz-100',
                        'name' => 'HUMAS Portfolio',
                        'owned_pages' => [
                            'data' => [
                                [
                                    'id' => 'pg-555',
                                    'name' => 'HUMAS Official Page',
                                    'access_token' => 'biz_page_token_777',
                                    'connected_instagram_account' => [
                                        'id' => '17841400555666',
                                        'username' => 'humas_portfolio_ig',
                                        'name' => 'HUMAS IG',
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ], 200),
        ]);

        $service = new InstagramGraphService;
        $res = $service->discoverInstagramAccounts('user_token_xyz');

        $this->assertTrue($res['success']);
        $this->assertCount(1, $res['accounts']);
        $this->assertSame('17841400555666', $res['accounts'][0]['account_id']);
        $this->assertSame('humas_portfolio_ig', $res['accounts'][0]['username']);
        $this->assertSame('biz_page_token_777', $res['accounts'][0]['page_access_token']);
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

    public function test_excel_report_export_template_and_import_roundtrip(): void
    {
        $targetItem = ContentItem::firstOrFail();
        $targetItem->update([
            'platform' => 'instagram',
            'status' => 'published',
        ]);
        $targetCode = (string) $targetItem->content_id;

        $exportResponse = $this->get(route('report.export.excel', ['platform' => 'all', 'layer' => 'creator']));
        $exportResponse->assertOk();
        $this->assertStringContainsString(
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            (string) $exportResponse->headers->get('Content-Type')
        );
        $this->assertStringStartsWith("PK\x03\x04", (string) $exportResponse->getContent());
        // Filtered export with format & date range
        $filteredExportResponse = $this->get(route('report.export.excel', [
            'platform' => 'all',
            'layer' => 'content',
            'format' => 'reels',
            'date_from' => '2026-10-01',
            'date_to' => '2026-10-31',
        ]));
        $filteredExportResponse->assertOk();
        $this->assertStringContainsString(
            'Laporan-Performa-SPARC-2026-10-01_sd_2026-10-31.xlsx',
            (string) $filteredExportResponse->headers->get('Content-Disposition')
        );

        // Validation failure on date_to < date_from
        $invalidExportResponse = $this->get(route('report.export.excel', [
            'date_from' => '2026-10-31',
            'date_to' => '2026-10-01',
        ]));
        $invalidExportResponse->assertSessionHasErrors('date_to');

        $templateResponse = $this->get(route('report.template.excel'));
        $templateResponse->assertOk();
        $this->assertStringStartsWith("PK\x03\x04", (string) $templateResponse->getContent());

        // Generate an .xlsx workbook with updated metrics for $targetCode and upload it
        $excelService = app(SparcExcelReportService::class);
        $xlsxBinary = $excelService->generateImportTemplateWorkbook([
            [
                'contentId' => $targetCode,
                'title' => 'Panduan Layanan Informasi Publik Terpadu',
                'platform' => 'instagram',
                'metrics' => [
                    'reach' => 54200,
                    'impressions' => 68100,
                    'views' => 79500,
                    'likes' => 4120,
                    'comments' => 315,
                    'shares' => 890,
                    'saves' => 1450,
                    'clicks' => null,
                ],
            ],
        ], '2026-10-27');

        $uploadedFile = UploadedFile::fake()->createWithContent('metrik-performa.xlsx', $xlsxBinary);

        $this->from(route('report.index'))
            ->post(route('report.metrics.excel'), [
                'excel_file' => $uploadedFile,
            ])
            ->assertRedirect(route('report.index'))
            ->assertSessionHas('toast.type', 'success');

        $updatedPub = collect(session('sparc_v3.publications', []))
            ->first(fn (array $p): bool => ($p['contentId'] ?? '') === $targetCode && ($p['platform'] ?? '') === 'instagram');

        $this->assertNotNull($updatedPub);
        $this->assertSame(54200, $updatedPub['metrics']['reach']);
        $this->assertSame(79500, $updatedPub['metrics']['views']);
        $this->assertSame(4120, $updatedPub['metrics']['likes']);
        $this->assertNull($updatedPub['metrics']['clicks']);
        $this->assertSame('excel', $updatedPub['metrics']['source']);
    }

    /**
     * Ensure storing an offline physical storage asset (flashdisk, harddisk, SSD) succeeds without URL validation failure.
     */
    public function test_store_visual_asset_with_offline_physical_storage(): void
    {
        $response = $this->from(route('assets.index'))->post(route('assets.store'), [
            'title' => 'Master Dokumentasi Video Liputan HD 2026',
            'category' => 'offline',
            'session' => 'Sesi 1 (Pagi)',
            'external_url' => 'Harddisk Eksternal WD 2TB Humas / Folder 2026',
            'tags' => 'liputan, offline, harddisk',
        ]);

        $response
            ->assertRedirect(route('assets.index'))
            ->assertSessionHasNoErrors()
            ->assertSessionHas('toast.type', 'success');

        /** @var array<int, array<string, mixed>> $assets */
        $assets = session('sparc_v3.assets', []);
        $stored = collect($assets)->firstWhere('title', 'Master Dokumentasi Video Liputan HD 2026');

        $this->assertNotNull($stored);
        $this->assertSame('offline', $stored['category']);
        $this->assertSame('Harddisk Eksternal WD 2TB Humas / Folder 2026', $stored['externalUrl']);
        $this->assertSame('Media Fisik (Flashdisk / HDD / SSD)', $stored['dimensions']);
        $this->assertSame('Sesi 1 (Pagi)', $stored['session']);
    }

    /**
     * Ensure storing an online cloud asset succeeds and normalizes URL if needed.
     */
    public function test_store_visual_asset_with_online_cloud_storage(): void
    {
        $response = $this->from(route('assets.index'))->post(route('assets.store'), [
            'title' => 'Koleksi Foto Dokumentasi Google Drive Humas',
            'category' => 'online',
            'external_url' => 'drive.google.com/drive/folders/sample-asset',
            'tags' => 'online, cloud, foto',
        ]);

        $response
            ->assertRedirect(route('assets.index'))
            ->assertSessionHasNoErrors()
            ->assertSessionHas('toast.type', 'success');

        /** @var array<int, array<string, mixed>> $assets */
        $assets = session('sparc_v3.assets', []);
        $stored = collect($assets)->firstWhere('title', 'Koleksi Foto Dokumentasi Google Drive Humas');

        $this->assertNotNull($stored);
        $this->assertSame('online', $stored['category']);
        $this->assertSame('https://drive.google.com/drive/folders/sample-asset', $stored['externalUrl']);
        $this->assertSame('Cloud Storage / Tautan Online', $stored['dimensions']);
    }

    /**
     * Ensure traditional categories (foto, video, etc.) still enforce valid URL.
     */
    public function test_store_visual_asset_validates_url_for_standard_categories(): void
    {
        $response = $this->from(route('assets.index'))->post(route('assets.store'), [
            'title' => 'Foto Kegiatan Tanpa URL Valid',
            'category' => 'foto',
            'external_url' => 'bukan-url-valid',
        ]);

        $response
            ->assertRedirect(route('assets.index'))
            ->assertSessionHasErrors(['external_url']);
    }
}
