<?php

namespace Tests\Feature;

use App\Models\ContentItem;
use App\Models\TrendInsight;
use App\Models\User;
use App\Services\TraceApuCorpusService;
use App\Services\TraceApuService;
use App\Services\TraceApuToolRegistry;
use App\Services\TrendFinderService;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Mockery;
use Prism\Prism\Enums\FinishReason;
use Prism\Prism\Facades\Prism;
use Prism\Prism\Testing\StructuredResponseFake;
use Prism\Prism\Testing\TextResponseFake;
use Prism\Prism\Testing\TextStepFake;
use Prism\Prism\Text\ResponseBuilder;
use Prism\Prism\ValueObjects\Meta;
use Prism\Prism\ValueObjects\ToolCall;
use Prism\Prism\ValueObjects\ToolResult;
use Prism\Prism\ValueObjects\Usage;
use Tests\TestCase;

class TraceApuTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('prism.providers.gemini.api_key', 'test-key');
        Cache::flush();

        $user = User::factory()->create([
            'role' => 'admin',
            'primary_role' => 'admin',
        ]);
        $this->actingAs($user);
        $this->withoutMiddleware(PreventRequestForgery::class);
    }

    /**
     * Embeddings are stubbed: deterministic vectors keep retrieval assertions stable.
     */
    private function fakeCorpus(): void
    {
        $corpus = Mockery::mock(TraceApuCorpusService::class);
        $corpus->shouldReceive('embed')->andReturn([1.0, 0.0])->byDefault();
        $corpus->shouldReceive('scopedItems')->andReturn(collect())->byDefault();
        $corpus->shouldReceive('contextBlock')->andReturn('Konteks workspace SPARC (uji).');
        $corpus->shouldReceive('activeTrends')->andReturn(collect())->byDefault();
        $corpus->shouldReceive('lastRefreshed')->andReturn(null);
        $corpus->shouldReceive('findItem')->andReturnUsing(
            static fn (string $reference): ?ContentItem => ContentItem::query()->where('content_id', $reference)->orWhere('id', (int) $reference)->first()
        );

        $this->app->instance(TraceApuCorpusService::class, $corpus);
    }

    private function structuredTrendPayload(): array
    {
        return [
            'trends' => [
                [
                    'title' => 'Format POV edukasi singkat',
                    'summary' => 'Video POV 15 detik sedang ramai.',
                    'category' => 'format',
                    'momentum' => 'rising',
                    'relevance_score' => 132,
                    'hook_ideas' => [
                        ['hook' => 'Kamu pernah lihat ini?', 'rationale' => 'Pertanyaan membuka rasa ingin tahu.'],
                        ['hook' => '', 'rationale' => 'Hook kosong dibuang.'],
                    ],
                    'content_ideas' => ['POV petugas melayani warga'],
                ],
                [
                    'title' => '   ',
                    'category' => 'tidak-dikenal',
                    'momentum' => 'melayang',
                    'relevance_score' => -5,
                ],
            ],
        ];
    }

    public function test_trend_search_normalizes_dedupes_and_embeds(): void
    {
        $this->fakeCorpus();

        Prism::fake([
            TextResponseFake::make()->withText('Tren: format POV edukasi singkat. Sumber: https://example.com/trend'),
            StructuredResponseFake::make()->withStructured($this->structuredTrendPayload()),
        ]);

        $saved = $this->app->make(TrendFinderService::class)->fetchAndStore();

        $this->assertSame(1, $saved);

        $trend = TrendInsight::sole();
        $this->assertSame('Format POV edukasi singkat', $trend->title);
        $this->assertSame(100, $trend->relevance_score);
        $this->assertSame('rising', $trend->momentum);
        $this->assertCount(1, $trend->hook_ideas);
        $this->assertSame([1, 0], array_map('intval', $trend->embedding));
        $this->assertArrayHasKey('completion', $trend->usage);

        // Re-running with the same grounded titles must update, not duplicate.
        Prism::fake([
            TextResponseFake::make()->withText('Tren: format POV edukasi singkat ulang.'),
            StructuredResponseFake::make()->withStructured($this->structuredTrendPayload()),
        ]);

        $this->app->make(TrendFinderService::class)->fetchAndStore();

        $this->assertSame(1, TrendInsight::count());
    }

    public function test_trend_prune_removes_stale_rows(): void
    {
        $this->fakeCorpus();
        TrendInsight::factory()->create(['refreshed_at' => now()->subDays(20)]);

        Prism::fake([
            TextResponseFake::make()->withText('Tren: format POV edukasi singkat.'),
            StructuredResponseFake::make()->withStructured($this->structuredTrendPayload()),
        ]);

        $this->app->make(TrendFinderService::class)->fetchAndStore();

        $this->assertSame(1, TrendInsight::count());
        $this->assertSame('Format POV edukasi singkat', TrendInsight::sole()->title);
    }

    public function test_hook_ideas_flatten_active_trends(): void
    {
        TrendInsight::factory()->create([
            'category' => TrendInsight::CATEGORY_FORMAT,
            'hook_ideas' => [['hook' => 'Tiga kesalahan umum', 'rationale' => 'Angka menarik.']],
        ]);
        TrendInsight::factory()->expired()->create([
            'hook_ideas' => [['hook' => 'Hook kedaluwarsa', 'rationale' => 'Jangan tampil.']],
        ]);

        $topics = $this->app->make(TrendFinderService::class)->hookIdeas();

        $this->assertCount(1, $topics);
        $this->assertSame('Tiga kesalahan umum', $topics[0]['text']);
        $this->assertSame('Tren · format', $topics[0]['category']);
    }

    public function test_panel_returns_history_and_instructions(): void
    {
        $this->fakeCorpus();

        $service = $this->app->make(TraceApuService::class);
        $scope = $service->scopeFor('global', auth()->user());
        $service->appendTurn($scope, 'Halo', 'Halo juga');
        $service->saveInstructions($scope, ['persona' => 'Ringkas saja', 'rules' => ['Selalu sebut sumber', ' ']]);

        $this->getJson('/trace-apu/panel?scope=global')
            ->assertOk()
            ->assertJsonPath('configured', true)
            ->assertJsonPath('instructions.persona', 'Ringkas saja')
            ->assertJsonPath('instructions.rules', ['Selalu sebut sumber'])
            ->assertJsonCount(2, 'history');
    }

    public function test_panel_returns_503_free_payload_when_not_configured(): void
    {
        $this->fakeCorpus();
        config()->set('prism.providers.gemini.api_key', null);

        $this->getJson('/trace-apu/panel')
            ->assertOk()
            ->assertJsonPath('configured', false);

        $this->postJson('/trace-apu/chat', ['message' => 'Halo'])
            ->assertStatus(503)
            ->assertJsonPath('message', 'Layanan AI belum dikonfigurasi. Isi GEMINI_API_KEY terlebih dahulu.');
    }

    public function test_chat_streams_tool_activity_and_persists_turn(): void
    {
        $this->fakeCorpus();

        $content = ContentItem::factory()->create([
            'title' => 'Edukasi layanan publik',
            'caption' => 'Urus berkas kini 5 menit. #LayananPublik',
        ]);

        Prism::fake([
            TextResponseFake::make()->withText('Gunakan format POV 15 detik untuk konten edukasi.'),
        ]);

        $response = $this->post('/trace-apu/chat', ['message' => 'Tren apa yang cocok?', 'scope' => 'global']);

        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/x-ndjson; charset=utf-8');

        $events = array_values(array_filter(explode("\n", trim($response->streamedContent()))));
        $this->assertNotEmpty($events);

        $last = json_decode((string) end($events), true);
        $this->assertSame('done', $last['type']);
        $this->assertStringContainsString('POV', (string) $last['answer']);

        $service = $this->app->make(TraceApuService::class);
        $history = $service->history($service->scopeFor('global', auth()->user()));

        $this->assertSame('user', $history[0]['role']);
        $this->assertSame('Tren apa yang cocok?', $history[0]['content']);
        $this->assertSame('assistant', $history[1]['role']);
        $this->assertSame([1, 0], array_map('intval', $content->embedForTraceApu()));
    }

    public function test_agent_tools_read_real_content_and_propose_caption(): void
    {
        $content = ContentItem::factory()->create([
            'title' => 'Tutorial pendaftaran online',
            'caption' => 'Urus berkas dengan cara lama.',
            'brief' => 'Panduan 3 langkah online.',
            'format' => 'reels_shorts',
            'pillar' => 'edukasi',
            'reach' => 1000,
            'likes' => 80,
            'comments_count' => 20,
            'metrics_synced_at' => now(),
        ]);
        $reference = (string) ($content->content_id ?: $content->getKey());

        $registry = $this->app->make(TraceApuToolRegistry::class);
        $tools = collect($registry->tools())->keyBy(fn ($tool): string => $tool->name());

        $search = $tools['search_content']->handle(query: 'pendaftaran online', limit: 3);
        $this->assertStringContainsString($reference, (string) $search);

        $brief = $tools['get_content']->handle(content_ref: $reference);
        $this->assertStringContainsString('Caption:', (string) $brief);
        $this->assertStringContainsString('Urus berkas dengan cara lama.', (string) $brief);
        $this->assertStringContainsString('Panduan 3 langkah online.', (string) $brief);

        $performance = json_decode((string) $tools['content_performance']->handle(), true);
        $this->assertSame(1, $performance['portfolio']['total']);
        $this->assertSame(100, $performance['top_performing'][0]['interactions']);
        $this->assertEqualsWithDelta(10.0, (float) $performance['portfolio']['avg_engagement_rate'], 0.01);

        $proposal = json_decode((string) $tools['suggest_caption']->handle(
            content_ref: $reference,
            caption: 'Urus berkas 3 langkah dari HP.',
            rationale: 'Lebih konkret.'
        ), true);
        $this->assertSame($reference, $proposal['content_ref']);
        $this->assertSame('Urus berkas 3 langkah dari HP.', $proposal['caption']);
    }

    public function test_chat_exposes_caption_suggestion_and_keeps_content_focus(): void
    {
        $this->fakeCorpus();

        $content = ContentItem::factory()->create([
            'title' => 'Pengumuman layanan',
            'caption' => 'Caption lama yang datar.',
        ]);
        $reference = (string) ($content->content_id ?: $content->getKey());

        $toolCall = new ToolCall(id: 'call_1', name: 'suggest_caption', arguments: [
            'content_ref' => $reference,
            'caption' => 'Caption baru yang lebih tegas.',
            'rationale' => 'Pembuka lebih kuat.',
        ]);

        Prism::fake([
            (new ResponseBuilder)
                ->addStep(TextStepFake::make()
                    ->withToolCalls([$toolCall])
                    ->withToolResults([new ToolResult(
                        toolCallId: 'call_1',
                        toolName: 'suggest_caption',
                        args: ['content_ref' => $reference, 'caption' => 'Caption baru yang lebih tegas.', 'rationale' => 'Pembuka lebih kuat.'],
                        result: json_encode(['content_ref' => $reference, 'caption' => 'Caption baru yang lebih tegas.', 'rationale' => 'Pembuka lebih kuat.']),
                    )])
                    ->withFinishReason(FinishReason::ToolCalls)
                    ->withUsage(new Usage(10, 10))
                    ->withMeta(new Meta('fake-1', 'fake-model')))
                ->addStep(TextStepFake::make()
                    ->withText('Usulan caption sudah disiapkan.')
                    ->withFinishReason(FinishReason::Stop)
                    ->withUsage(new Usage(10, 10))
                    ->withMeta(new Meta('fake-2', 'fake-model')))
                ->toResponse(),
        ]);

        $response = $this->post('/trace-apu/chat', ['message' => 'Perbaiki caption Pengumuman layanan']);

        $events = array_values(array_filter(explode("\n", trim($response->streamedContent()))));
        $last = json_decode((string) end($events), true);

        $this->assertSame('done', $last['type']);
        $this->assertSame('Caption baru yang lebih tegas.', $last['suggestions'][0]['caption']);

        $service = $this->app->make(TraceApuService::class);
        $history = $service->history($service->scopeFor('global', auth()->user()));
        $this->assertSame($reference, $history[1]['content_ref']);
        $this->assertSame('suggest_caption', $history[1]['tools'][0]['name']);
    }

    public function test_caption_apply_persists_proposal_and_respects_edit_permission(): void
    {
        $this->fakeCorpus();
        $item = ContentItem::factory()->create(['caption' => 'Caption lama']);

        $this->postJson('/trace-apu/caption', [
            'content_ref' => (string) ($item->content_id ?: $item->getKey()),
            'caption' => 'Caption hasil TRACE APU',
        ])
            ->assertOk()
            ->assertJsonPath('content_ref', (string) ($item->content_id ?: $item->getKey()));

        $this->assertSame('Caption hasil TRACE APU', $item->fresh()->caption);

        $this->actingAs(User::factory()->create(['role' => 'viewer', 'primary_role' => 'viewer']));
        session()->put('sparc_v3.active_role', 'viewer');

        $this->postJson('/trace-apu/caption', [
            'content_ref' => (string) ($item->content_id ?: $item->getKey()),
            'caption' => 'Caption editor',
        ])->assertForbidden();

        $this->assertSame('Caption hasil TRACE APU', $item->fresh()->caption);
    }

    public function test_content_performance_filters_by_live_pillar_taxonomy(): void
    {
        ContentItem::factory()->create(['pillar' => 'edukasi', 'reach' => 5000, 'likes' => 200, 'metrics_synced_at' => now()]);

        $tool = collect($this->app->make(TraceApuToolRegistry::class)->tools())
            ->first(fn ($tool): bool => $tool->name() === 'content_performance');

        $this->assertStringContainsString('edukasi', json_encode($tool->parametersAsArray()));
    }

    public function test_draft_returns_structured_script(): void
    {
        $this->fakeCorpus();

        Prism::fake([
            StructuredResponseFake::make()->withStructured([
                'hook' => 'Lima menit cukup?',
                'body' => 'Ikuti tiga langkah ini.',
                'cta' => 'Simpan video ini.',
                'hashtags' => ['layananpublik'],
                'relevance_score' => 84,
            ]),
        ]);

        $this->postJson('/trace-apu/draft', [
            'project' => [
                'id' => 'proj-x',
                'title' => 'Tutorial pendaftaran online',
                'format' => 'reels_shorts',
                'pillar' => 'edukasi',
                'caption' => 'Cukup 3 langkah.',
                'hashtags' => '#LayananPublik',
            ],
            'include_trends' => true,
        ])
            ->assertOk()
            ->assertJsonPath('draft.hook', 'Lima menit cukup?')
            ->assertJsonPath('draft.relevance_score', 84);
    }

    public function test_trends_page_lists_active_insights_with_sources(): void
    {
        TrendInsight::factory()->create([
            'title' => 'Audio viral Reels',
            'sources' => [['title' => 'Contoh', 'url' => 'https://example.com/a']],
        ]);
        TrendInsight::factory()->expired()->create(['title' => 'Kedaluwarsa']);

        $this->get('/trends')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Trends/Index')
                ->has('trends', 1)
                ->where('trends.0.title', 'Audio viral Reels')
                ->has('trends.0.sources', 1)
                ->where('configured', true));
    }
}
