<?php

namespace App\Services;

use App\Models\AiAnalysis;
use App\Models\AiSetting;
use App\Models\ContentItem;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use Prism\Prism\Facades\Prism;
use Prism\Prism\Schema\ArraySchema;
use Prism\Prism\Schema\NumberSchema;
use Prism\Prism\Schema\ObjectSchema;
use Prism\Prism\Schema\StringSchema;
use Prism\Prism\ValueObjects\Media\Image;
use Throwable;

/**
 * Scores a content draft, explains published Instagram metrics, and summarizes a
 * period. Every call is persisted in `ai_analyses` so repeated views cost no tokens.
 */
class ContentAnalyzerService
{
    private const PRE_PUBLISH_SYSTEM = 'Anda analis konten media sosial pemerintah. Nilai hanya dari data yang diberikan; jangan mengarang fakta, angka, atau nama layanan. Semua teks dalam Bahasa Indonesia.';

    public function isConfigured(): bool
    {
        return (bool) config('prism.providers.'.AiSetting::provider().'.api_key');
    }

    /**
     * Review a draft caption before publishing.
     *
     * @param  array{title?: string, caption: string, format?: string, pillar?: string, brief?: string}  $snapshot
     */
    public function analyzeDraft(array $snapshot, ?ContentItem $item = null, bool $force = false): AiAnalysis
    {
        if (! $force && $item instanceof ContentItem) {
            $cached = AiAnalysis::latestCompletedFor($item, AiAnalysis::PRE_PUBLISH);
            if ($cached && ($cached->input_snapshot['caption'] ?? null) === $snapshot['caption']) {
                return $cached;
            }
        }

        return $this->run(
            type: AiAnalysis::PRE_PUBLISH,
            item: $item,
            snapshot: $snapshot,
            system: self::PRE_PUBLISH_SYSTEM,
            prompt: $this->draftPrompt($snapshot),
            schema: $this->reviewSchema(),
            images: $this->attachedImages($snapshot),
        );
    }

    /**
     * Explain why one published post over- or under-performed.
     */
    public function analyzePerformance(ContentItem $item, bool $force = false): AiAnalysis
    {
        $snapshot = $this->performanceSnapshot($item);

        if (! $force) {
            $cached = AiAnalysis::latestCompletedFor($item, AiAnalysis::POST_PUBLISH);
            if ($cached && ($cached->input_snapshot['metrics'] ?? null) === $snapshot['metrics']) {
                return $cached;
            }
        }

        return $this->run(
            type: AiAnalysis::POST_PUBLISH,
            item: $item,
            snapshot: $snapshot,
            system: self::PRE_PUBLISH_SYSTEM,
            prompt: $this->performancePrompt($snapshot),
            schema: $this->reviewSchema(),
            images: $this->attachedImages($snapshot),
        );
    }

    /**
     * Period digest over the best and weakest published items.
     */
    public function digest(bool $force = false): AiAnalysis
    {
        $items = $this->digestItems();

        if ($items->isEmpty()) {
            throw new \RuntimeException('Belum ada konten tayang dengan metrik untuk diringkas.');
        }

        $fingerprint = $items->map(static fn (ContentItem $item): string => $item->id.':'.($item->reach ?? 0).':'.($item->saves ?? 0))->implode('|');

        if (! $force) {
            $cached = AiAnalysis::query()
                ->where('type', AiAnalysis::PERIODIC_DIGEST)
                ->where('status', AiAnalysis::STATUS_COMPLETED)
                ->latest('id')
                ->first();
            if ($cached && ($cached->input_snapshot['fingerprint'] ?? null) === $fingerprint) {
                return $cached;
            }
        }

        return $this->run(
            type: AiAnalysis::PERIODIC_DIGEST,
            item: null,
            snapshot: [
                'fingerprint' => $fingerprint,
                'period' => now()->translatedFormat('F Y'),
                'items' => $items->map(fn (ContentItem $item): array => $this->performanceSnapshot($item))->all(),
            ],
            system: self::PRE_PUBLISH_SYSTEM,
            prompt: $this->digestPrompt($items),
            schema: $this->digestSchema(),
        );
    }

