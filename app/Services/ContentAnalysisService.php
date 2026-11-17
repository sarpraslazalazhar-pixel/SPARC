<?php

namespace App\Services;

use App\Models\AiSetting;
use Prism\Prism\Facades\Prism;

class ContentAnalysisService
{
    public const REVIEW_FIELDS = [
        'summary', 'strengths', 'improvements', 'hook_ideas', 'hashtags',
        'engagement_tips', 'readability_score', 'risk_flags', 'trend_context',
    ];

    /**
     * Check whether the Gemini provider is configured for Prism.
     */
    public function isConfigured(): bool
    {
        return (bool) config('prism.providers.'.AiSetting::provider().'.api_key');
    }

    /**
     * Render one content snapshot as a readable brief for the agent prompt.
     *
     * @param  array<string, mixed>  $snapshot
     */
    public function describe(array $snapshot): string
    {
        $formatLabels = [
            'reels_shorts' => 'Video Reels/Shorts',
            'carousel_feed' => 'Carousel Feed',
            'single_feed' => 'Single Post Feed',
        ];

        $pillarLabels = [
            'edukasi' => 'Edukasi',
            'event_liputan' => 'Event & Liputan',
            'sosialisasi_prestasi' => 'Sosialisasi & Prestasi',
            'pengumuman' => 'Pengumuman',
            'human_touch' => 'Human Touch',
        ];

        $lines = [
            'Judul: '.($snapshot['title'] ?? '-'),
            'Format: '.($formatLabels[$snapshot['format'] ?? ''] ?? ($snapshot['format'] ?? '-')),
            'Pilar: '.($pillarLabels[$snapshot['pillar'] ?? ''] ?? ($snapshot['pillar'] ?? '-')),
        ];

        if (! empty($snapshot['brief'])) {
            $lines[] = 'Brief: '.$snapshot['brief'];
        }

        $lines[] = 'Caption:';
        $lines[] = trim((string) ($snapshot['caption'] ?? '')) !== '' ? (string) $snapshot['caption'] : '(caption kosong)';

        $hashtags = implode(', ', (array) ($snapshot['hashtags'] ?? []));
        $lines[] = 'Hashtag: '.($hashtags !== '' ? '#'.$hashtags : '(belum ada)');

        $reels = $snapshot['reels_script'] ?? null;
        if (is_array($reels)) {
            $lines[] = 'Skrip Reels: hook "'.($reels['hookText'] ?? '-').'" / body "'.($reels['bodyText'] ?? '-').'" / cta "'.($reels['ctaText'] ?? '-').'"';
        }

        $slides = array_values((array) ($snapshot['slides'] ?? []));
        if ($slides !== []) {
            $lines[] = 'Slide:';
            foreach ($slides as $index => $slide) {
                $lines[] = '- '.($slide['title'] ?? 'Slide '.($index + 1)).': '.($slide['textContent'] ?? '-');
            }
        }

        return implode('
', $lines);
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
}
