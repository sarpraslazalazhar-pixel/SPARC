<?php

namespace Tests\Feature;

use App\Models\ContentItem;
use App\Models\HaloApuConnection;
use App\Models\HaloApuTicket;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class HaloApuIntegrationTest extends TestCase
{
    use RefreshDatabase;

    protected string $secret = 'haloapu-integration-secret-test';

    protected function setUp(): void
    {
        parent::setUp();

        $user = User::factory()->create([
            'role' => 'admin',
            'primary_role' => 'admin',
        ]);
        $this->actingAs($user);
        $this->withoutMiddleware(PreventRequestForgery::class);

        HaloApuConnection::current()->update([
            'is_enabled' => true,
            'base_url' => 'http://haloapu.test',
            'api_token' => 'sparc-bearer-test-token',
            'webhook_secret' => $this->secret,
            'auto_solve_on_publish' => true,
        ]);
    }

    protected function signedWebhookHeaders(string $event, array $payload): array
    {
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '{}';
        $sig = 'sha256='.hash_hmac('sha256', $json, $this->secret);

        return [
            'X-HaloAPU-Event' => $event,
            'X-HaloAPU-Timestamp' => (string) time(),
            'X-HaloAPU-Signature' => $sig,
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
        ];
    }

    public function test_webhook_rejects_invalid_signature(): void
    {
        $payload = ['event' => 'ping', 'ticket' => []];

        $response = $this->withHeaders([
            'X-HaloAPU-Event' => 'ping',
            'X-HaloAPU-Signature' => 'sha256=invalid-signature',
            'Content-Type' => 'application/json',
        ])->postJson('/api/webhooks/haloapu', $payload);

        $response->assertStatus(401);
    }

    public function test_webhook_ticket_created_upserts_haloapu_ticket(): void
    {
        $ticketData = [
            'haloapuTicketId' => '045-999-111',
            'rawTicketId' => 999111,
            'sourceType' => 'video_reels',
            'subUnitName' => 'Editing & Produksi Video',
            'title' => 'Reels Edukasi Zakat Fitrah',
            'brief' => 'Video reels panduan zakat fitrah untuk masyarakat umum.',
            'requesterName' => 'Ahmad Humas',
            'requesterUnit' => 'Direktorat Humas',
            'priority' => 'Tinggi',
            'targetDate' => '2026-11-20',
            'haloapuStatus' => 'open',
            'revisionCount' => 0,
            'isResultAccepted' => false,
            'isSlaBreached' => false,
            'createdAt' => '2026-11-05 10:00:00',
            'formSnapshot' => ['Jenis Video' => 'Reels'],
            'attachments' => [],
            'logs' => [],
        ];

        $payload = [
            'event' => 'ticket.created',
            'ticket' => $ticketData,
        ];

        $response = $this->withHeaders($this->signedWebhookHeaders('ticket.created', $payload))
            ->postJson('/api/webhooks/haloapu', $payload);

        $response->assertOk();

        $this->assertDatabaseHas('haloapu_tickets', [
            'haloapu_ticket_id' => '045-999-111',
            'title' => 'Reels Edukasi Zakat Fitrah',
            'priority' => 'Tinggi',
            'sync_status' => 'pending',
            'haloapu_status' => 'open',
        ]);
    }

    public function test_convert_ticket_creates_content_item_and_pushes_on_proses(): void
    {
        Http::fake([
            'http://haloapu.test/api/integrations/sparc/tickets/*/status' => Http::response([
                'message' => 'Status updated',
            ], 200),
        ]);

        $hat = HaloApuTicket::create([
            'haloapu_ticket_id' => '045-888-222',
            'raw_ticket_id' => 888222,
            'source_type' => 'video_reels',
            'sub_unit_name' => 'Editing & Produksi Video',
            'title' => 'Reels Panduan Layanan Online',
            'brief' => 'Brief naskah 3 langkah verifikasi.',
            'requester_name' => 'Budi Santoso',
            'target_date' => '2026-11-10',
            'haloapu_status' => 'open',
            'sync_status' => 'pending',
        ]);

        $response = $this->post(route('incoming.convert.db', ['id' => $hat->id]), [
            'title' => 'Reels Panduan Layanan Online Terpadu',
            'format' => 'reels_shorts',
            'pillar' => 'edukasi',
            'pic_name' => 'Aldwin (Writer)',
            'target_date' => '2026-11-12',
        ]);

        $response->assertRedirect(route('planner.index'));

        $this->assertDatabaseHas('content_items', [
            'ticket_id' => '045-888-222',
            'title' => 'Reels Panduan Layanan Online Terpadu',
            'status' => 'inbox',
        ]);

        $this->assertDatabaseHas('haloapu_tickets', [
            'id' => $hat->id,
            'sync_status' => 'converted',
            'haloapu_status' => 'on_proses',
        ]);

        Http::assertSent(fn ($req) => str_contains($req->url(), 'status') && $req['status'] === 'on_proses');
    }

    public function test_webhook_revision_requested_moves_content_item_to_in_progress(): void
    {
        $item = ContentItem::create([
            'title' => 'Feed Infografis Capaian 2026',
            'ticket_id' => '042-777-333',
            'platform' => 'instagram',
            'format' => 'carousel_feed',
            'pillar' => 'edukasi',
            'pic_name' => 'Designer 1',
            'production_deadline' => '2026-11-15',
            'publish_date' => '2026-11-20',
            'status' => 'ready_to_publish',
        ]);

        $hat = HaloApuTicket::create([
            'haloapu_ticket_id' => '042-777-333',
            'raw_ticket_id' => 777333,
            'source_type' => 'desain_feed',
            'sub_unit_name' => 'Pengajuan Desain Grafis',
            'title' => 'Feed Infografis Capaian 2026',
            'requester_name' => 'Siti Rahma',
            'haloapu_status' => 'solve',
            'sync_status' => 'converted',
            'content_item_id' => $item->id,
        ]);

        $payload = [
            'event' => 'ticket.revision_requested',
            'ticket' => [
                'haloapuTicketId' => '042-777-333',
                'rawTicketId' => 777333,
                'haloapuStatus' => 'need_revision',
                'revisionCount' => 1,
                'logs' => [
                    [
                        'aksi' => 'need_revision',
                        'catatan' => 'Mohon revisi warna font di slide 3 agar lebih kontras.',
                        'actor' => 'Siti Rahma',
                    ],
                ],
            ],
        ];

        $response = $this->withHeaders($this->signedWebhookHeaders('ticket.revision_requested', $payload))
            ->postJson('/api/webhooks/haloapu', $payload);

        $response->assertOk();

        $this->assertDatabaseHas('content_items', [
            'id' => $item->id,
            'status' => 'in_progress',
            'revision_note' => 'Mohon revisi warna font di slide 3 agar lebih kontras.',
        ]);

        $this->assertDatabaseHas('content_comments', [
            'content_item_id' => $item->id,
            'is_revision_note' => true,
            'comment' => 'Mohon revisi warna font di slide 3 agar lebih kontras.',
        ]);

        $this->assertDatabaseHas('haloapu_tickets', [
            'id' => $hat->id,
            'haloapu_status' => 'need_revision',
            'revision_count' => 1,
        ]);
    }

    public function test_deliver_result_pushes_solve_to_haloapu(): void
    {
        Http::fake([
            'http://haloapu.test/api/integrations/sparc/tickets/*/status' => Http::response([
                'message' => 'Status updated to solve',
            ], 200),
        ]);

        $hat = HaloApuTicket::create([
            'haloapu_ticket_id' => '045-666-444',
            'raw_ticket_id' => 666444,
            'source_type' => 'video_reels',
            'sub_unit_name' => 'Editing & Produksi Video',
            'title' => 'Reels Liputan Raker',
            'requester_name' => 'Dewi',
            'haloapu_status' => 'on_proses',
            'sync_status' => 'converted',
        ]);

        $response = $this->post(route('incoming.deliver', ['id' => $hat->id]), [
            'deliverable_url' => 'https://instagram.com/reel/C1234567890',
            'catatan' => 'Video reels telah tayang di akun Instagram resmi.',
        ]);

        $response->assertRedirect();

        $this->assertDatabaseHas('haloapu_tickets', [
            'id' => $hat->id,
            'haloapu_status' => 'solve',
            'deliverable_url' => 'https://instagram.com/reel/C1234567890',
        ]);

        Http::assertSent(fn ($req) => str_contains($req->url(), 'status') && $req['status'] === 'solve');
    }

    public function test_mark_published_auto_solves_haloapu_ticket(): void
    {
        Http::fake([
            'http://haloapu.test/api/integrations/sparc/tickets/*/status' => Http::response([
                'message' => 'Status updated to solve',
            ], 200),
        ]);

        $item = ContentItem::create([
            'title' => 'Video Reels Capaian Semester I',
            'ticket_id' => '045-555-555',
            'platform' => 'instagram',
            'format' => 'reels_shorts',
            'pillar' => 'edukasi',
            'pic_name' => 'Editor Video',
            'production_deadline' => '2026-11-01',
            'publish_date' => '2026-11-05',
            'status' => 'ready_to_publish',
        ]);

        $hat = HaloApuTicket::create([
            'haloapu_ticket_id' => '045-555-555',
            'raw_ticket_id' => 555555,
            'source_type' => 'video_reels',
            'sub_unit_name' => 'Editing & Produksi Video',
            'title' => 'Video Reels Capaian Semester I',
            'requester_name' => 'Hendra',
            'haloapu_status' => 'on_proses',
            'sync_status' => 'converted',
            'content_item_id' => $item->id,
        ]);

        // Publish via updateContentStatus
        $this->patch(route('content.status', ['id' => $item->id]), [
            'status' => 'published',
            'published_url' => 'https://instagram.com/reel/PUBLISHED-REELS-001',
        ])->assertRedirect();

        $this->assertDatabaseHas('haloapu_tickets', [
            'id' => $hat->id,
            'haloapu_status' => 'solve',
            'deliverable_url' => 'https://instagram.com/reel/PUBLISHED-REELS-001',
        ]);

        Http::assertSent(fn ($req) => str_contains($req->url(), 'status') && $req['status'] === 'solve');
    }

    public function test_content_plan_exposes_haloapu_requester_and_assigned_pic(): void
    {
        $ticketData = [
            'haloapuTicketId' => '417-901-526',
            'rawTicketId' => 417901526,
            'sourceType' => 'video_reels',
            'subUnitName' => 'Humas',
            'title' => 'Video Dokumentasi Kegiatan Sarpras',
            'brief' => 'Liputan serah terima fasilitas.',
            'requesterName' => 'sarpras',
            'requesterUnit' => 'Humas',
            'priority' => 'Normal',
            'targetDate' => '2026-11-25',
            'haloapuStatus' => 'open',
            'revisionCount' => 0,
            'isResultAccepted' => false,
            'isSlaBreached' => false,
        ];

        $payload = [
            'event' => 'ticket.created',
            'ticket' => $ticketData,
        ];

        $this->withHeaders($this->signedWebhookHeaders('ticket.created', $payload))
            ->postJson('/api/webhooks/haloapu', $payload)
            ->assertOk();
        $this->flushHeaders();
        $item = ContentItem::where('ticket_id', '417-901-526')->firstOrFail();
        $this->assertSame('Belum Ditugaskan', $item->pic_name);

        $this->get('/content')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Content/Index')
                ->where('contentItems.0.ticketId', '417-901-526')
                ->where('contentItems.0.requesterName', 'sarpras')
                ->where('contentItems.0.requesterUnit', 'Humas')
                ->where('contentItems.0.picName', 'Belum Ditugaskan')
            );

        // Assign PIC via updateContent and verify sync back to HaloApuTicket
        $this->patch(route('content.update', ['id' => $item->id]), [
            'pic_name' => 'Dimas Pratama',
        ])->assertRedirect(route('content.index'));

        $this->assertDatabaseHas('content_items', [
            'id' => $item->id,
            'pic_name' => 'Dimas Pratama',
        ]);
        $this->assertDatabaseHas('haloapu_tickets', [
            'haloapu_ticket_id' => '417-901-526',
            'assigned_operator_name' => 'Dimas Pratama',
        ]);
    }
}
