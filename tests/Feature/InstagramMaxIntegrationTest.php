<?php

namespace Tests\Feature;

use App\Models\ContentItem;
use App\Models\InstagramComment;
use App\Models\InstagramConnection;
use App\Models\InstagramGridSlot;
use App\Models\InstagramSchedule;
use App\Models\User;
use App\Services\InstagramGraphService;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpClientRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class InstagramMaxIntegrationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();

        $user = User::factory()->create([
            'role' => 'admin',
            'primary_role' => 'admin',
        ]);
        $this->actingAs($user);
        $this->withoutMiddleware(PreventRequestForgery::class);

        config([
            'services.instagram.app_id' => '9988776655',
            'services.instagram.app_secret' => 'secret_meta_key_xyz',
            'services.instagram.graph_version' => 'v21.0',
        ]);

        InstagramConnection::current()->update([
            'account_id' => '17841400111222',
            'access_token' => 'EAAPageToken999',
            'user_access_token' => 'EAAUserLongToken999',
            'username' => 'humas_sparc',
            'name' => 'HUMAS SPARC Resmi',
            'connected' => true,
            'token_expires_at' => now()->addDays(55),
        ]);
    }

    public function test_concurrent_batch_media_insights_separates_pure_metrics_and_unifies_report_and_dashboard(): void
    {
        Http::fake([
            'https://graph.facebook.com/v21.0/17841400111222?*' => Http::response([
                'id' => '17841400111222',
                'username' => 'humas_sparc',
            ], 200),
            'https://graph.facebook.com/v21.0/17841400111222/media*' => Http::response([
                'data' => [
                    [
                        'id' => '1801001',
                        'caption' => "Sosialisasi Layanan Digital Terpadu\n#HumasSPARC",
                        'media_type' => 'VIDEO',
                        'media_url' => 'https://cdn.example.com/video-1.mp4',
                        'thumbnail_url' => 'https://cdn.example.com/thumb-1.jpg',
                        'permalink' => 'https://www.instagram.com/reel/IGBatch001/',
                        'timestamp' => '2026-10-26T09:00:00+0000',
                        'like_count' => 540,
                        'comments_count' => 62,
                    ],
                    [
                        'id' => '1801002',
                        'caption' => 'Infografis Transparansi Kinerja Oktober',
                        'media_type' => 'CAROUSEL_ALBUM',
                        'media_url' => 'https://cdn.example.com/slide-1.jpg',
                        'permalink' => 'https://www.instagram.com/p/IGBatch002/',
                        'timestamp' => '2026-10-25T08:30:00+0000',
                        'like_count' => 310,
                        'comments_count' => 28,
                    ],
                ],
            ], 200),
            'https://graph.facebook.com/v21.0/1801001/insights*' => Http::response([
                'data' => [
                    ['name' => 'reach', 'values' => [['value' => 14500]]],
                    ['name' => 'views', 'values' => [['value' => 19800]]],
                    ['name' => 'saved', 'values' => [['value' => 310]]],
                    ['name' => 'shares', 'values' => [['value' => 88]]],
                ],
            ], 200),
            'https://graph.facebook.com/v21.0/1801002/insights*' => Http::response([
                'data' => [
                    ['name' => 'reach', 'values' => [['value' => 7200]]],
                    ['name' => 'views', 'values' => [['value' => 9400]]],
                    ['name' => 'saved', 'values' => [['value' => 125]]],
                    ['name' => 'shares', 'values' => [['value' => 42]]],
                ],
            ], 200),
        ]);

        $res = $this->post('/content/instagram/sync-all');
        $res->assertRedirect();

        $first = ContentItem::where('ig_media_id', '1801001')->firstOrFail();
        $second = ContentItem::where('ig_media_id', '1801002')->firstOrFail();

        // Pure separated metrics without synthetic `likes * 3`
        $this->assertSame(14500, $first->reach);
        $this->assertSame(19800, (int) $first->views);
        $this->assertSame(540, (int) $first->likes);
        $this->assertSame(310, $first->saves);
        $this->assertSame(88, (int) $first->shares);
        $this->assertSame('https://cdn.example.com/thumb-1.jpg', $first->ig_thumbnail_url);

        $this->assertSame(7200, $second->reach);
        $this->assertSame(125, $second->saves);
        $this->assertSame(42, (int) $second->shares);

        // Cross-module unification in /report and /dashboard
        $this->get('/report')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Report/Index')
                ->where('publications', function ($pubs) use ($first): bool {
                    $matched = collect($pubs)->firstWhere('id', 'pub-db-'.$first->id);

                    return is_array($matched)
                        && ($matched['metrics']['reach'] ?? null) === 14500
                        && ($matched['metrics']['saves'] ?? null) === 310
                        && ($matched['metrics']['shares'] ?? null) === 88;
                })
            );

        $this->get('/dashboard')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Dashboard/Index')
                ->where('contentItems', function ($items) use ($first): bool {
                    return collect($items)->contains(fn ($i): bool => ($i['contentId'] ?? '') === $first->content_id);
                })
            );
    }

    public function test_account_profile_28d_insights_and_pst_to_wib_best_posting_hours_sync(): void
    {
        Http::fake([
            'https://graph.facebook.com/v21.0/17841400111222/insights*online_followers*' => Http::response([
                'data' => [
                    [
                        'name' => 'online_followers',
                        'values' => [
                            [
                                // PST (UTC-8) + 15h = WIB (UTC+7):
                                // PST 4 -> 19:00 WIB (950), PST 1 -> 16:00 WIB (820), PST 20 -> 11:00 WIB (710)
                                'value' => [
                                    '4' => 950,
                                    '1' => 820,
                                    '20' => 710,
                                    '10' => 120,
                                ],
                            ],
                        ],
                    ],
                ],
            ], 200),
            'https://graph.facebook.com/v21.0/17841400111222/insights*' => Http::response([
                'data' => [
                    ['name' => 'reach', 'total_value' => ['value' => 84200]],
                    ['name' => 'views', 'total_value' => ['value' => 129500]],
                    ['name' => 'accounts_engaged', 'total_value' => ['value' => 9430]],
                    ['name' => 'total_interactions', 'total_value' => ['value' => 11200]],
                ],
            ], 200),
            'https://graph.facebook.com/v21.0/17841400111222?*' => Http::response([
                'id' => '17841400111222',
                'username' => 'humas_sparc',
                'name' => 'HUMAS Instansi SPARC',
                'biography' => 'Melayani Informasi Publik Cepat & Transparan',
                'website' => 'https://sparc.go.id',
                'profile_picture_url' => 'https://cdn.example.com/avatar.jpg',
                'followers_count' => 68400,
                'follows_count' => 145,
                'media_count' => 312,
            ], 200, [
                'X-App-Usage' => json_encode([
                    'call_count' => 18,
                    'total_cputime' => 7,
                    'total_time' => 11,
                ]),
            ]),
            'https://graph.facebook.com/v21.0/me/permissions*' => Http::response([
                'data' => [
                    ['permission' => 'instagram_basic', 'status' => 'granted'],
                    ['permission' => 'pages_show_list', 'status' => 'granted'],
                    ['permission' => 'pages_read_engagement', 'status' => 'granted'],
                    ['permission' => 'instagram_manage_insights', 'status' => 'granted'],
                    ['permission' => 'instagram_content_publish', 'status' => 'granted'],
                    ['permission' => 'instagram_manage_comments', 'status' => 'granted'],
                ],
            ], 200),
        ]);

        $this->post('/settings/instagram/sync-profile')->assertRedirect();

        $conn = InstagramConnection::current()->fresh();
        $this->assertSame(68400, $conn->followers_count);
        $this->assertSame(312, $conn->media_count);
        $this->assertSame(84200, $conn->account_insights['reach_28d'] ?? null);
        $this->assertSame(129500, $conn->account_insights['views_28d'] ?? null);
        $this->assertSame(
            ['19:00 WIB', '16:00 WIB', '11:00 WIB'],
            $conn->account_insights['best_posting_hours'] ?? []
        );
        $this->assertSame(18, $conn->rate_limit_usage['call_pct'] ?? null);
        $this->assertContains('instagram_content_publish', $conn->granted_scopes ?? []);
        $this->assertContains('instagram_manage_comments', $conn->granted_scopes ?? []);
    }

    public function test_direct_publishing_enforces_checklist_gate_and_publishes_image_carousel_resumable_reels_and_schedules(): void
    {
        Storage::fake('public');

        $readyItem = ContentItem::factory()->create([
            'title' => 'Panduan Layanan Terpadu 2026',
            'platform' => 'instagram',
            'format' => 'reels',
            'status' => 'ready_to_publish',
            'caption' => 'Panduan resmi layanan publik #SPARC',
            'published_url' => null,
        ]);

        $pubSlotId = 'pub-db-'.$readyItem->id;

        // 1. Pre-Publish Checklist gate blocks incomplete publication slot
        $blockedRes = $this->post('/publishing/instagram/publish', [
            'publication_id' => $pubSlotId,
            'content_item_id' => (string) $readyItem->id,
            'media_type' => 'IMAGE',
            'publish_mode' => 'immediate',
            'media_urls' => 'https://cdn.example.com/poster.jpg',
        ]);
        $blockedRes->assertSessionHasErrors('checklist');

        // Complete all 5 Instagram checklist items
        foreach (['caption', 'hashtag', 'cta', 'thumbnail', 'mention'] as $checkKey) {
            $this->patch("/publications/{$pubSlotId}/checklist", [
                'key' => $checkKey,
                'checked' => true,
            ])->assertRedirect();
        }

        // 2. Immediate Single IMAGE URL Publish
        Http::fake([
            'https://graph.facebook.com/v21.0/17841400111222?*' => Http::response(['id' => '17841400111222'], 200),
            'https://graph.facebook.com/v21.0/17841400111222/media' => Http::sequence()
                ->push(['id' => 'cnt_img_01'], 200)
                ->push(['id' => 'cnt_car_child_1'], 200)
                ->push(['id' => 'cnt_car_child_2'], 200)
                ->push(['id' => 'cnt_car_parent'], 200)
                ->push(['id' => 'cnt_reels_resumable'], 200)
                ->push(['id' => 'cnt_sched_due'], 200),
            'https://rupload.facebook.com/ig-api-upload/v21.0/cnt_reels_resumable' => Http::response([
                'success' => true,
            ], 200),
            'https://graph.facebook.com/v21.0/cnt_*' => Http::response([
                'status_code' => 'FINISHED',
            ], 200),
            'https://graph.facebook.com/v21.0/17841400111222/media_publish' => Http::sequence()
                ->push(['id' => 'ig_live_img_101'], 200)
                ->push(['id' => 'ig_live_car_102'], 200)
                ->push(['id' => 'ig_live_reel_103'], 200)
                ->push(['id' => 'ig_live_sched_104'], 200),
            'https://graph.facebook.com/v21.0/ig_live_*' => Http::sequence()
                ->push(['id' => 'ig_live_img_101', 'permalink' => 'https://www.instagram.com/p/LiveImg101/'], 200)
                ->push(['id' => 'ig_live_car_102', 'permalink' => 'https://www.instagram.com/p/LiveCar102/'], 200)
                ->push(['id' => 'ig_live_reel_103', 'permalink' => 'https://www.instagram.com/reel/LiveReel103/'], 200)
                ->push(['id' => 'ig_live_sched_104', 'permalink' => 'https://www.instagram.com/p/LiveSched104/'], 200),
        ]);

        $this->post('/publishing/instagram/publish', [
            'publication_id' => $pubSlotId,
            'content_item_id' => (string) $readyItem->id,
            'media_type' => 'IMAGE',
            'publish_mode' => 'immediate',
            'caption' => 'Poster resmi layanan publik',
            'media_urls' => 'https://cdn.example.com/poster.jpg',
        ])->assertSessionHasNoErrors()->assertRedirect();

        $this->assertSame('published', $readyItem->fresh()->status);
        $this->assertSame('https://www.instagram.com/p/LiveImg101/', $readyItem->fresh()->published_url);

        // 3. Immediate CAROUSEL Multi-Slide Publish
        $this->post('/publishing/instagram/publish', [
            'media_type' => 'CAROUSEL',
            'publish_mode' => 'immediate',
            'caption' => 'Carousel 2 slide kinerja',
            'media_urls' => "https://cdn.example.com/s1.jpg\nhttps://cdn.example.com/s2.jpg",
        ])->assertSessionHasNoErrors()->assertRedirect();

        $this->assertDatabaseHas('instagram_schedules', [
            'media_type' => 'CAROUSEL',
            'status' => 'published',
            'permalink' => 'https://www.instagram.com/p/LiveCar102/',
        ]);

        // 4. Immediate REELS Local File Resumable Binary Upload (works even on localhost)
        $fakeVideo = UploadedFile::fake()->create('liputan-humas.mp4', 256, 'video/mp4');
        $this->post('/publishing/instagram/publish', [
            'media_type' => 'REELS',
            'publish_mode' => 'immediate',
            'caption' => 'Reels liputan lapangan via Resumable Upload',
            'share_to_feed' => true,
            'media_files' => [$fakeVideo],
        ])->assertSessionHasNoErrors()->assertRedirect();

        $this->assertDatabaseHas('instagram_schedules', [
            'media_type' => 'REELS',
            'status' => 'published',
            'permalink' => 'https://www.instagram.com/reel/LiveReel103/',
        ]);

        Http::assertSent(function (HttpClientRequest $req): bool {
            return str_contains($req->url(), 'rupload.facebook.com/ig-api-upload/v21.0/cnt_reels_resumable')
                && $req->hasHeader('Authorization', 'OAuth EAAPageToken999');
        });

        // 5. Auto-Publish Terjadwal (`scheduled`) + Artisan `instagram:process-scheduled`
        $futureItem = ContentItem::factory()->create([
            'platform' => 'instagram',
            'status' => 'ready_to_publish',
            'published_url' => null,
        ]);

        $this->post('/publishing/instagram/publish', [
            'content_item_id' => (string) $futureItem->id,
            'media_type' => 'IMAGE',
            'publish_mode' => 'scheduled',
            'scheduled_at' => now()->subMinute()->toDateTimeString(),
            'caption' => 'Konten terjadwal otomatis',
            'media_urls' => 'https://cdn.example.com/scheduled.jpg',
        ])->assertSessionHasNoErrors()->assertRedirect();

        $queuedSchedule = InstagramSchedule::where('content_item_id', $futureItem->id)->firstOrFail();
        $this->assertSame('queued', $queuedSchedule->status);

        Artisan::call('instagram:process-scheduled');

        $this->assertSame('published', $queuedSchedule->fresh()->status);
        $this->assertSame('https://www.instagram.com/p/LiveSched104/', $futureItem->fresh()->published_url);
    }

    public function test_public_comments_sync_reply_hide_convert_to_content_idea_and_delete(): void
    {
        $publishedPost = ContentItem::factory()->create([
            'platform' => 'instagram',
            'status' => 'published',
            'ig_media_id' => '180555999',
            'published_url' => 'https://www.instagram.com/p/PostPublic01/',
        ]);

        Http::fake([
            'https://graph.facebook.com/v21.0/17841400111222?*' => Http::response(['id' => '17841400111222'], 200),
            'https://graph.facebook.com/v21.0/17841400111222/media*' => Http::response([
                'data' => [
                    [
                        'id' => '180555999',
                        'caption' => 'Informasi Jadwal Pelayanan Paspor Akhir Pekan',
                        'permalink' => 'https://www.instagram.com/p/PostPublic01/',
                        'comments' => [
                            'data' => [
                                [
                                    'id' => '179000111222',
                                    'username' => 'warga_budiman',
                                    'text' => 'Kak apakah hari Sabtu buka untuk lansia tanpa kuota online?',
                                    'timestamp' => '2026-10-27T04:15:00+0000',
                                    'like_count' => 9,
                                    'hidden' => false,
                                ],
                            ],
                        ],
                    ],
                ],
            ], 200),
            'https://graph.facebook.com/v21.0/179000111222/replies' => Http::response([
                'id' => '179000999888',
            ], 200),
            'https://graph.facebook.com/v21.0/179000111222*' => Http::response([
                'success' => true,
            ], 200),
        ]);

        // 1. Sync public comments
        $this->post('/instagram/comments/sync')->assertRedirect();

        $comment = InstagramComment::where('ig_comment_id', '179000111222')->firstOrFail();
        $this->assertSame($publishedPost->id, $comment->content_item_id);
        $this->assertFalse($comment->is_replied);

        // 2. Render centralized IG Comments inbox
        $this->get('/instagram/comments')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Comments/Index')
                ->where('summary.unreplied', 1)
                ->has('comments', 1)
            );

        // 3. Reply officially
        $this->post("/instagram/comments/{$comment->id}/reply", [
            'message' => 'Halo Kak @warga_budiman, layanan ramah lansia buka setiap Sabtu pukul 08.00–11.30 WIB langsung di loket prioritas.',
        ])->assertRedirect();

        $this->assertTrue($comment->fresh()->is_replied);
        $this->assertStringContainsString('loket prioritas', (string) $comment->fresh()->reply_text);

        // 4. Hide comment
        $this->patch("/instagram/comments/{$comment->id}/hide", ['hide' => true])->assertRedirect();
        $this->assertTrue($comment->fresh()->is_hidden);

        // 5. Convert audience question into SPARC ContentItem idea
        $this->post("/instagram/comments/{$comment->id}/convert", [
            'title' => 'Panduan Loket Prioritas Lansia Hari Sabtu',
            'format' => 'reels',
            'pillar' => 'edukasi',
            'pic_name' => 'Nadia Putri',
        ])->assertRedirect();

        $convertedId = $comment->fresh()->converted_content_item_id;
        $this->assertNotNull($convertedId);
        $this->assertDatabaseHas('content_items', [
            'id' => $convertedId,
            'title' => 'Panduan Loket Prioritas Lansia Hari Sabtu',
            'status' => 'inbox',
            'platform' => 'instagram',
        ]);

        // 6. Delete comment permanently
        $this->delete("/instagram/comments/{$comment->id}")->assertRedirect();
        $this->assertDatabaseMissing('instagram_comments', ['id' => $comment->id]);
    }

    public function test_hybrid_3x3_visual_grid_persists_custom_slots_and_drag_reorder(): void
    {
        $plannedItem = ContentItem::factory()->create([
            'title' => 'Konten Rencana IG #1',
            'platform' => 'instagram',
            'status' => 'in_progress',
        ]);

        $liveItem = ContentItem::factory()->create([
            'title' => 'Konten IG Sudah Tayang',
            'platform' => 'instagram',
            'status' => 'published',
            'ig_thumbnail_url' => 'https://cdn.example.com/live-grid.jpg',
        ]);

        // Create two custom visual slots
        $this->post('/grid/slots', [
            'title' => 'Teaser Kampanye A',
            'format' => 'single',
            'status' => 'in_design',
            'image_url' => 'https://cdn.example.com/teaser-a.jpg',
        ])->assertRedirect();

        $this->post('/grid/slots', [
            'title' => 'Teaser Kampanye B',
            'format' => 'carousel',
            'status' => 'draft',
            'image_url' => 'https://cdn.example.com/teaser-b.jpg',
        ])->assertRedirect();

        $slotA = InstagramGridSlot::where('title', 'Teaser Kampanye A')->firstOrFail();
        $slotB = InstagramGridSlot::where('title', 'Teaser Kampanye B')->firstOrFail();

        // Reorder: put planned ContentItem first, then Slot A, then Slot B
        $orderedKeys = [
            'ci-'.$plannedItem->id,
            'slot-'.$slotA->id,
            'slot-'.$slotB->id,
        ];

        $this->patch('/grid/reorder', ['ordered_keys' => $orderedKeys])->assertRedirect();

        $this->assertSame(0, $plannedItem->fresh()->grid_position);
        $this->assertSame(1, $slotA->fresh()->position);
        $this->assertSame(2, $slotB->fresh()->position);

        $this->get('/grid')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Grid/Index')
                ->where('plannedSlots.0.slotKey', 'ci-'.$plannedItem->id)
                ->where('plannedSlots.1.slotKey', 'slot-'.$slotA->id)
                ->where('plannedSlots.2.slotKey', 'slot-'.$slotB->id)
                ->where('livePosts', fn ($live): bool => collect($live)->contains('id', 'live-'.$liveItem->id))
            );

        // Delete custom slot B
        $this->delete("/grid/slots/{$slotB->id}")->assertRedirect();
        $this->assertDatabaseMissing('instagram_grid_slots', ['id' => $slotB->id]);
    }

    public function test_scheduled_token_auto_refresh_renews_expiring_long_lived_token(): void
    {
        InstagramConnection::current()->update([
            'token_expires_at' => now()->addDays(6),
            'user_access_token' => 'EAAExpiringSoonToken',
        ]);

        Http::fake([
            'https://graph.facebook.com/v21.0/oauth/access_token*' => Http::response([
                'access_token' => 'EAARefreshed60DayUserToken',
                'expires_in' => 5184000,
            ], 200),
            'https://graph.facebook.com/v21.0/me/accounts*' => Http::response([
                'data' => [
                    [
                        'id' => '100200300',
                        'name' => 'Humas Page',
                        'access_token' => 'EAARefreshedPageToken',
                        'instagram_business_account' => [
                            'id' => '17841400111222',
                            'username' => 'humas_sparc',
                        ],
                    ],
                ],
            ], 200),
        ]);

        Artisan::call('instagram:refresh-token');

        $fresh = InstagramConnection::current()->fresh();
        $this->assertSame('EAARefreshed60DayUserToken', $fresh->user_access_token);
        $this->assertSame('EAARefreshedPageToken', $fresh->access_token);
        $this->assertGreaterThan(50, now()->diffInDays($fresh->token_expires_at, false));
    }

    public function test_cache_thumbnail_url_saves_remote_media_to_local_disk(): void
    {
        Storage::fake('public');

        Http::fake([
            'https://scontent.cdninstagram.com/v/t51.2885-15/dummy.jpg*' => Http::response('fake_image_binary_bytes', 200),
        ]);

        $service = new InstagramGraphService;
        $localUrl = $service->cacheThumbnailUrl('https://scontent.cdninstagram.com/v/t51.2885-15/dummy.jpg?token=abc', 'test_thumb');

        $this->assertNotNull($localUrl);
        $this->assertStringContainsString('ig_cache/test_thumb_', $localUrl);

        // Cache hit test: subsequent call does not re-download
        $secondUrl = $service->cacheThumbnailUrl('https://scontent.cdninstagram.com/v/t51.2885-15/dummy.jpg?token=abc', 'test_thumb');
        $this->assertSame($localUrl, $secondUrl);
    }
}