    /**
     * @param  array<string, mixed>  $snapshot
     */
    private function run(
        string $type,
        ?ContentItem $item,
        array $snapshot,
        string $system,
        string $prompt,
        ObjectSchema $schema,
        array $images = [],
    ): AiAnalysis {
        if (! $this->isConfigured()) {
            throw new \RuntimeException('Kredensial AI belum dikonfigurasi. Isi API key di Pengaturan › AI.');
        }

        $analysis = new AiAnalysis([
            'type' => $type,
            'input_snapshot' => $snapshot,
            'status' => AiAnalysis::STATUS_QUEUED,
            'model' => $this->model(),
        ]);
        if ($item instanceof ContentItem) {
            $analysis->analyzable()->associate($item);
        }
        $analysis->save();

        try {
            $response = Prism::structured()
                ->using(AiSetting::provider(), $this->model())
                ->withSchema($schema)
                ->withSystemPrompt($system)
                ->withPrompt($prompt, $images)
                ->withMaxTokens(2000)
                ->withClientOptions(['timeout' => $this->timeout()])
                ->asStructured();

            $analysis->update([
                'status' => AiAnalysis::STATUS_COMPLETED,
                'result' => $this->normalize((array) ($response->structured ?? []), $type),
            ]);
        } catch (Throwable $exception) {
            $analysis->update([
                'status' => AiAnalysis::STATUS_FAILED,
                'error' => $exception->getMessage(),
            ]);

            throw $exception;
        }

        return $analysis;
    }

    /**
     * @param  array{title?: string, caption: string, format?: string, pillar?: string, brief?: string}  $snapshot
     */
    private function draftPrompt(array $snapshot): string
    {
        $lines = [
            'Nilai kesiapan tayang DRAFT berikut sebelum dipublikasikan.',
            'Judul: '.($snapshot['title'] ?? '(belum ada)'),
            'Format: '.($snapshot['format'] ?? '(belum ditentukan)'),
            'Pilar: '.($snapshot['pillar'] ?? '(belum ditentukan)'),
        ];
        if (! empty($snapshot['brief'])) {
            $lines[] = 'Brief: '.$snapshot['brief'];
        }
        $lines[] = 'Caption:';
        $lines[] = $snapshot['caption'];
        if ($this->attachedImages($snapshot) !== []) {
            $lines[] = 'Gambar desain/referensi dilampirkan: nilai keterbacaan visualnya (hierarki teks, kontras, kepadatan) di visual_readability.';
        }
        $lines[] = 'Aturan: skor 0-100 untuk overall_score; status_label salah satu "Perlu Perbaikan Utama", "Cukup Baik", "Siap Tayang"; beri 2-4 kekuatan, 2-4 perbaikan, 2-3 langkah aksi, dan tepat 2 alternatif caption dengan gaya berbeda. Alternatif caption harus mempertahankan fakta pada brief.';

        return implode("\n", $lines);
    }

    /**
     * Visual context the reviewer may read: design, moodboard, and the Reels cover.
     *
     * Video itself is never attached — Prism has no File API upload, and inline
     * base64 caps near 20MB while Instagram CDN links expire.
     *
     * @param  array<string, mixed>  $snapshot
     * @return list<Image>
     */
    private function attachedImages(array $snapshot): array
    {
        $urls = array_filter([
            (string) ($snapshot['result_design_url'] ?? ''),
            (string) ($snapshot['ref_design_url'] ?? ''),
            (string) ($snapshot['ig_thumbnail_url'] ?? ''),
        ]);

        $images = [];
        foreach (array_unique($urls) as $url) {
            if (! preg_match('#^https?://#i', $url)) {
                continue;
            }
            if (preg_match('#(drive\.google\.com|canva\.com|figma\.com|docs\.google\.com)#i', $url)) {
                continue;
            }

            // Thumbnails already cached on the public disk: read bytes directly so the
            // review never depends on APP_URL, the storage symlink, or a live CDN link.
            $cached = $this->cachedThumbnailPath($url);
            if ($cached !== null) {
                $images[] = Image::fromStoragePath($cached, 'public');

                continue;
            }

            $images[] = Image::fromUrl($url);
        }

        return $images;
    }

    /**
     * Map a stored `/storage/ig_cache/...` URL back to its file on the public disk.
     */
    private function cachedThumbnailPath(string $url): ?string
    {
        if (! preg_match('#/storage/(ig_cache/[A-Za-z0-9_\-]+\.(?:jpg|jpeg|png|webp))$#i', $url, $matches)) {
            return null;
        }

        return Storage::disk('public')->exists($matches[1]) ? $matches[1] : null;
    }

    /**
     * @param  array<string, mixed>  $snapshot
     */
    private function performancePrompt(array $snapshot): string
    {
        $metrics = (array) ($snapshot['metrics'] ?? []);

        $lines = [
            'Jelaskan performa postingan Instagram berikut dan beri tindak lanjut.',
            'Judul: '.($snapshot['title'] ?? '-'),
            'Format: '.($snapshot['format'] ?? '-'),
            'Pilar: '.($snapshot['pillar'] ?? '-'),
            'Jam tayang: '.($snapshot['publish_time'] ?? '-'),
            'Metrik: '.collect($metrics)->map(fn ($value, $key): string => $key.'='.$value)->implode(', '),
        ];
        $lines[] = 'Caption:';
        $lines[] = (string) ($snapshot['caption'] ?? '(tanpa caption)');
        if ($this->attachedImages($snapshot) !== []) {
            $lines[] = 'Gambar cover/desain dilampirkan: nilai keterbacaan visualnya di visual_readability.';
        }
        $lines[] = 'Aturan: hitung rasio terhadap reach bila reach > 0, sebutkan rasio itu di executive_summary. Skor 0-100 mencerminkan efektivitas konten, bukan jumlah absolut interaksi. actionable_next_steps harus bisa dikerjakan minggu ini.';

        return implode("\n", $lines);
    }

