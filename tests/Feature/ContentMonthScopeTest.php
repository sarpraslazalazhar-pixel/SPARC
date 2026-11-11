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
}
