<?php

namespace App\Services;

use App\Models\AiSetting;
use App\Models\TrendInsight;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Prism\Prism\Facades\Prism;
use Prism\Prism\Schema\ArraySchema;
use Prism\Prism\Schema\EnumSchema;
use Prism\Prism\Schema\NumberSchema;
use Prism\Prism\Schema\ObjectSchema;
use Prism\Prism\Schema\StringSchema;
use Prism\Prism\ValueObjects\ProviderTool;
use Prism\Prism\ValueObjects\Usage;

/**
 * Two-stage trend search: grounded text (Google Search) → structured normalization.
 *
 * Stage 1 exists because Gemini refuses `responseSchema` together with
 * `google_search`; the grounded answer is then converted.
 */
class TrendFinderService
{
    public const MAX_TRENDS = 15;

    public const TTL_DAYS = 7;

    public const RETENTION_DAYS = 14;

    public const CATEGORIES = [
        TrendInsight::CATEGORY_FORMAT,
        TrendInsight::CATEGORY_TOPIC,
        TrendInsight::CATEGORY_HASHTAG,
        TrendInsight::CATEGORY_AUDIO,
        TrendInsight::CATEGORY_NEWS,
    ];

    public const MOMENTUMS = [
        TrendInsight::MOMENTUM_RISING,
        TrendInsight::MOMENTUM_STEADY,
        TrendInsight::MOMENTUM_DECLINING,
    ];

    /**
     * Check whether the Gemini provider is configured for Prism.
     */
    public function isConfigured(): bool
    {
        return (bool) config('prism.providers.'.AiSetting::provider().'.api_key');
    }

    /**
     * Fetch grounded trends, embed them, and upsert by title hash.
     *
     * @return int Number of trends saved (created or refreshed).
     */
    public function fetchAndStore(): int
    {
        $grounded = Prism::text()
            ->using(AiSetting::provider(), $this->model())
            ->withProviderTools([new ProviderTool(type: 'google_search')])
            ->withSystemPrompt($this->groundingPrompt())
            ->withPrompt('Cari tren konten media sosial Indonesia terbaru untuk tim Humas kepolisian hari ini.')
            ->withMaxTokens(4096)
            ->withClientOptions(['timeout' => $this->timeout()])
            ->asText();

        $sources = $this->extractSources((array) $grounded->additionalContent);
        $answer = trim($grounded->text);

        if ($answer === '') {
            return 0;
        }

        $structured = Prism::structured()
            ->using(AiSetting::provider(), $this->model())
            ->withSchema($this->schema())
            ->withPrompt($this->normalizationPrompt($answer))
            ->withMaxTokens(4096)
            ->withClientOptions(['timeout' => $this->timeout()])
            ->asStructured();

        $trends = $this->normalize((array) ($structured->structured ?? []), $sources);

        $this->pruneExpired();

        $corpus = app(TraceApuCorpusService::class);
        $saved = 0;

        foreach ($trends as $trend) {
            $embedding = $corpus->embed($trend['title'].'. '.$trend['summary']);
            $embedding = $embedding !== null ? array_map(static fn (float $value): float => round($value, 6), $embedding) : null;

            TrendInsight::updateOrCreate(
                ['title_hash' => md5(mb_strtolower(trim($trend['title'])))],
                [
                    ...$trend,
                    'embedding' => $embedding,
                    'raw' => $answer,
                    'usage' => $this->usage($grounded->usage, $structured->usage),
                    'refreshed_at' => now(),
                    'expires_at' => now()->addDays(self::TTL_DAYS),
                ]
            );

            $saved++;
        }

        return $saved;
    }

    /**
     * Get the active trends ordered by relevance for the UI.
     *
     * @return Collection<int, TrendInsight>
     */
    public function latest(int $limit = self::MAX_TRENDS): Collection
    {
        return TrendInsight::query()
            ->active()
            ->orderByDesc('relevance_score')
            ->orderByDesc('refreshed_at')
            ->limit($limit)
            ->get();
    }

