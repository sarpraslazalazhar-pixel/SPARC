<?php

namespace App\Services;

use App\Models\AiSetting;
use App\Models\ContentItem;
use App\Models\TrendInsight;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Prism\Prism\Facades\Prism;
use Prism\Prism\ValueObjects\Embedding;

/**
 * In-process retrieval memory for TRACE APU: content snapshots and trend insights.,
 *
 * ponytail: no vector index and no background indexer — the workspace is small
 * (hundreds of rows), so rows are folded in memory per request. Swap in a real
 * index once `content_items` outgrows a few thousand rows.
 */
class TraceApuCorpusService
{
    public const EMBEDDING_MODEL = 'gemini-embedding-001';

    /**
     * Embedding model configured by the admin, falling back to the default.
     */
    public function embeddingModel(): string
    {
        return (string) config('services.gemini.embedding_model', self::EMBEDDING_MODEL);
    }

    public const EMBEDDING_DIMENSIONS = 256;

    public const MAX_CHUNKS = 400;

    /**
     * Reach below this is treated as unmeasured: a handful of views skews ER.
     */
    public const MIN_RANKABLE_REACH = 100;

    /**
     * Content fields that carry the caption/script signal worth retrieving.
     */
    private const TEXT_FIELDS = ['title', 'caption', 'brief', 'activity_title', 'campaign_title'];

    /**
     * Embed a query string; returns null when the provider is unavailable.
     *
     * @return list<float>|null
     */
    public function embed(string $text): ?array
    {
        $text = trim($text);

        if ($text === '') {
            return null;
        }

        try {
            $response = Prism::embeddings()
                ->using(AiSetting::provider(), $this->embeddingModel())
                ->fromInput(mb_substr($text, 0, 4000))
                // `outputDimensionality` is Gemini-only; OpenAI-compatible gateways reject it.
                ->whenProvider(AiSetting::PROVIDER_GEMINI, fn ($request) => $request->withProviderOptions(['outputDimensionality' => self::EMBEDDING_DIMENSIONS]))
                ->withClientOptions(['timeout' => 20])
                ->asEmbeddings();
        } catch (\Throwable) {
            return null;
        }

        $vector = $response->embeddings[0] ?? null;

        if (! $vector instanceof Embedding || $vector->embedding === []) {
            return null;
        }

        return array_map(static fn ($value): float => (float) $value, array_values($vector->embedding));
    }

    /**
     * Select the content items worth grounding an answer in.
     *
     * @param  string|null  $query  Retrieval query; null keeps the newest rows without embedding.
     * @return Collection<int, ContentItem>
     */
    public function scopedItems(string $query, ?Carbon $since = null, int $limit = 6, ?string $status = null): Collection
    {
        $items = ContentItem::query()
            ->select(['id', 'content_id', 'title', 'caption', 'brief', 'format', 'pillar', 'status', 'publish_date', 'metrics_synced_at', 'reach', 'likes', 'comments_count', 'shares', 'saves'])
            ->when($since !== null, fn (Builder $builder) => $builder->where('updated_at', '>=', $since))
            ->when($status, fn (Builder $builder, string $value) => $builder->where('status', $value))
            ->latest('updated_at')
            ->limit(self::MAX_CHUNKS)
            ->get();

        if ($items->isEmpty() || trim((string) $query) === '') {
            return $items->take($limit);
        }

        $vector = $this->embed($query);

        if ($vector === null) {
            return $this->keywordRank($items, $query)->take($limit);
        }

        return $items
            ->map(function (ContentItem $item) use ($vector): array {
                $embedding = $item->embedForTraceApu();

                return [
                    'item' => $item,
                    'score' => is_array($embedding) ? $this->cosine($vector, $embedding) : null,
                ];
            })
            ->sortByDesc(fn (array $row): float => $row['score'] ?? -1)
            ->pluck('item')
            ->take($limit)
            ->values();
    }