    /**
     * @param  Collection<int, ContentItem>  $items
     */
    private function digestPrompt(Collection $items): string
    {
        $lines = ['Ringkas pola performa konten periode '.now()->translatedFormat('F Y').' untuk perencanaan bulan depan.', 'Data konten (terbaik dan terlemah):'];
        foreach ($items as $item) {
            $metrics = $this->performanceSnapshot($item)['metrics'];
            $lines[] = sprintf(
                '- %s | %s | %s | reach=%d likes=%d saves=%d shares=%d komentar=%d',
                $item->title,
                $item->format,
                $item->pillar,
                $metrics['reach'],
                $metrics['likes'],
                $metrics['saves'],
                $metrics['shares'],
                $metrics['comments'],
            );
        }
        $lines[] = 'Aturan: simpulkan pola yang benar-benar didukung angka di atas; sebutkan minimal 2 pola kemenangan, 2 preferensi audiens, dan 3 rekomendasi pilar konten bulan depan.';

        return implode("\n", $lines);
    }

    /**
     * @return array<string, mixed>
     */
    private function performanceSnapshot(ContentItem $item): array
    {
        return [
            'title' => (string) $item->title,
            'format' => (string) $item->format,
            'pillar' => (string) $item->pillar,
            'publish_time' => (string) ($item->publish_time ?? ''),
            'caption' => (string) ($item->caption ?? ''),
            'ig_thumbnail_url' => (string) ($item->ig_thumbnail_url ?? ''),
            'metrics' => [
                'reach' => (int) ($item->reach ?? 0),
                'views' => (int) ($item->views ?? 0),
                'likes' => (int) ($item->likes ?? 0),
                'comments' => (int) ($item->comments_count ?? 0),
                'shares' => (int) ($item->shares ?? 0),
                'saves' => (int) ($item->saves ?? 0),
            ],
        ];
    }

    /**
     * Best 5 and weakest 5 published items of the current month by engagement rate.
     *
     * @return Collection<int, ContentItem>
     */
    private function digestItems(): Collection
    {
        $published = ContentItem::query()
            ->where('status', 'published')
            ->whereNotNull('reach')
            ->where('reach', '>', 0)
            ->whereBetween('publish_date', [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString()])
            ->get();

        if ($published->count() < 2) {
            $published = ContentItem::query()
                ->where('status', 'published')
                ->whereNotNull('reach')
                ->where('reach', '>', 0)
                ->latest('publish_date')
                ->limit(20)
                ->get();
        }

        $sorted = $published->sortByDesc(fn (ContentItem $item): float => $this->engagementRate($item))->values();

        return $sorted->take(5)->concat($sorted->slice(-5)->reverse())->unique('id')->values();
    }

    private function engagementRate(ContentItem $item): float
    {
        $reach = (int) ($item->reach ?? 0);
        if ($reach <= 0) {
            return 0.0;
        }

        return (((int) ($item->likes ?? 0)) + ((int) ($item->comments_count ?? 0)) + ((int) ($item->shares ?? 0)) + ((int) ($item->saves ?? 0))) / $reach;
    }

    private function reviewSchema(): ObjectSchema
    {
        return new ObjectSchema(
            name: 'content_review',
            description: 'Hasil evaluasi konten yang siap dirender di UI.',
            properties: [
                new NumberSchema('overall_score', 'Skor kesiapan atau efektivitas konten, 0-100.', minimum: 0, maximum: 100),
                new StringSchema('status_label', 'Salah satu: "Perlu Perbaikan Utama", "Cukup Baik", "Siap Tayang".'),
                new ObjectSchema(
                    name: 'metrics_breakdown',
                    description: 'Rincian skor per aspek.',
                    properties: [
                        new NumberSchema('hook_strength', 'Kekuatan pembuka, 0-100.', minimum: 0, maximum: 100),
                        new NumberSchema('message_clarity', 'Kejelasan pesan, 0-100.', minimum: 0, maximum: 100),
                        new NumberSchema('cta_effectiveness', 'Efektivitas ajakan bertindak, 0-100.', minimum: 0, maximum: 100),
                        new NumberSchema('visual_readability', 'Keterbacaan desain, 0-100. Null bila tidak ada gambar.', nullable: true, minimum: 0, maximum: 100),
                    ],
                    requiredFields: ['hook_strength', 'message_clarity', 'cta_effectiveness'],
                ),
                new StringSchema('executive_summary', 'Ringkasan 2-4 kalimat.'),
                new ArraySchema('strengths', 'Kekuatan konten.', new StringSchema('strength', 'Satu kekuatan.')),
                new ArraySchema('improvements', 'Area perbaikan.', new StringSchema('improvement', 'Satu perbaikan.')),
                new ArraySchema('actionable_next_steps', 'Langkah tindak lanjut.', new StringSchema('step', 'Satu langkah.')),
                new ArraySchema(
                    'suggested_captions',
                    'Alternatif caption siap pakai.',
                    new ObjectSchema(
                        name: 'suggested_caption',
                        description: 'Satu alternatif caption.',
                        properties: [
                            new StringSchema('style', 'Nama gaya penulisan.'),
                            new StringSchema('text', 'Isi caption lengkap.'),
                        ],
                        requiredFields: ['style', 'text'],
                    ),
                ),
            ],
            requiredFields: ['overall_score', 'status_label', 'metrics_breakdown', 'executive_summary', 'strengths', 'improvements', 'actionable_next_steps'],
        );
    }

