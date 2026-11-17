<?php

namespace App\Services;

use App\Models\ContentItem;
use App\Models\ContentPillar;
use Illuminate\Support\Str;
use Prism\Prism\Schema\ArraySchema;
use Prism\Prism\Schema\NumberSchema;
use Prism\Prism\Schema\ObjectSchema;
use Prism\Prism\Schema\StringSchema;
use Prism\Prism\Tool;

/**
 * TRACE APU tool surfaces. Each tool grounds one capability the agent may call:
 * retrieving real workspace content, scoring it, and proposing reviewed edits.
 */
class TraceApuToolRegistry
{
    public function __construct(
        private readonly TraceApuCorpusService $corpus,
        private readonly TrendFinderService $trends,
        private readonly ContentAnalysisService $analysis,
    ) {}

    /**
     * @return list<Tool>
     */
    public function tools(): array
    {
        return [
            $this->searchContent(),
            $this->getContent(),
            $this->contentPerformance(),
            $this->findTrends(),
            $this->buildHookBank(),
            $this->suggestCaption(),
        ];
    }

    /**
     * Semantic search over the workspace content corpus.
     */
    private function searchContent(): Tool
    {
        return (new Tool)->as('search_content')
            ->for('Cari konten di workspace SPARC (judul, caption, brief) berdasarkan makna pertanyaan. Kembalikan ID konten yang relevan.')
            ->withStringParameter('query', 'Apa yang dicari, misalnya "konten edukasi antrean layanan" atau "caption pengumuman".')
            ->withNumberParameter('limit', 'Jumlah maksimum hasil (1-10, default 5).', false)
            ->withEnumParameter('status', 'Filter tahap alur kerja.', ['inbox', 'briefing', 'in_progress', 'review_approval', 'ready_to_publish', 'published'], false)
            ->using(function (string $query, int $limit = 5, ?string $status = null): string {
                $items = $this->corpus->scopedItems($query, null, max(1, min(10, $limit)), $status);

                if ($items->isEmpty()) {
                    return 'Tidak ada konten yang cocok di workspace.';
                }

                return $items->map(static fn (ContentItem $item): array => [
                    'ref' => (string) ($item->content_id ?: $item->getKey()),
                    'title' => (string) $item->title,
                    'format' => (string) $item->format,
                    'pillar' => (string) $item->pillar,
                    'status' => (string) $item->status,
                    'caption' => Str::limit(trim((string) $item->caption), 240),
                    'brief' => Str::limit(trim((string) $item->brief), 200),
                ])->toJson(JSON_UNESCAPED_UNICODE);
            });
    }

    /**
     * Full snapshot of one item, rendered as a review brief.
     */
    private function getContent(): Tool
    {
        return (new Tool)->as('get_content')
            ->for('Ambil isi lengkap satu konten (caption, brief, skrip, hashtag) untuk dianalisis atau diperbaiki.')
            ->withStringParameter('content_ref', 'ID konten (content_id) dari hasil search_content.')
            ->using(function (string $content_ref): string {
                $snapshot = $this->corpus->contentSnapshot($content_ref, false);

                return $snapshot === null
                    ? 'Konten tidak ditemukan. Ambil ID terbaru lewat search_content.'
                    : $this->analysis->describe($snapshot);
            });
    }

    /**
     * Portfolio-level performance numbers behind content advice.
     */
    private function contentPerformance(): Tool
    {
        return (new Tool)->as('content_performance')
            ->for('Statistik performa konten workspace: jumlah per format/pilar, rata-rata engagement rate dan reach, serta konten terbaik.')
            ->withEnumParameter('format', 'Filter format.', ['reels_shorts', 'carousel_feed', 'single_feed'], false)
            ->withEnumParameter('pillar', 'Filter pilar konten.', $this->pillarKeys(), false)
            ->using(function (?string $format = null, ?string $pillar = null): string {
                $best = $this->corpus->topPerforming($format, $pillar, 5)->map(static fn (ContentItem $item): array => [
                    'ref' => (string) ($item->content_id ?: $item->getKey()),
                    'title' => (string) $item->title,
                    'reach' => (int) $item->reach,
                    'interactions' => (int) $item->likes + (int) $item->comments_count + (int) $item->shares + (int) $item->saves,
                ])->values()->all();

                return json_encode([
                    'portfolio' => $this->corpus->portfolio(),
                    'top_performing' => $best,
                ], JSON_UNESCAPED_UNICODE) ?: '{}';
            });
    }

