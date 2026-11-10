<?php

namespace Tests\Unit;

use App\Services\SparcExcelReportService;
use PHPUnit\Framework\TestCase;

class SparcExcelReportFilterTest extends TestCase
{
    /**
     * @return array<int, array<string, mixed>>
     */
    private function samplePublications(): array
    {
        return [
            [
                'id' => 'pub-A',
                'platform' => 'instagram',
                'format' => 'reels_shorts',
                'publishedActualAt' => '2026-09-26 10:00',
                'scheduledAt' => '2026-09-26 09:00',
            ],
            [
                'id' => 'pub-B',
                'platform' => 'instagram',
                'format' => 'feed',
                'publishedActualAt' => null,
                'scheduledAt' => '2026-10-01 10:00',
            ],
            [
                'id' => 'pub-C',
                'platform' => 'tiktok',
                'format' => 'carousel_feed',
                'publishedActualAt' => null,
                'scheduledAt' => '2026-10-31 09:00',
            ],
            [
                'id' => 'pub-D',
                'platform' => 'instagram',
                'format' => 'reels',
                'publishedActualAt' => null,
                'scheduledAt' => '2026-11-10 10:00',
            ],
        ];
    }

    public function test_filter_publications_by_date_range(): void
    {
        $filtered = SparcExcelReportService::filterPublications(
            $this->samplePublications(),
            'all',
            'all',
            '2026-10-01',
            '2026-10-31'
        );

        $ids = array_column($filtered, 'id');
        $this->assertSame(['pub-B', 'pub-C'], $ids);
    }

    public function test_filter_publications_by_format(): void
    {
        $filtered = SparcExcelReportService::filterPublications(
            $this->samplePublications(),
            'all',
            'reels',
            null,
            null
        );

        $ids = array_column($filtered, 'id');
        $this->assertSame(['pub-A', 'pub-D'], $ids);
    }

    public function test_filter_publications_combined(): void
    {
        $filtered = SparcExcelReportService::filterPublications(
            $this->samplePublications(),
            'instagram',
            'feed',
            null,
            '2026-10-15'
        );

        $ids = array_column($filtered, 'id');
        $this->assertSame(['pub-B'], $ids);
    }

    public function test_filter_publications_no_matches(): void
    {
        $filtered = SparcExcelReportService::filterPublications(
            $this->samplePublications(),
            'all',
            'carousel',
            '2026-11-01',
            null
        );

        $this->assertEmpty($filtered);
    }
}