    /**
     * Top-performing content, optionally filtered to one format or pillar.
     *
     * Ranking metric is interactions (likes+comments+shares+saves), so published
     * content with real Instagram metrics wins over fresh drafts.
     *
     * @return Collection<int, ContentItem>
     */
    public function topPerforming(?string $format = null, ?string $pillar = null, int $limit = 5): Collection
    {
        return ContentItem::query()
            ->select(['id', 'content_id', 'title', 'format', 'pillar', 'status', 'caption', 'reach', 'likes', 'comments_count', 'shares', 'saves'])
            ->when($format, fn (Builder $builder, string $value) => $builder->where('format', $value))
            ->when($pillar, fn (Builder $builder, string $value) => $builder->where('pillar', $value))
            ->whereNotNull('metrics_synced_at')
            ->orderByRaw('(COALESCE(likes, 0) + COALESCE(comments_count, 0) + COALESCE(shares, 0) + COALESCE(saves, 0)) DESC')
            ->limit($limit)
            ->get();
    }

    /**
     * Portfolio-level metric aggregates, including the average interaction rate
     * of published items that have Instagram metrics.
     *
     * Rates come from items with rankable reach; `stated_reach` is the sum of
     * whatever reach the workspace stored (partial IG imports are common).
     *
     * @return array{total: int, measured: int, by_format: array<string, int>, by_pillar: array<string, int>, avg_engagement_rate: float|null, avg_reach: float|null, stated_reach: int, stated_interactions: int}
     */
    public function portfolio(): array
    {
        $rows = ContentItem::query()
            ->select(['format', 'pillar', 'reach', 'likes', 'comments_count', 'shares', 'saves'])
            ->get();

        $measured = $rows->filter(static fn (ContentItem $row): bool => (int) $row->reach >= self::MIN_RANKABLE_REACH);
        $rates = $measured->map(static fn (ContentItem $row): float => (
            (int) $row->likes + (int) $row->comments_count + (int) $row->shares + (int) $row->saves
        ) / (int) $row->reach);

        return [
            'total' => $rows->count(),
            'measured' => $measured->count(),
            'by_format' => $rows->countBy(fn (ContentItem $row): string => (string) $row->format)->all(),
            'by_pillar' => $rows->countBy(fn (ContentItem $row): string => (string) $row->pillar)->all(),
            'avg_engagement_rate' => $rates->isEmpty() ? null : round((float) $rates->avg() * 100, 2),
            'avg_reach' => $measured->isEmpty() ? null : round((float) $measured->avg('reach')),
            'stated_reach' => (int) $rows->sum(fn (ContentItem $row): int => (int) $row->reach),
            'stated_interactions' => (int) $rows->sum(fn (ContentItem $row): int => (int) $row->likes + (int) $row->comments_count + (int) $row->shares + (int) $row->saves),
        ];
    }

    /**
     * Resolve a content reference (content_id or numeric id).
     */
    public function findItem(string $reference): ?ContentItem
    {
        return ContentItem::query()
            ->where('content_id', $reference)
            ->orWhere('id', is_numeric($reference) ? (int) $reference : 0)
            ->first();
    }

    /**
     * Build the compact system message summarising workspace state and retrieved rows.
     *
     * @param  Collection<int, ContentItem>  $items
     */
    public function contextBlock(Collection $items, ?ContentItem $focus = null): string
    {
        $lines = [
            'Konteks workspace SPARC (diambil untuk percakapan ini):',
        ];

        if ($focus instanceof ContentItem) {
            $lines[] = sprintf(
                'Fokus konten saat ini: [%s] %s — caption: "%s". Revisi caption mengacu ke konten ini.',
                (string) ($focus->content_id ?: $focus->getKey()),
                (string) $focus->title,
                (string) Str::limit(trim((string) $focus->caption), 300)
            );
        }

        foreach ($items as $item) {
            $parts = implode(' · ', array_filter([
                $item->content_id,
                $item->format,
                $item->pillar,
                $item->status,
                $item->publish_date?->toDateString(),
            ]));

            $caption = trim((string) $item->caption);
            $caption = $caption !== '' ? ' Caption: '.mb_substr($caption, 0, 400) : '';

            $lines[] = sprintf('- [%s] %s (%s).%s', $parts, (string) $item->title, (string) $item->brief, $caption);
        }

        $trends = $this->activeTrends();

        if ($trends->isNotEmpty()) {
            $lines[] = '';
            $lines[] = 'Tren aktif di basis data (refreshed '.($this->lastRefreshed($trends)?->diffForHumans() ?? 'belum pernah').'):';

            foreach ($trends as $trend) {
                $lines[] = sprintf(
                    '- %s [%s · %s · skor %d]: %s',
                    $trend->title,
                    $trend->category,
                    $trend->momentum,
                    $trend->relevance_score,
                    mb_substr((string) $trend->summary, 0, 240),
                );
            }
        }

        return implode("\n", $lines);
    }