    private function digestSchema(): ObjectSchema
    {
        return new ObjectSchema(
            name: 'strategy_digest',
            description: 'Ringkasan strategi konten satu periode.',
            properties: [
                new StringSchema('headline', 'Judul ringkasan maksimal 10 kata.'),
                new StringSchema('summary', 'Ringkasan 2-4 kalimat.'),
                new ArraySchema('winning_patterns', 'Pola konten yang berhasil.', new StringSchema('pattern', 'Satu pola.')),
                new ArraySchema('audience_preferences', 'Preferensi audiens.', new StringSchema('preference', 'Satu preferensi.')),
                new ArraySchema('pillar_recommendations', 'Rekomendasi pilar bulan depan.', new StringSchema('recommendation', 'Satu rekomendasi.')),
            ],
            requiredFields: ['headline', 'summary', 'winning_patterns', 'audience_preferences', 'pillar_recommendations'],
        );
    }

    /**
     * Clamp scores and drop empty strings so the UI never renders blanks.
     *
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>
     */
    private function normalize(array $raw, string $type): array
    {
        if ($type === AiAnalysis::PERIODIC_DIGEST) {
            return [
                'headline' => trim((string) ($raw['headline'] ?? 'Ringkasan strategi konten')),
                'summary' => trim((string) ($raw['summary'] ?? '')),
                'winning_patterns' => $this->stringList($raw['winning_patterns'] ?? []),
                'audience_preferences' => $this->stringList($raw['audience_preferences'] ?? []),
                'pillar_recommendations' => $this->stringList($raw['pillar_recommendations'] ?? []),
            ];
        }

        $breakdown = (array) ($raw['metrics_breakdown'] ?? []);

        return [
            'overall_score' => $this->score($raw['overall_score'] ?? 0),
            'status_label' => trim((string) ($raw['status_label'] ?? 'Cukup Baik')),
            'metrics_breakdown' => [
                'hook_strength' => $this->score($breakdown['hook_strength'] ?? 0),
                'message_clarity' => $this->score($breakdown['message_clarity'] ?? 0),
                'cta_effectiveness' => $this->score($breakdown['cta_effectiveness'] ?? 0),
                'visual_readability' => isset($breakdown['visual_readability']) && $breakdown['visual_readability'] !== null
                    ? $this->score($breakdown['visual_readability'])
                    : null,
            ],
            'executive_summary' => trim((string) ($raw['executive_summary'] ?? '')),
            'strengths' => $this->stringList($raw['strengths'] ?? []),
            'improvements' => $this->stringList($raw['improvements'] ?? []),
            'actionable_next_steps' => $this->stringList($raw['actionable_next_steps'] ?? []),
            'suggested_captions' => collect((array) ($raw['suggested_captions'] ?? []))
                ->map(fn ($caption): array => [
                    'style' => trim((string) (is_array($caption) ? ($caption['style'] ?? '') : '')),
                    'text' => trim((string) (is_array($caption) ? ($caption['text'] ?? '') : '')),
                ])
                ->filter(fn (array $caption): bool => $caption['text'] !== '')
                ->values()
                ->all(),
        ];
    }

    private function score(mixed $value): int
    {
        return (int) max(0, min(100, round((float) $value)));
    }

    /**
     * @return list<string>
     */
    private function stringList(mixed $list): array
    {
        return collect((array) $list)
            ->map(fn ($item): string => trim((string) $item))
            ->filter(fn (string $item): bool => $item !== '')
            ->values()
            ->all();
    }

    private function model(): string
    {
        return (string) config('services.gemini.model', 'gemini-2.5-flash');
    }

    private function timeout(): int
    {
        return (int) config('services.gemini.timeout', 120);
    }
}