    /**
     * Flattened hook ideas from active trends for the Studio Hook Bank.
     *
     * @param  string|null  $category  Optional trend category filter (format/topic/hashtag/audio/news).
     * @return list<array{id: string, category: string, text: string, rationale: string, trend: string}>
     */
    public function hookIdeas(?string $category = null, int $limit = 10): array
    {
        return $this->latest(self::MAX_TRENDS)
            ->when($category, static fn (Collection $rows, string $value) => $rows->where('category', $value))
            ->flatMap(static fn (TrendInsight $trend) => collect((array) $trend->hook_ideas)->map(static fn ($idea): array => [
                'id' => 't'.$trend->id.'-'.substr(md5((string) ($idea['hook'] ?? '')), 0, 8),
                'category' => 'Tren · '.$trend->category,
                'text' => (string) ($idea['hook'] ?? ''),
                'rationale' => (string) ($idea['rationale'] ?? ''),
                'trend' => (string) $trend->title,
            ]))
            ->filter(static fn (array $hook): bool => $hook['text'] !== '')
            ->take($limit)
            ->values()
            ->all();
    }

    /**
     * Get the most recent refresh time across stored trends.
     */
    public function lastRefreshed(): ?Carbon
    {
        $value = TrendInsight::query()->max('refreshed_at');

        return $value !== null ? Carbon::parse($value) : null;
    }

    /**
     * JSON schema contract for the normalization stage.
     */
    protected function schema(): ObjectSchema
    {
        $hookIdea = new ObjectSchema(
            name: 'hook_idea',
            description: 'Satu hook siap pakai beserta alasan mengapa hook tersebut efektif.',
            properties: [
                new StringSchema('hook', 'Teks hook siap pakai, maksimal 15 kata.'),
                new StringSchema('rationale', 'Alasan singkat mengapa hook tersebut efektif.'),
            ],
            requiredFields: ['hook', 'rationale'],
        );

        $trend = new ObjectSchema(
            name: 'trend',
            description: 'Satu tren konten media sosial yang sedang ramai di Indonesia.',
            properties: [
                new StringSchema('title', 'Judul tren yang ringkas dan spesifik, maksimal 10 kata.'),
                new StringSchema('summary', 'Ringkasan tren dan cara memanfaatkannya dalam 2-3 kalimat.'),
                new EnumSchema('category', 'Kategori tren.', self::CATEGORIES),
                new EnumSchema('momentum', 'Arah momentum tren.', self::MOMENTUMS),
                new NumberSchema('relevance_score', 'Skor relevansi bagi tim Humas kepolisian, 0-100.', minimum: 0, maximum: 100),
                new ArraySchema('hook_ideas', 'Dua alternatif hook untuk memanfaatkan tren ini.', $hookIdea),
                new ArraySchema('content_ideas', 'Dua ide konten konkret untuk tren ini.', new StringSchema('item', 'Satu ide konten.')),
            ],
            requiredFields: ['title', 'summary', 'category', 'momentum', 'relevance_score', 'hook_ideas', 'content_ideas'],
        );

        return new ObjectSchema(
            name: 'trend_search',
            description: 'Hasil pencarian tren konten media sosial.',
            properties: [
                new ArraySchema('trends', 'Maksimal 15 tren paling relevan saat ini.', $trend),
            ],
            requiredFields: ['trends'],
        );
    }

    /**
     * Stage 1 — what to search and how to report it.
     */
    protected function groundingPrompt(): string
    {
        return implode("\n", [
            'Kamu adalah analis tren media sosial untuk tim Humas kepolisian (SPARC).',
            'Gunakan Google Search untuk menemukan tren konten media sosial terbaru di Indonesia: format video yang naik, topik ramai, hashtag tren, audio viral di Reels/TikTok, dan berita relevan.',
            '',
            'Fokus audiens: tim Humas yang membuat konten edukasi, event & liputan, sosialisasi & prestasi, pengumuman, dan human touch.',
            'Hindari tren sensitif, politik, atau berisiko reputasi.',
            'Hanya laporkan tren yang benar-benar ditemukan dari hasil pencarian; jangan mengarang.',
            'Sertakan URL sumber untuk setiap tren.',
            'Tulis maksimal 15 tren, urut dari yang paling relevan.',
        ]);
    }

    /**
     * Deduplicated web sources reported by the grounding metadata.
     *
     * @param  array<string, mixed>  $additionalContent
     * @return list<array{title: string, url: string}>
     */
    protected function extractSources(array $additionalContent): array
    {
        $sources = [];

        foreach ((array) ($additionalContent['citations'] ?? []) as $part) {
            foreach ((array) ($part->citations ?? []) as $citation) {
                $url = trim((string) ($citation->source ?? ''));

                if ($url === '' || ! str_starts_with($url, 'http')) {
                    continue;
                }

                $title = trim((string) ($citation->sourceTitle ?? ''));

                $sources[$url] = [
                    'title' => $title !== '' ? $title : $url,
                    'url' => $url,
                ];
            }
        }

        return array_values($sources);
    }