    /**
     * Stream the newest workspace titles into a callback (tool surface for the hook bank).
     *
     * @param  callable(string, string): void  $callback  Receives title and content reference.
     */
    public function recentTitles(int $limit, callable $callback): void
    {
        ContentItem::query()
            ->whereNotNull('title')
            ->latest('updated_at')
            ->limit($limit)
            ->get(['id', 'content_id', 'title'])
            ->each(static function (ContentItem $item) use ($callback): void {
                $callback((string) $item->title, (string) ($item->content_id ?: $item->getKey()));
            });
    }

    /**
     * Build the analysis snapshot for one content item referenced by content_id or numeric id.
     *
     * @return array{title: string, format: string, pillar: string, brief: string, caption: string, hashtags: list<string>, include_trends: bool, trends: list<array{title: string, summary: string, momentum: string}>}|null
     */
    public function contentSnapshot(string $reference, bool $includeTrends): ?array
    {
        $item = ContentItem::query()
            ->where('content_id', $reference)
            ->orWhere('id', is_numeric($reference) ? (int) $reference : 0)
            ->first();

        if (! $item instanceof ContentItem) {
            return null;
        }

        $caption = (string) $item->caption;

        return [
            'title' => (string) $item->title,
            'format' => (string) $item->format,
            'pillar' => (string) $item->pillar,
            'brief' => (string) $item->brief,
            'caption' => $caption,
            'hashtags' => preg_match_all('/#(\w+)/u', $caption, $matches) ? array_slice($matches[1], 0, 20) : [],
            'include_trends' => $includeTrends,
            'trends' => $includeTrends
                ? $this->activeTrends()->map(static fn (TrendInsight $trend): array => [
                    'title' => (string) $trend->title,
                    'summary' => (string) $trend->summary,
                    'momentum' => (string) $trend->momentum,
                ])->values()->all()
                : [],
        ];
    }

    /**
     * Active trend headings only, for the greeting shown before any tool call.
     *
     * @return Collection<int, TrendInsight>
     */
    public function activeTrends(int $limit = 12): Collection
    {
        return TrendInsight::query()
            ->active()
            ->orderByDesc('relevance_score')
            ->limit($limit)
            ->get();
    }

    /**
     * @param  Collection<int, TrendInsight>  $trends
     */
    public function lastRefreshed(Collection $trends): ?Carbon
    {
        $value = $trends->max('refreshed_at');

        return $value instanceof \DateTimeInterface ? Carbon::instance($value) : null;
    }

    /**
     * @param  Collection<int, ContentItem>  $items
     * @return Collection<int, ContentItem>
     */
    private function keywordRank(Collection $items, string $query): Collection
    {
        $tokens = array_filter(
            preg_split('/\W+/', mb_strtolower($query)) ?: [],
            static fn (string $token): bool => mb_strlen($token) >= 4
        );

        if ($tokens === []) {
            return $items;
        }

        return $items->sortByDesc(function (ContentItem $item) use ($tokens): int {
            $haystack = mb_strtolower(implode(' ', array_intersect_key(
                $item->getAttributes(),
                array_flip(self::TEXT_FIELDS)
            )));

            return count(array_filter($tokens, static fn (string $token): bool => str_contains($haystack, $token)));
        })->values();
    }

    /**
     * @param  list<float>  $a
     * @param  array<int, mixed>  $b
     */
    private function cosine(array $a, array $b): float
    {
        $b = array_map(static fn ($value): float => (float) $value, array_values($b));
        $count = min(count($a), count($b));
        $dot = 0.0;
        $normA = 0.0;
        $normB = 0.0;

        for ($index = 0; $index < $count; $index++) {
            $dot += $a[$index] * $b[$index];
            $normA += $a[$index] ** 2;
            $normB += $b[$index] ** 2;
        }

        if ($normA <= 0.0 || $normB <= 0.0) {
            return 0.0;
        }

        return $dot / (sqrt($normA) * sqrt($normB));
    }
}
