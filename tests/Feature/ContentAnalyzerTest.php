<?php

namespace Tests\Feature;

use App\Models\AiAnalysis;
use App\Models\ContentItem;
use App\Models\User;
use App\Services\ContentAnalyzerService;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Prism\Prism\Facades\Prism;
use Prism\Prism\Testing\StructuredResponseFake;
use Tests\TestCase;

/**
 * The analyzer caches reviews per item so repeated views cost no tokens, and the
 * endpoints must reject unconfigured AI and unsynced metrics instead of calling out.
 */
class ContentAnalyzerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('prism.providers.gemini.api_key', 'test-key');
        Cache::flush();

        $this->actingAs(User::factory()->create(['role' => 'admin', 'primary_role' => 'admin']));
        $this->withoutMiddleware(PreventRequestForgery::class);
    }

    /**
     * @return array<string, mixed>
     */
    private function reviewPayload(int $score = 82): array
    {
        return [
            'overall_score' => $score,
            'status_label' => 'Siap Tayang',
            'metrics_breakdown' => [
                'hook_strength' => 140,
                'message_clarity' => 85,
                'cta_effectiveness' => -10,
                'visual_readability' => 120,
            ],
            'executive_summary' => 'Konten sudah jelas dan layak tayang.',
            'strengths' => ['Hook langsung menyentuh masalah audiens.', '  '],
            'improvements' => ['Tambahkan ajakan berdiskusi.'],
            'actionable_next_steps' => ['Buat versi Reels 30 detik.'],
            'suggested_captions' => [
                ['style' => 'Persuasif', 'text' => 'Pernah bingung mulai dari mana?'],
                ['style' => 'Kosong', 'text' => '   '],
            ],
        ];
    }

    public function test_draft_review_clamps_scores_and_caches_per_caption(): void
    {
        $item = ContentItem::factory()->create(['caption' => 'Caption awal yang cukup panjang.']);
        $analyzer = $this->app->make(ContentAnalyzerService::class);

        Prism::fake([StructuredResponseFake::make()->withStructured($this->reviewPayload())]);

        $first = $analyzer->analyzeDraft([
            'title' => $item->title,
            'caption' => 'Caption awal yang cukup panjang.',
            'format' => $item->format,
            'pillar' => $item->pillar,
        ], $item);

        $this->assertSame(AiAnalysis::STATUS_COMPLETED, $first->status);
        $this->assertSame(82, $first->result['overall_score']);
        $this->assertSame(100, $first->result['metrics_breakdown']['hook_strength']);
        $this->assertSame(0, $first->result['metrics_breakdown']['cta_effectiveness']);
        $this->assertSame(100, $first->result['metrics_breakdown']['visual_readability']);
        $this->assertCount(1, $first->result['strengths']);
        $this->assertCount(1, $first->result['suggested_captions']);

        // Same caption, no force -> the cached row is returned and no second request is sent.
        Prism::fake([]);
        $second = $analyzer->analyzeDraft([
            'title' => $item->title,
            'caption' => 'Caption awal yang cukup panjang.',
        ], $item);

        $this->assertSame($first->id, $second->id);
        $this->assertSame(1, AiAnalysis::count());
    }

    public function test_changed_caption_triggers_a_new_review(): void
    {
        $item = ContentItem::factory()->create();
        $analyzer = $this->app->make(ContentAnalyzerService::class);

        Prism::fake([
            StructuredResponseFake::make()->withStructured($this->reviewPayload(60)),
            StructuredResponseFake::make()->withStructured($this->reviewPayload(88)),
        ]);

        $analyzer->analyzeDraft(['caption' => 'Caption versi pertama yang panjang.'], $item);
        $second = $analyzer->analyzeDraft(['caption' => 'Caption versi kedua yang juga panjang.'], $item);

        $this->assertSame(88, $second->result['overall_score']);
        $this->assertSame(2, AiAnalysis::count());
    }

    public function test_draft_review_attaches_only_direct_image_urls(): void
    {
        $item = ContentItem::factory()->create([
            'caption' => 'Caption dengan gambar desain terlampir.',
            'result_design_url' => 'https://cdn.example.com/design.jpg',
            'ref_design_url' => 'https://www.canva.com/design/abc/view',
        ]);

        Prism::fake([StructuredResponseFake::make()->withStructured($this->reviewPayload())]);

        $analysis = $this->app->make(ContentAnalyzerService::class)->analyzeDraft([
            'caption' => 'Caption dengan gambar desain terlampir.',
            'result_design_url' => 'https://cdn.example.com/design.jpg',
            'ref_design_url' => 'https://www.canva.com/design/abc/view',
        ], $item);

        $this->assertSame(AiAnalysis::STATUS_COMPLETED, $analysis->status);
        $this->assertSame(100, $analysis->result['metrics_breakdown']['visual_readability']);
    }

    public function test_performance_review_attaches_the_reels_cover(): void
    {
        $item = ContentItem::factory()->create([
            'status' => 'published',
            'reach' => 1000,
            'likes' => 40,
            'ig_thumbnail_url' => 'https://scontent.cdninstagram.com/cover.jpg',
        ]);

        Prism::fake([StructuredResponseFake::make()->withStructured($this->reviewPayload(71))]);

        $analysis = $this->app->make(ContentAnalyzerService::class)->analyzePerformance($item);

        $this->assertSame(71, $analysis->result['overall_score']);
        $this->assertSame('https://scontent.cdninstagram.com/cover.jpg', $analysis->input_snapshot['ig_thumbnail_url']);
    }

    public function test_analyze_draft_endpoint_returns_review(): void
    {
        Prism::fake([StructuredResponseFake::make()->withStructured($this->reviewPayload())]);

        $this->postJson(route('ai.analyzeDraft'), [
            'caption' => 'Caption draft untuk diuji melalui endpoint.',
        ])
            ->assertOk()
            ->assertJsonPath('result.overall_score', 82)
            ->assertJsonPath('type', AiAnalysis::PRE_PUBLISH);
    }

    public function test_analyze_draft_endpoint_rejects_short_caption(): void
    {
        $this->postJson(route('ai.analyzeDraft'), ['caption' => 'pendek'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('caption');
    }

    public function test_performance_endpoint_rejects_items_without_synced_metrics(): void
    {
        $item = ContentItem::factory()->create(['reach' => 0, 'likes' => 0]);

        $this->postJson(route('ai.analyzePost', ['id' => (string) $item->id]))
            ->assertStatus(422)
            ->assertJsonPath('message', 'Metrik Instagram belum tersinkron. Tarik metrik terlebih dahulu.');
    }

    public function test_performance_endpoint_analyzes_synced_item_and_mentions_ratios(): void
    {
        $item = ContentItem::factory()->create([
            'status' => 'published',
            'reach' => 1000,
            'likes' => 60,
            'saves' => 48,
            'shares' => 12,
            'comments_count' => 6,
        ]);

        Prism::fake([StructuredResponseFake::make()->withStructured($this->reviewPayload(74))]);

        $this->postJson(route('ai.analyzePost', ['id' => (string) $item->id]))
            ->assertOk()
            ->assertJsonPath('result.overall_score', 74);

        $snapshot = AiAnalysis::sole()->input_snapshot;
        $this->assertSame(1000, $snapshot['metrics']['reach']);
        $this->assertSame(48, $snapshot['metrics']['saves']);
    }

    public function test_digest_endpoint_requires_published_metrics(): void
    {
        $this->getJson(route('ai.digest', ['refresh' => 1]))
            ->assertStatus(422)
            ->assertJsonPath('message', 'Belum ada konten tayang dengan metrik untuk diringkas.');
    }

    public function test_digest_endpoint_summarizes_best_and_weakest_items(): void
    {
        ContentItem::factory()->create([
            'status' => 'published',
            'publish_date' => now()->toDateString(),
            'reach' => 1000,
            'likes' => 200,
            'saves' => 100,
        ]);
        ContentItem::factory()->create([
            'status' => 'published',
            'publish_date' => now()->toDateString(),
            'reach' => 1000,
            'likes' => 5,
        ]);

        Prism::fake([StructuredResponseFake::make()->withStructured([
            'headline' => 'Edukasi praktis menang',
            'summary' => 'Konten langkah-langkah mendapat simpanan tertinggi.',
            'winning_patterns' => ['Format langkah 1-2-3', '  '],
            'audience_preferences' => ['Contoh nyata layanan'],
            'pillar_recommendations' => ['Edukasi', 'Pengumuman'],
        ])]);

        $this->getJson(route('ai.digest', ['refresh' => 1]))
            ->assertOk()
            ->assertJsonPath('analysis.result.headline', 'Edukasi praktis menang')
            ->assertJsonCount(1, 'analysis.result.winning_patterns')
            ->assertJsonCount(2, 'analysis.result.pillar_recommendations');
    }

    public function test_endpoints_report_unconfigured_ai_instead_of_calling_out(): void
    {
        config()->set('prism.providers.gemini.api_key', '');

        $this->postJson(route('ai.analyzeDraft'), [
            'caption' => 'Caption draft yang cukup panjang untuk diuji.',
        ])->assertStatus(503);

        $item = ContentItem::factory()->create(['reach' => 500, 'likes' => 20]);
        $this->postJson(route('ai.analyzePost', ['id' => (string) $item->id]))->assertStatus(503);
    }
}