    /**
     * Stage 2 — convert the grounded answer into the JSON contract.
     */
    protected function normalizationPrompt(string $answer): string
    {
        return implode("\n", [
            'Ubah laporan tren berikut menjadi JSON sesuai skema.',
            'Gunakan hanya tren yang muncul di laporan. Jangan menambah data baru.',
            'Jika kategori tidak jelas, pilih topic. Jika momentum tidak jelas, pilih steady.',
            '',
            'Laporan:',
            $answer,
        ]);
    }

    /**
     * Normalize the grounded model output and citations into a stable trend shape.
     *
     * @param  array<string, mixed>  $result
     * @param  list<array{title: string, url: string}>  $sources
     * @return list<array{title: string, summary: string, category: string, momentum: string, relevance_score: int, hook_ideas: list<array{hook: string, rationale: string}>, content_ideas: list<string>, sources: list<array{title: string, url: string}>}>
     */
    protected function normalize(array $result, array $sources): array
    {
        return collect((array) ($result['trends'] ?? []))
            ->map(fn ($trend): array => $this->normalizeTrend((array) $trend, $sources))
            ->filter(fn (array $trend): bool => $trend['title'] !== '')
            ->slice(0, self::MAX_TRENDS)
            ->values()
            ->all();
    }

    /**
     * Normalize a single trend entry, falling back to safe defaults on invalid values.
     *
     * @param  array<string, mixed>  $trend
     * @param  list<array{title: string, url: string}>  $sources
     * @return array{title: string, summary: string, category: string, momentum: string, relevance_score: int, hook_ideas: list<array{hook: string, rationale: string}>, content_ideas: list<string>, sources: list<array{title: string, url: string}>}
     */
    protected function normalizeTrend(array $trend, array $sources): array
    {
        $title = mb_substr(trim((string) ($trend['title'] ?? '')), 0, 250);
        $category = trim((string) ($trend['category'] ?? ''));
        $momentum = trim((string) ($trend['momentum'] ?? ''));

        return [
            'title' => $title,
            'summary' => (string) ($trend['summary'] ?? ''),
            'category' => in_array($category, self::CATEGORIES, true) ? $category : TrendInsight::CATEGORY_TOPIC,
            'momentum' => in_array($momentum, self::MOMENTUMS, true) ? $momentum : TrendInsight::MOMENTUM_STEADY,
            'relevance_score' => max(0, min(100, (int) round((float) ($trend['relevance_score'] ?? 0)))),
            'hook_ideas' => collect((array) ($trend['hook_ideas'] ?? []))
                ->map(fn ($idea): array => [
                    'hook' => (string) ($idea['hook'] ?? ''),
                    'rationale' => (string) ($idea['rationale'] ?? ''),
                ])
                ->filter(fn (array $idea): bool => $idea['hook'] !== '')
                ->values()
                ->all(),
            'content_ideas' => $this->stringList($trend['content_ideas'] ?? []),
            'sources' => $sources,
        ];
    }

    /**
     * Delete trends that have not been refreshed within the retention window.
     */
    protected function pruneExpired(): void
    {
        TrendInsight::query()
            ->where('refreshed_at', '<', now()->subDays(self::RETENTION_DAYS))
            ->delete();
    }

    /**
     * Total tokens spent by both stages, stored for quota accounting.
     *
     * @return array{prompt: int, completion: int}
     */
    protected function usage(Usage ...$usages): array
    {
        return [
            'prompt' => array_sum(array_map(static fn (Usage $usage): int => $usage->promptTokens, $usages)),
            'completion' => array_sum(array_map(static fn (Usage $usage): int => $usage->completionTokens, $usages)),
        ];
    }

    /**
     * Coerce a mixed list into a clean list of non-empty strings.
     *
     * @return list<string>
     */
    protected function stringList(mixed $list): array
    {
        return collect((array) $list)
            ->map(fn ($item): string => trim((string) $item))
            ->filter(fn (string $item): bool => $item !== '')
            ->values()
            ->all();
    }

    protected function model(): string
    {
        return (string) config('services.gemini.model', 'gemini-2.5-flash');
    }

    protected function timeout(): int
    {
        return (int) config('services.gemini.timeout', 120);
    }
}
