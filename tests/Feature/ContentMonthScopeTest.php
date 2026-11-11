<?php

namespace Tests\Feature;

use App\Models\ContentItem;
use App\Models\HaloApuConnection;
use App\Models\InstagramConnection;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class ContentMonthScopeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow('2026-11-11 09:00:00');

        $user = User::factory()->create([
            'role' => 'admin',
            'primary_role' => 'admin',
        ]);
        $this->actingAs($user);
        $this->withoutMiddleware(PreventRequestForgery::class);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_content_plan_scopes_to_selected_month_and_carries_over_unpublished_items(): void
    {
        ContentItem::factory()->create([
            'title' => 'Nov A',
            'platform' => 'instagram',
            'publish_date' => '2026-11-05',
            'status' => 'briefing',
        ]);
        ContentItem::factory()->create([
            'title' => 'Carry B',
            'platform' => 'instagram',
            'publish_date' => '2026-10-10',
            'status' => 'in_progress',
        ]);
        ContentItem::factory()->create([
            'title' => 'Oct Published C',
            'platform' => 'instagram',
            'publish_date' => '2026-10-12',
            'status' => 'published',
        ]);
        ContentItem::factory()->create([
            'title' => 'Dec D',
            'platform' => 'instagram',
            'publish_date' => '2026-12-03',
            'status' => 'inbox',
        ]);

        $this->get('/content')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page): AssertableInertia => $page
                ->component('Content/Index')
                ->where('month', '2026-11')
                ->where('currentMonth', '2026-11')
                ->has('contentItems', 2)
                ->where('contentItems.0.title', 'Carry B')
                ->where('contentItems.0.isCarryOver', true)
                ->where('contentItems.1.title', 'Nov A')
                ->missing('contentItems.1.isCarryOver')
            );

        $this->get('/content?month=2026-10')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page): AssertableInertia => $page
                ->component('Content/Index')
                ->where('month', '2026-10')
                ->has('contentItems', 2)
                ->where('contentItems.0.title', 'Carry B')
                ->missing('contentItems.0.isCarryOver')
                ->where('contentItems.1.title', 'Oct Published C')
                ->missing('contentItems.1.isCarryOver')
            );

        $this->get('/content?month=bogus')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page): AssertableInertia => $page
                ->component('Content/Index')
                ->where('month', '2026-11')
            );

        $this->get('/planner')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page): AssertableInertia => $page
                ->component('Planner/Index')
                ->has('contentItems', 2)
                ->where('month', '2026-11')
                ->where('currentMonth', '2026-11')
            );
    }

    public function test_instagram_library_lists_every_pulled_instagram_post_across_months(): void
    {
        ContentItem::factory()->create([
            'title' => 'IG Okt',
            'platform' => 'instagram',
            'ig_media_id' => '1801',
            'publish_date' => '2026-10-02',
            'status' => 'published',
        ]);
        ContentItem::factory()->create([
            'title' => 'IG Nov',
            'platform' => 'instagram',
            'ig_media_id' => '1802',
            'publish_date' => '2026-11-03',
            'status' => 'published',
            'reach' => 1200,
        ]);
        ContentItem::factory()->create([
            'title' => 'Rencana Tanpa IG',
            'platform' => 'instagram',
            'ig_media_id' => null,
            'publish_date' => '2026-11-04',
            'status' => 'briefing',
        ]);

        $this->get('/instagram/library')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page): AssertableInertia => $page
                ->component('InstagramLibrary/Index')
                ->has('contentItems', 2)
                ->where('contentItems.0.title', 'IG Nov')
                ->where('contentItems.0.reach', 1200)
                ->where('contentItems.1.title', 'IG Okt')
            );
    }

    public function test_poll_updates_and_grid_index_do_not_trigger_external_http_calls(): void
    {
        InstagramConnection::current()->update([
            'account_id' => '178414',
            'access_token' => 'token',
            'connected' => true,
        ]);
        HaloApuConnection::current()->update([
            'is_enabled' => true,
            'base_url' => 'https://halo.example.com',
        ]);

        Http::fake();

        $this->getJson('/poll/updates')->assertOk();
        $this->get('/grid')->assertOk();
        Http::assertNothingSent();
    }

    public function test_instagram_library_and_workspace_stay_within_low_memory_with_1500_posts_and_load_detail_on_demand(): void
    {
        $rows = [];
        $nowStr = now()->toDateTimeString();
        for ($i = 1; $i <= 1500; $i++) {
            $rows[] = [
                'content_id' => sprintf('SPARC-2026-%04d', $i),
                'title' => "Postingan IG Massal #{$i}",
                'status' => 'published',
                'priority' => 'normal',
                'platform' => 'instagram',
                'format' => $i % 3 === 0 ? 'reels' : 'feed',
                'pillar' => 'kelembagaan',
                'pic_name' => 'Instagram Auto-Sync',
                'pic_role' => 'publisher',
                'pic_avatar' => '',
                'production_deadline' => '2026-09-15',
                'publish_date' => '2026-09-15',
                'publish_time' => '10:00',
                'caption' => str_repeat("Caption panjang publikasi kegiatan #{$i}. ", 15),
                'published_url' => "https://www.instagram.com/p/MassPost{$i}/",
                'ig_media_id' => (string) (9000000 + $i),
                'reach' => 500 + $i,
                'views' => 700 + $i,
                'likes' => 50,
                'comments_count' => 5,
                'shares' => 2,
                'saves' => 3,
                'created_at' => $nowStr,
                'updated_at' => $nowStr,
            ];
        }
        foreach (array_chunk($rows, 300) as $chunk) {
            ContentItem::insert($chunk);
        }

        $beforeMem = memory_get_usage(false);
        $this->get('/instagram/library')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page): AssertableInertia => $page
                ->component('InstagramLibrary/Index')
                ->has('contentItems', 1500)
                ->where('contentItems.0.hasFullDetail', false)
            );
        $libDeltaMb = (memory_get_usage(false) - $beforeMem) / (1024 * 1024);
        $this->assertLessThan(64, $libDeltaMb, sprintf('Memory delta too high on /instagram/library: %.2f MB', $libDeltaMb));

        $this->get('/content')->assertOk();
        $this->get('/')->assertOk();
        $this->get('/report')->assertOk();
        $this->get('/grid')->assertOk();

        $target = ContentItem::where('ig_media_id', '9000001')->firstOrFail();
        $target->history()->create([
            'from_status' => 'inbox',
            'to_status' => 'published',
            'actor' => 'System',
            'note' => 'Detail riwayat lengkap',
        ]);

        $this->getJson(route('content.detail', ['id' => $target->id]))
            ->assertOk()
            ->assertJsonPath('id', (string) $target->id)
            ->assertJsonPath('hasFullDetail', true)
            ->assertJsonPath('history.0.note', 'Detail riwayat lengkap');
    }
}