    /**
     * Grounded Google Search into the `trend_insights` table.
     */
    private function findTrends(): Tool
    {
        return (new Tool)->as('find_trends')
            ->for('Cari tren konten media sosial Indonesia terbaru lewat Google Search grounding dan simpan ke halaman Tren.')
            ->withBooleanParameter('force', 'true untuk memaksa pencarian baru walau tren aktif sudah ada.', false)
            ->using(function (bool $force = false): string {
                if (! $this->trends->isConfigured()) {
                    return 'GEMINI_API_KEY belum dikonfigurasi, pencarian tren tidak bisa dilakukan.';
                }

                if (! $force && $this->trends->latest()->isNotEmpty()) {
                    return 'Tren aktif sudah tersedia di basis data dan ada di konteks. Panggil dengan force=true hanya bila pengguna minta data segar.';
                }

                return sprintf('Pencarian tren selesai: %d tren disimpan atau diperbarui.', $this->trends->fetchAndStore());
            });
    }

    /**
     * Ready-made opening hooks from trends and recent content titles.
     */
    private function buildHookBank(): Tool
    {
        return (new Tool)->as('build_hook_bank')
            ->for('Susun daftar hook pembuka siap pakai dari tren aktif dan judul konten terbaru di workspace.')
            ->withNumberParameter('limit', 'Jumlah maksimum hook (1-12, default 8).', false)
            ->using(function (int $limit = 8): string {
                $limit = max(1, min(12, $limit));
                $hooks = [];

                foreach ($this->trends->latest(6) as $trend) {
                    foreach ((array) $trend->hook_ideas as $idea) {
                        $hook = trim((string) ($idea['hook'] ?? ''));

                        if ($hook === '') {
                            continue;
                        }

                        $hooks[] = ['source' => 'trend:'.$trend->getKey(), 'hook' => $hook, 'note' => (string) ($idea['rationale'] ?? '')];
                    }
                }

                $this->corpus->recentTitles($limit, function (string $title, string $reference) use (&$hooks): void {
                    $hooks[] = ['source' => 'content:'.$reference, 'hook' => $title, 'note' => 'Judul konten '.$reference];
                });

                return json_encode(array_slice($hooks, 0, $limit), JSON_UNESCAPED_UNICODE) ?: '[]';
            });
    }

    /**
     * Return explicit caption edits the user can apply with one click.
     */
    private function suggestCaption(): Tool
    {
        return (new Tool)->as('suggest_caption')
            ->for('Ajukan revisi caption final untuk satu konten. Wajib memakai caption dan konteks asli dari get_content.')
            ->withStringParameter('content_ref', 'ID konten (content_id) yang direvisi.')
            ->withStringParameter('caption', 'Caption versi baru, siap pakai, lengkap dengan hashtag bila perlu.')
            ->withStringParameter('rationale', 'Alasan singkat mengapa versi ini lebih kuat.')
            ->using(function (string $content_ref, string $caption, string $rationale): string {
                return json_encode([
                    'content_ref' => $content_ref,
                    'caption' => trim($caption),
                    'rationale' => trim($rationale),
                ], JSON_UNESCAPED_UNICODE) ?: '{}';
            });
    }

    /**
     * Pilar aktif dari tabel taksonomi, dibaca ulang per turn agar pilar baru langsung dikenali.
     *
     * @return list<string>
     */
    public function pillarKeys(): array
    {
        return array_values(array_map(static fn (array $pillar): string => $pillar['key'], ContentPillar::options()));
    }

    /**
     * JSON schema used when a Studio project asks TRACE APU to draft its script.
     */
    public function draftSchema(): ObjectSchema
    {
        return new ObjectSchema(
            name: 'traceapu_draft',
            description: 'Draf naskah pendek yang siap dipakai operator.',
            properties: [
                new StringSchema('hook', 'Hook pembuka maksimal 15 kata.'),
                new StringSchema('body', 'Inti naskah 2-4 kalimat.'),
                new StringSchema('cta', 'Ajakan penutup satu kalimat.'),
                new ArraySchema('hashtags', 'Hashtag tambahan tanpa tanda pagar.', new StringSchema('tag', 'Satu hashtag.')),
                new NumberSchema('relevance_score', 'Kesesuaian dengan tren dan pilar konten, 0-100.', minimum: 0, maximum: 100),
            ],
            requiredFields: ['hook', 'body', 'cta'],
        );
    }
}
