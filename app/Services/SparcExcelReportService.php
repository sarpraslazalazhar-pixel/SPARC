<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use RuntimeException;
use SimpleXMLElement;
use ZipArchive;

class SparcExcelReportService
{
    /**
     * Style indices defined in buildStylesXml():
     * 0 = Default
     * 1 = Banner Title (Navy Fill, White 13pt Bold)
     * 2 = Banner Subtitle (Royal Blue Fill, Soft White 9.5pt Italic)
     * 3 = Section Header (Soft Blue Fill, Dark Navy 10.5pt Bold, Thin Border)
     * 4 = Table Header Left (Dark Slate Fill, White 10pt Bold, Thin Border)
     * 5 = Table Header Center (Dark Slate Fill, White 10pt Bold, Thin Border)
     * 6 = Table Header Right (Dark Slate Fill, White 10pt Bold, Thin Border)
     * 7 = Text Cell Left (White Fill, Thin Border)
     * 8 = Text Cell Left Zebra (Light Gray Fill, Thin Border)
     * 9 = Code/Badge Center Bold (White Fill, Thin Border)
     * 10 = Code/Badge Center Bold Zebra (Light Gray Fill, Thin Border)
     * 11 = Number Cell Right #,##0 (White Fill, Thin Border)
     * 12 = Number Cell Right Zebra #,##0 (Light Gray Fill, Thin Border)
     * 13 = Null/Muted Center "—" (White Fill, Muted Text, Thin Border)
     * 14 = Null/Muted Center Zebra "—" (Light Gray Fill, Muted Text, Thin Border)
     * 15 = Summary/Total Label Bold (Soft Slate Fill, Top/Bottom Border)
     * 16 = Summary/Total Number Bold #,##0 (Soft Slate Fill, Top/Bottom Border)
     * 17 = Summary/Total Accent Right Bold (Soft Slate Fill, Emerald Text, Top/Bottom Border)
     * 18 = Editable Input Number Cell #,##0 (Soft Emerald Tint Fill, Thin Border)
     * 19 = Editable Input Empty Cell (Soft Emerald Tint Fill, Center Muted, Thin Border)
     */
    public const FORMAT_GROUPS = [
        'reels' => ['reels', 'reels_shorts', 'video_reels', 'video_short', 'video'],
        'carousel' => ['carousel', 'carousel_feed'],
        'feed' => ['feed', 'single', 'single_image', 'single_feed'],
    ];

    /**
     * Filter publications by platform, format, and date range.
     *
     * @param  array<int, array<string, mixed>>  $publications
     * @return array<int, array<string, mixed>>
     */
    public static function filterPublications(
        array $publications,
        string $platform = 'all',
        string $format = 'all',
        ?string $dateFrom = null,
        ?string $dateTo = null
    ): array {
        return array_values(array_filter(
            $publications,
            static function (array $p) use ($platform, $format, $dateFrom, $dateTo): bool {
                if ($platform !== 'all' && strtolower((string) ($p['platform'] ?? '')) !== strtolower($platform)) {
                    return false;
                }

                if ($format !== 'all') {
                    $allowedFormats = self::FORMAT_GROUPS[$format] ?? [];
                    $pubFormat = strtolower((string) ($p['format'] ?? ''));
                    if (! in_array($pubFormat, $allowedFormats, true)) {
                        return false;
                    }
                }

                if (($dateFrom !== null && $dateFrom !== '') || ($dateTo !== null && $dateTo !== '')) {
                    $rawDate = (string) ($p['publishedActualAt'] ?: ($p['scheduledAt'] ?? ''));
                    $dateStr = strlen($rawDate) >= 10 ? substr($rawDate, 0, 10) : '';
                    if ($dateStr === '') {
                        return false;
                    }
                    if ($dateFrom !== null && $dateFrom !== '' && $dateStr < $dateFrom) {
                        return false;
                    }
                    if ($dateTo !== null && $dateTo !== '' && $dateStr > $dateTo) {
                        return false;
                    }
                }

                return true;
            }
        ));
    }

    /**
     * Generate a complete, multi-sheet styled .xlsx Performance Report workbook.
     *
     * @param  array{
     *   today: string,
     *   platformFilter?: string,
     *   formatFilter?: string,
     *   dateFrom?: string|null,
     *   dateTo?: string|null,
     *   activeLayer?: string,
     *   publications: array<int, array<string, mixed>>,
     *   contentItems: array<int, array<string, mixed>>,
     *   team: array<int, array<string, mixed>>,
     *   instagramSettings?: array<string, mixed>
     * }  $payload
     * @return string Raw binary contents of the .xlsx file
     */
    public function generateReportWorkbook(array $payload): string
    {
        $today = (string) ($payload['today'] ?? now()->toDateString());
        $platformFilter = (string) ($payload['platformFilter'] ?? 'all');
        $formatFilter = (string) ($payload['formatFilter'] ?? 'all');
        $dateFrom = isset($payload['dateFrom']) && $payload['dateFrom'] !== '' ? (string) $payload['dateFrom'] : null;
        $dateTo = isset($payload['dateTo']) && $payload['dateTo'] !== '' ? (string) $payload['dateTo'] : null;
        $activeLayer = (string) ($payload['activeLayer'] ?? 'content');
        $publications = $payload['publications'] ?? [];
        $contentItems = $payload['contentItems'] ?? [];
        $team = $payload['team'] ?? [];
        $ig = $payload['instagramSettings'] ?? [];

        $filteredPubs = self::filterPublications($publications, $platformFilter, $formatFilter, $dateFrom, $dateTo);

        $periodLabel = sprintf(
            'Periode: %s s/d %s  •  Format: %s',
            $dateFrom ?: 'Semua',
            $dateTo ?: 'Semua',
            $formatFilter === 'all' ? 'Semua Format' : strtoupper($formatFilter)
        );

        $sheets = [
            $this->buildContentPerformanceSheet($filteredPubs, $filteredPubs, $today, $platformFilter, $periodLabel),
            $this->buildCreatorDemographicsSheet($contentItems, $ig, $today),
            $this->buildMetaAdsSheet($ig, $today),
            $this->buildOperationalPipelineSheet($contentItems, $today),
            $this->buildTeamWorkloadSheet($team, $today),
        ];
        $activeTabMap = [
            'content' => 0,
            'creator' => 1,
            'ads' => 2,
            'operational' => 3,
            'team' => 4,
        ];
        $activeTabIndex = $activeTabMap[$activeLayer] ?? 0;

        return $this->packageWorkbook($sheets, $activeTabIndex);
    }

    /**
     * Generate a user-friendly, pre-populated .xlsx template for batch metric import.
     *
     * @param  array<int, array<string, mixed>>  $publications
     * @return string Raw binary contents of the .xlsx file
     */
    public function generateImportTemplateWorkbook(array $publications, string $today): string
    {
        $rows = [];
        $merges = ['A1:K1', 'A2:K2', 'A3:K3'];

        $rows[] = [
            'height' => 28,
            'cells' => $this->mergedRowCells(11, 'TEMPLATE IMPOR METRIK PERFORMA PUBLIKASI — SPARC HUMAS', 1),
        ];
        $rows[] = [
            'height' => 20,
            'cells' => $this->mergedRowCells(
                11,
                "Tanggal Unduh: {$today} • Isi angka pada kolom hijau (Reach s/d Clicks). Biarkan kosong atau '—' jika metrik belum diukur.",
                2
            ),
        ];
        $rows[] = [
            'height' => 22,
            'cells' => $this->mergedRowCells(
                11,
                'PETUNJUK: Jangan mengubah Kode Konten & Platform agar sistem mencocokkan slot publikasi secara otomatis.',
                3
            ),
        ];

        $headers = [
            ['value' => 'Kode Konten', 'style' => 5],
            ['value' => 'Judul Konten (Referensi)', 'style' => 4],
            ['value' => 'Platform', 'style' => 5],
            ['value' => 'Reach', 'style' => 6],
            ['value' => 'Impressions', 'style' => 6],
            ['value' => 'Views', 'style' => 6],
            ['value' => 'Likes', 'style' => 6],
            ['value' => 'Comments', 'style' => 6],
            ['value' => 'Shares', 'style' => 6],
            ['value' => 'Saves', 'style' => 6],
            ['value' => 'Clicks', 'style' => 6],
        ];
        $rows[] = ['height' => 24, 'cells' => $headers];

        if (count($publications) === 0) {
            $publications = [
                [
                    'contentId' => 'SPARC-2026-0001',
                    'title' => 'Contoh Konten Publikasi HUMAS',
                    'platform' => 'instagram',
                    'metrics' => [
                        'reach' => 28400,
                        'impressions' => 36900,
                        'views' => 45200,
                        'likes' => 2640,
                        'comments' => 148,
                        'shares' => 510,
                        'saves' => 920,
                        'clicks' => 310,
                    ],
                ],
            ];
        }

        foreach ($publications as $idx => $pub) {
            $m = is_array($pub['metrics'] ?? null) ? $pub['metrics'] : [];
            $isEven = $idx % 2 === 1;

            $rows[] = [
                'height' => 20,
                'cells' => [
                    ['value' => (string) ($pub['contentId'] ?? ''), 'style' => $isEven ? 10 : 9],
                    ['value' => (string) ($pub['title'] ?? ''), 'style' => $isEven ? 8 : 7],
                    ['value' => strtolower((string) ($pub['platform'] ?? 'instagram')), 'style' => $isEven ? 10 : 9],
                    $this->editableMetricCell($m['reach'] ?? null),
                    $this->editableMetricCell($m['impressions'] ?? null),
                    $this->editableMetricCell($m['views'] ?? null),
                    $this->editableMetricCell($m['likes'] ?? null),
                    $this->editableMetricCell($m['comments'] ?? null),
                    $this->editableMetricCell($m['shares'] ?? null),
                    $this->editableMetricCell($m['saves'] ?? null),
                    $this->editableMetricCell($m['clicks'] ?? null),
                ],
            ];
        }

        $guideRows = [
            [
                'height' => 28,
                'cells' => $this->mergedRowCells(3, 'PANDUAN PENGISIAN TEMPLATE EXCEL SPARC', 1),
            ],
            [
                'height' => 20,
                'cells' => $this->mergedRowCells(3, 'Format standar pelaporan H+3 distribusi konten lintas kanal HUMAS', 2),
            ],
            [
                'height' => 24,
                'cells' => [
                    ['value' => 'Nama Kolom', 'style' => 4],
                    ['value' => 'Sifat Kolom', 'style' => 5],
                    ['value' => 'Keterangan & Aturan Pengisian', 'style' => 4],
                ],
            ],
            [
                'height' => 20,
                'cells' => [
                    ['value' => 'Kode Konten', 'style' => 9],
                    ['value' => 'Wajib (Kunci)', 'style' => 9],
                    ['value' => 'Kode unik konten SPARC (contoh: SPARC-2026-0001). Digunakan untuk mencocokkan baris.', 'style' => 7],
                ],
            ],
            [
                'height' => 20,
                'cells' => [
                    ['value' => 'Judul Konten (Referensi)', 'style' => 10],
                    ['value' => 'Opsional (Info)', 'style' => 10],
                    ['value' => 'Memudahkan identifikasi judul konten saat mengisi di Excel. Tidak wajib diubah.', 'style' => 8],
                ],
            ],
            [
                'height' => 20,
                'cells' => [
                    ['value' => 'Platform', 'style' => 9],
                    ['value' => 'Wajib (Kunci)', 'style' => 9],
                    ['value' => 'Nama kanal distribusi: instagram, tiktok, youtube, website, atau whatsapp.', 'style' => 7],
                ],
            ],
            [
                'height' => 20,
                'cells' => [
                    ['value' => 'Reach s/d Clicks', 'style' => 10],
                    ['value' => 'Angka / Kosong', 'style' => 10],
                    ['value' => 'Isi angka bulat positif (>= 0). Kosongkan sel jika metrik belum diukur (tersimpan sebagai NULL / —, bukan 0).', 'style' => 8],
                ],
            ],
        ];

        $sheets = [
            [
                'name' => 'Template Impor Metrik',
                'widths' => [20, 38, 15, 14, 15, 14, 13, 13, 13, 13, 13],
                'rows' => $rows,
                'merges' => $merges,
            ],
            [
                'name' => 'Panduan Pengisian',
                'widths' => [26, 18, 72],
                'rows' => $guideRows,
                'merges' => ['A1:C1', 'A2:C2'],
            ],
        ];

        return $this->packageWorkbook($sheets, 0);
    }

    /**
     * Parse an uploaded .xlsx or .csv file into normalized metric row records.
     *
     * @return array<int, array{
     *   content_id: string,
     *   platform: string,
     *   reach: ?int,
     *   impressions: ?int,
     *   views: ?int,
     *   likes: ?int,
     *   comments: ?int,
     *   shares: ?int,
     *   saves: ?int,
     *   clicks: ?int
     * }>
     */
    public function parseUploadedFile(UploadedFile $file): array
    {
        $ext = strtolower((string) $file->getClientOriginalExtension());
        $realPath = $file->getRealPath();

        if ($realPath === false || ! is_file($realPath)) {
            throw new RuntimeException('Berkas unggahan tidak ditemukan.');
        }

        // Check if file is a ZIP / .xlsx container (magic bytes PK\x03\x04)
        $magic = (string) file_get_contents($realPath, false, null, 0, 4);
        if ($ext === 'xlsx' || str_starts_with($magic, "PK\x03\x04")) {
            $rawRows = $this->extractRowsFromXlsx($realPath);

            return $this->normalizeRawRowsToMetrics($rawRows);
        }

        $content = (string) file_get_contents($realPath);

        return $this->parseTabularText($content);
    }

    /**
     * Parse pasted Excel (TSV) or CSV (; or ,) text into normalized metric row records.
     *
     * @return array<int, array{
     *   content_id: string,
     *   platform: string,
     *   reach: ?int,
     *   impressions: ?int,
     *   views: ?int,
     *   likes: ?int,
     *   comments: ?int,
     *   shares: ?int,
     *   saves: ?int,
     *   clicks: ?int
     * }>
     */
    public function parseTabularText(string $text): array
    {
        $trimmed = trim(preg_replace('/^\xEF\xBB\xBF/', '', $text) ?? $text);
        if ($trimmed === '') {
            return [];
        }

        $lines = preg_split('/\r\n|\r|\n/', $trimmed) ?: [];
        $rawRows = [];

        foreach ($lines as $line) {
            if (trim($line) === '') {
                continue;
            }

            if (str_contains($line, "\t")) {
                $rawRows[] = array_map('trim', explode("\t", $line));
            } elseif (substr_count($line, ';') > substr_count($line, ',')) {
                $rawRows[] = array_map(
                    static fn (?string $v): string => trim((string) $v),
                    str_getcsv($line, ';')
                );
            } else {
                $rawRows[] = array_map(
                    static fn (?string $v): string => trim((string) $v),
                    str_getcsv($line, ',')
                );
            }
        }

        return $this->normalizeRawRowsToMetrics($rawRows);
    }

    /**
     * Sheet 1: Layer 1 Content Performance Report.
     *
     * @param  array<int, array<string, mixed>>  $filteredPubs
     * @param  array<int, array<string, mixed>>  $allPubs
     * @return array{name: string, widths: array<int, int>, rows: array<int, array<string, mixed>>, merges: array<int, string>}
     */
    protected function buildContentPerformanceSheet(
        array $filteredPubs,
        array $allPubs,
        string $today,
        string $platformFilter,
        string $periodLabel = ''
    ): array {
        $rows = [];
        $merges = ['A1:R1', 'A2:R2', 'A4:G4', 'I4:R4'];

        $filterLabel = $platformFilter === 'all' ? 'Semua Platform' : strtoupper($platformFilter);

        $rows[] = [
            'height' => 30,
            'cells' => $this->mergedRowCells(18, 'SPARC HUMAS — LAPORAN PERFORMA & DISTRIBUSI KONTEN', 1),
        ];
        $subTitle = "Tanggal Laporan: {$today}  •  Filter Kanal: {$filterLabel}";
        if ($periodLabel !== '') {
            $subTitle .= "  •  {$periodLabel}";
        }
        $subTitle .= "  •  Prinsip Data: Nilai belum diukur ditampilkan sebagai '—' (bukan angka 0)";

        $rows[] = [
            'height' => 20,
            'cells' => $this->mergedRowCells(18, $subTitle, 2),
        ];
        $rows[] = ['height' => 10, 'cells' => []];

        // Compute KPI Summary & Channel Breakdown
        $measured = array_values(array_filter(
            $filteredPubs,
            static fn (array $p): bool => isset($p['metrics']['reach']) && $p['metrics']['reach'] !== null
        ));
        $measuredCount = count($measured);
        $unmeasuredCount = count($filteredPubs) - $measuredCount;

        $totalReach = 0;
        $totalImpressions = 0;
        $totalViews = 0;
        $totalLikes = 0;
        $totalComments = 0;
        $totalShares = 0;
        $totalSaves = 0;
        $totalClicks = 0;

        foreach ($filteredPubs as $p) {
            $m = is_array($p['metrics'] ?? null) ? $p['metrics'] : [];
            $totalReach += (int) ($m['reach'] ?? 0);
            $totalImpressions += (int) ($m['impressions'] ?? 0);
            $totalViews += (int) ($m['views'] ?? 0);
            $totalLikes += (int) ($m['likes'] ?? 0);
            $totalComments += (int) ($m['comments'] ?? 0);
            $totalShares += (int) ($m['shares'] ?? 0);
            $totalSaves += (int) ($m['saves'] ?? 0);
            $totalClicks += (int) ($m['clicks'] ?? 0);
        }

        $totalInteractions = $totalLikes + $totalComments + $totalShares + $totalSaves;
        $avgEr = $totalReach > 0
            ? number_format(($totalInteractions / $totalReach) * 100, 1, ',', '.').'%'
            : '—';

        // Section Header Row 4: Executive KPI Summary (A-G) & Channel Breakdown (I-R)
        $secRow = array_fill(0, 18, ['value' => '', 'style' => 0]);
        for ($i = 0; $i < 7; $i++) {
            $secRow[$i] = ['value' => $i === 0 ? 'RINGKASAN EKSEKUTIF CAPAIAN (KPI)' : '', 'style' => 3];
        }
        for ($i = 8; $i < 18; $i++) {
            $secRow[$i] = ['value' => $i === 8 ? 'DISTRIBUSI JANGKAUAN (REACH) PER KANAL' : '', 'style' => 3];
        }
        $rows[] = ['height' => 22, 'cells' => $secRow];

        $channelMap = [];
        foreach ($allPubs as $p) {
            $plat = strtolower((string) ($p['platform'] ?? 'lainnya'));
            if (! isset($channelMap[$plat])) {
                $channelMap[$plat] = ['platform' => strtoupper($plat), 'posts' => 0, 'reach' => 0];
            }
            $channelMap[$plat]['posts']++;
            if (isset($p['metrics']['reach']) && $p['metrics']['reach'] !== null) {
                $channelMap[$plat]['reach'] += (int) $p['metrics']['reach'];
            }
        }
        $channelList = array_values($channelMap);
        usort($channelList, static fn (array $a, array $b): int => $b['reach'] <=> $a['reach']);

        $kpiItems = [
            ['label' => 'Total Slot Publikasi', 'val' => count($filteredPubs), 'isNum' => true],
            ['label' => 'Slot Terukur / Belum Diukur', 'val' => "{$measuredCount} Terukur / {$unmeasuredCount} Belum Diukur", 'isNum' => false],
            ['label' => 'Total Jangkauan (Reach)', 'val' => $measuredCount > 0 ? $totalReach : '—', 'isNum' => $measuredCount > 0],
            ['label' => 'Total Tayangan (Views)', 'val' => $measuredCount > 0 ? $totalViews : '—', 'isNum' => $measuredCount > 0],
            ['label' => 'Total Interaksi Publik', 'val' => $measuredCount > 0 ? $totalInteractions : '—', 'isNum' => $measuredCount > 0],
            ['label' => 'Rata-Rata Engagement Rate (ER)', 'val' => $avgEr, 'isNum' => false],
        ];

        $maxSummaryRows = max(count($kpiItems), count($channelList) + 1);
        for ($r = 0; $r < $maxSummaryRows; $r++) {
            $line = array_fill(0, 18, ['value' => '', 'style' => 0]);

            if (isset($kpiItems[$r])) {
                $k = $kpiItems[$r];
                $line[0] = ['value' => $k['label'], 'style' => 7];
                $line[1] = ['value' => '', 'style' => 7];
                $line[2] = ['value' => '', 'style' => 7];
                $line[3] = $k['isNum']
                    ? ['value' => (int) $k['val'], 'type' => 'n', 'style' => 11]
                    : ['value' => (string) $k['val'], 'style' => 9];
                $line[4] = ['value' => '', 'style' => 7];
                $line[5] = ['value' => '', 'style' => 7];
                $line[6] = ['value' => '', 'style' => 7];
                $excelRowIdx = count($rows) + 1;
                $merges[] = "A{$excelRowIdx}:C{$excelRowIdx}";
                $merges[] = "D{$excelRowIdx}:G{$excelRowIdx}";
            }

            if ($r === 0) {
                $line[8] = ['value' => 'Kanal Distribusi', 'style' => 5];
                $line[9] = ['value' => 'Jumlah Slot', 'style' => 6];
                $line[10] = ['value' => 'Total Reach', 'style' => 6];
                $line[11] = ['value' => 'Status', 'style' => 5];
            } elseif (isset($channelList[$r - 1])) {
                $ch = $channelList[$r - 1];
                $line[8] = ['value' => $ch['platform'], 'style' => 9];
                $line[9] = ['value' => (int) $ch['posts'], 'type' => 'n', 'style' => 11];
                $line[10] = $ch['reach'] > 0
                    ? ['value' => (int) $ch['reach'], 'type' => 'n', 'style' => 11]
                    : ['value' => '—', 'style' => 13];
                $line[11] = ['value' => $ch['reach'] > 0 ? 'Terukur' : 'Belum Diukur', 'style' => 7];
            }

            $rows[] = ['height' => 20, 'cells' => $line];
        }

        $rows[] = ['height' => 12, 'cells' => []];

        // Main Publication Performance Table Header
        $tableTitleRowIdx = count($rows) + 1;
        $merges[] = "A{$tableTitleRowIdx}:R{$tableTitleRowIdx}";
        $rows[] = [
            'height' => 24,
            'cells' => $this->mergedRowCells(18, 'RINCIAN CAPAIAN PER PUBLIKASI KONTEN (LAYER 1)', 3),
        ];

        $rows[] = [
            'height' => 26,
            'cells' => [
                ['value' => 'No', 'style' => 5],
                ['value' => 'Kode Konten', 'style' => 5],
                ['value' => 'Judul Konten', 'style' => 4],
                ['value' => 'Kanal', 'style' => 5],
                ['value' => 'PIC Publisher', 'style' => 4],
                ['value' => 'Jadwal Tayang', 'style' => 5],
                ['value' => 'Waktu Terbit Aktual', 'style' => 5],
                ['value' => 'Reach', 'style' => 6],
                ['value' => 'Impressions', 'style' => 6],
                ['value' => 'Views', 'style' => 6],
                ['value' => 'Likes', 'style' => 6],
                ['value' => 'Comments', 'style' => 6],
                ['value' => 'Shares', 'style' => 6],
                ['value' => 'Saves', 'style' => 6],
                ['value' => 'Clicks', 'style' => 6],
                ['value' => 'ER (%)', 'style' => 6],
                ['value' => 'Sumber Data', 'style' => 5],
                ['value' => 'Tautan Bukti Tayang', 'style' => 4],
            ],
        ];

        foreach ($filteredPubs as $idx => $pub) {
            $m = is_array($pub['metrics'] ?? null) ? $pMetrics = $pub['metrics'] : [];
            $isEven = $idx % 2 === 1;
            $textStyle = $isEven ? 8 : 7;
            $codeStyle = $isEven ? 10 : 9;

            $er = $this->computeErString($m);
            $source = isset($m['source']) && $m['source'] !== ''
                ? strtoupper((string) $m['source'])
                : 'BELUM DIUKUR';

            $rows[] = [
                'height' => 20,
                'cells' => [
                    ['value' => $idx + 1, 'type' => 'n', 'style' => $codeStyle],
                    ['value' => (string) ($pub['contentId'] ?? '—'), 'style' => $codeStyle],
                    ['value' => (string) ($pub['title'] ?? '—'), 'style' => $textStyle],
                    ['value' => strtoupper((string) ($pub['platform'] ?? '—')), 'style' => $codeStyle],
                    ['value' => (string) ($pub['picName'] ?? 'Publisher HUMAS'), 'style' => $textStyle],
                    ['value' => (string) ($pub['scheduledAt'] ?? '—'), 'style' => $codeStyle],
                    ['value' => (string) ($pub['publishedActualAt'] ?: 'Belum Tayang'), 'style' => $codeStyle],
                    $this->nullableMetricCell($m['reach'] ?? null, $isEven),
                    $this->nullableMetricCell($m['impressions'] ?? null, $isEven),
                    $this->nullableMetricCell($m['views'] ?? null, $isEven),
                    $this->nullableMetricCell($m['likes'] ?? null, $isEven),
                    $this->nullableMetricCell($m['comments'] ?? null, $isEven),
                    $this->nullableMetricCell($m['shares'] ?? null, $isEven),
                    $this->nullableMetricCell($m['saves'] ?? null, $isEven),
                    $this->nullableMetricCell($m['clicks'] ?? null, $isEven),
                    ['value' => $er, 'style' => $er === '—' ? ($isEven ? 14 : 13) : $codeStyle],
                    ['value' => $source, 'style' => $codeStyle],
                    ['value' => (string) ($pub['publishedUrl'] ?: '—'), 'style' => $textStyle],
                ],
            ];
        }

        // Total Summary Row
        $totalRowIdx = count($rows) + 1;
        $merges[] = "A{$totalRowIdx}:G{$totalRowIdx}";
        $rows[] = [
            'height' => 24,
            'cells' => [
                ['value' => 'TOTAL AKUMULASI / RATA-RATA CAPAIAN TERUKUR', 'style' => 15],
                ['value' => '', 'style' => 15],
                ['value' => '', 'style' => 15],
                ['value' => '', 'style' => 15],
                ['value' => '', 'style' => 15],
                ['value' => '', 'style' => 15],
                ['value' => '', 'style' => 15],
                $measuredCount > 0 ? ['value' => $totalReach, 'type' => 'n', 'style' => 16] : ['value' => '—', 'style' => 15],
                $measuredCount > 0 ? ['value' => $totalImpressions, 'type' => 'n', 'style' => 16] : ['value' => '—', 'style' => 15],
                $measuredCount > 0 ? ['value' => $totalViews, 'type' => 'n', 'style' => 16] : ['value' => '—', 'style' => 15],
                $measuredCount > 0 ? ['value' => $totalLikes, 'type' => 'n', 'style' => 16] : ['value' => '—', 'style' => 15],
                $measuredCount > 0 ? ['value' => $totalComments, 'type' => 'n', 'style' => 16] : ['value' => '—', 'style' => 15],
                $measuredCount > 0 ? ['value' => $totalShares, 'type' => 'n', 'style' => 16] : ['value' => '—', 'style' => 15],
                $measuredCount > 0 ? ['value' => $totalSaves, 'type' => 'n', 'style' => 16] : ['value' => '—', 'style' => 15],
                $measuredCount > 0 ? ['value' => $totalClicks, 'type' => 'n', 'style' => 16] : ['value' => '—', 'style' => 15],
                ['value' => $avgEr, 'style' => 17],
                ['value' => "{$measuredCount} Slot Terukur", 'style' => 15],
                ['value' => '', 'style' => 15],
            ],
        ];

        return [
            'name' => '1. Performa Konten',
            'widths' => [6, 19, 38, 14, 20, 18, 18, 14, 15, 14, 12, 12, 12, 12, 12, 12, 15, 34],
            'rows' => $rows,
            'merges' => $merges,
        ];
    }

    /**
     * Sheet 2: Creator Insights, Reels Retention & Audience Demographics.
     *
     * @param  array<int, array<string, mixed>>  $contentItems
     * @param  array<string, mixed>  $ig
     * @return array{name: string, widths: array<int, int>, rows: array<int, array<string, mixed>>, merges: array<int, string>}
     */
    protected function buildCreatorDemographicsSheet(array $contentItems, array $ig, string $today): array
    {
        $rows = [];
        $merges = ['A1:H1', 'A2:H2', 'A4:H4'];

        $username = (string) ($ig['username'] ?? 'humas_instansi');
        $followers = (int) ($ig['followersCount'] ?? 0);
        $mediaCount = (int) ($ig['mediaCount'] ?? 0);
        $insights = is_array($ig['accountInsights'] ?? null) ? $ig['accountInsights'] : [];
        $bestHours = is_array($ig['bestPostingHours'] ?? null) && count($ig['bestPostingHours']) > 0
            ? implode(', ', $ig['bestPostingHours'])
            : 'Belum tersedia';

        $rows[] = [
            'height' => 30,
            'cells' => $this->mergedRowCells(8, 'SPARC HUMAS — WAWASAN KREATOR, RETENSI REELS & DEMOGRAFI AUDIENS', 1),
        ];
        $rows[] = [
            'height' => 20,
            'cells' => $this->mergedRowCells(
                8,
                "Profil Resmi: @{$username}  •  Pengikut: {$followers}  •  Total Postingan: {$mediaCount}  •  Tanggal: {$today}",
                2
            ),
        ];
        $rows[] = ['height' => 10, 'cells' => []];

        // Account Insights Overview
        $rows[] = [
            'height' => 22,
            'cells' => $this->mergedRowCells(8, 'WAWASAN AKUN INSTAGRAM RESMI (28 HARI TERAKHIR)', 3),
        ];
        $rows[] = [
            'height' => 22,
            'cells' => [
                ['value' => 'Username Akun', 'style' => 5],
                ['value' => 'Total Pengikut', 'style' => 6],
                ['value' => 'Total Postingan', 'style' => 6],
                ['value' => 'Reach Akun (28H)', 'style' => 6],
                ['value' => 'Views Akun (28H)', 'style' => 6],
                ['value' => 'Akun Berinteraksi (28H)', 'style' => 6],
                ['value' => 'Rekomendasi Jam Tayang (WIB)', 'style' => 5],
                ['value' => 'Status Demografi Meta', 'style' => 5],
            ],
        ];

        $hasDemographics = (bool) ($ig['demographicsData']['has_data'] ?? false);
        $rows[] = [
            'height' => 22,
            'cells' => [
                ['value' => '@'.$username, 'style' => 9],
                ['value' => $followers, 'type' => 'n', 'style' => 11],
                ['value' => $mediaCount, 'type' => 'n', 'style' => 11],
                $this->nullableMetricCell($insights['reach_28d'] ?? null, false),
                $this->nullableMetricCell($insights['views_28d'] ?? null, false),
                $this->nullableMetricCell($insights['accounts_engaged_28d'] ?? null, false),
                ['value' => $bestHours, 'style' => 9],
                ['value' => $hasDemographics ? 'Terbuka (>= 100 Pengikut)' : "Belum Terbuka ({$followers}/100 Pengikut)", 'style' => 7],
            ],
        ];

        $rows[] = ['height' => 12, 'cells' => []];

        // Reels Retention Table
        $reelsHeaderRow = count($rows) + 1;
        $merges[] = "A{$reelsHeaderRow}:H{$reelsHeaderRow}";
        $rows[] = [
            'height' => 22,
            'cells' => $this->mergedRowCells(8, 'RETENSI VIDEO REELS (DROP-OFF & TOTAL WAKTU TONTON)', 3),
        ];
        $rows[] = [
            'height' => 24,
            'cells' => [
                ['value' => 'No', 'style' => 5],
                ['value' => 'Kode Konten', 'style' => 5],
                ['value' => 'Judul Konten Reels', 'style' => 4],
                ['value' => 'Tayangan (Views)', 'style' => 6],
                ['value' => 'Waktu Tonton Total', 'style' => 6],
                ['value' => 'Rata-rata Retensi', 'style' => 6],
                ['value' => 'Shares', 'style' => 6],
                ['value' => 'Saves', 'style' => 6],
            ],
        ];

        $reelsItems = array_values(array_filter(
            $contentItems,
            static fn (array $item): bool => in_array(
                strtolower((string) ($item['format'] ?? '')),
                ['reels', 'reels_shorts', 'video_reels', 'video_short', 'video'],
                true
            )
        ));

        if (count($reelsItems) === 0) {
            $emptyIdx = count($rows) + 1;
            $merges[] = "A{$emptyIdx}:H{$emptyIdx}";
            $rows[] = [
                'height' => 20,
                'cells' => $this->mergedRowCells(8, 'Belum ada konten Reels yang dipublikasikan.', 13),
            ];
        } else {
            foreach ($reelsItems as $idx => $item) {
                $isEven = $idx % 2 === 1;
                $watchTime = isset($item['reelsWatchTime']) && $item['reelsWatchTime'] > 0
                    ? round(((float) $item['reelsWatchTime']) / 60).' menit'
                    : '—';
                $avgWatch = isset($item['reelsAvgWatchTime']) && $item['reelsAvgWatchTime'] > 0
                    ? number_format((float) $item['reelsAvgWatchTime'], 1, ',', '.').' detik'
                    : '—';

                $rows[] = [
                    'height' => 20,
                    'cells' => [
                        ['value' => $idx + 1, 'type' => 'n', 'style' => $isEven ? 10 : 9],
                        ['value' => (string) ($item['contentId'] ?? '—'), 'style' => $isEven ? 10 : 9],
                        ['value' => (string) ($item['title'] ?? '—'), 'style' => $isEven ? 8 : 7],
                        ['value' => (int) ($item['views'] ?? 0), 'type' => 'n', 'style' => $isEven ? 12 : 11],
                        ['value' => $watchTime, 'style' => $watchTime === '—' ? ($isEven ? 14 : 13) : ($isEven ? 10 : 9)],
                        ['value' => $avgWatch, 'style' => $avgWatch === '—' ? ($isEven ? 14 : 13) : ($isEven ? 10 : 9)],
                        ['value' => (int) ($item['shares'] ?? 0), 'type' => 'n', 'style' => $isEven ? 12 : 11],
                        ['value' => (int) ($item['saves'] ?? 0), 'type' => 'n', 'style' => $isEven ? 12 : 11],
                    ],
                ];
            }
        }

        $rows[] = ['height' => 12, 'cells' => []];

        // Demographics Breakdown (Cities, Countries, Gender)
        $demoHeaderRow = count($rows) + 1;
        $merges[] = "A{$demoHeaderRow}:H{$demoHeaderRow}";
        $rows[] = [
            'height' => 22,
            'cells' => $this->mergedRowCells(8, 'DEMOGRAFI AUDIENS & STORY AKTIF (24 JAM TERAKHIR)', 3),
        ];

        $stories = is_array($ig['storiesData'] ?? null) ? $ig['storiesData'] : [];
        $rows[] = [
            'height' => 24,
            'cells' => [
                ['value' => 'No', 'style' => 5],
                ['value' => 'ID Story', 'style' => 5],
                ['value' => 'Caption Story (24 Jam)', 'style' => 4],
                ['value' => 'Penonton (Reach)', 'style' => 6],
                ['value' => 'Tayangan (Views)', 'style' => 6],
                ['value' => 'Balasan (Replies)', 'style' => 6],
                ['value' => 'Interaksi Navigasi', 'style' => 6],
                ['value' => 'Tautan Story', 'style' => 5],
            ],
        ];

        if (count($stories) === 0) {
            $emptyStIdx = count($rows) + 1;
            $merges[] = "A{$emptyStIdx}:H{$emptyStIdx}";
            $rows[] = [
                'height' => 20,
                'cells' => $this->mergedRowCells(8, 'Tidak ada story aktif yang terdeteksi dalam 24 jam terakhir.', 13),
            ];
        } else {
            foreach ($stories as $idx => $st) {
                $isEven = $idx % 2 === 1;
                $sm = is_array($st['metrics'] ?? null) ? $st['metrics'] : [];
                $views = (int) ($sm['views'] ?? $sm['impressions'] ?? 0);
                $nav = (int) ($sm['navigation'] ?? (((int) ($sm['taps_forward'] ?? 0)) + ((int) ($sm['taps_back'] ?? 0)) + ((int) ($sm['exits'] ?? 0))));
                $rows[] = [
                    'height' => 20,
                    'cells' => [
                        ['value' => $idx + 1, 'type' => 'n', 'style' => $isEven ? 10 : 9],
                        ['value' => (string) ($st['id'] ?? '—'), 'style' => $isEven ? 10 : 9],
                        ['value' => (string) ($st['caption'] ?: 'Instagram Story'), 'style' => $isEven ? 8 : 7],
                        ['value' => (int) ($sm['reach'] ?? 0), 'type' => 'n', 'style' => $isEven ? 12 : 11],
                        ['value' => $views, 'type' => 'n', 'style' => $isEven ? 12 : 11],
                        ['value' => (int) ($sm['replies'] ?? 0), 'type' => 'n', 'style' => $isEven ? 12 : 11],
                        ['value' => $nav, 'type' => 'n', 'style' => $isEven ? 12 : 11],
                        ['value' => (string) ($st['permalink'] ?: '—'), 'style' => $isEven ? 10 : 9],
                    ],
                ];
            }
        }

        return [
            'name' => '2. Wawasan & Demografi',
            'widths' => [8, 20, 42, 18, 22, 22, 26, 30],
            'rows' => $rows,
            'merges' => $merges,
        ];
    }

    /**
     * Sheet 3: Meta Ads Monitoring.
     *
     * @param  array<string, mixed>  $ig
     * @return array{name: string, widths: array<int, int>, rows: array<int, array<string, mixed>>, merges: array<int, string>}
     */
    protected function buildMetaAdsSheet(array $ig, string $today): array
    {
        $rows = [];
        $merges = ['A1:G1', 'A2:G2', 'A4:G4'];

        $adsData = is_array($ig['adsData'] ?? null) ? $ig['adsData'] : [];
        $activeAcc = is_array($adsData['active_account'] ?? null) ? $adsData['active_account'] : [];
        $summary = is_array($adsData['summary'] ?? null) ? $adsData['summary'] : [];
        $campaigns = is_array($adsData['campaigns'] ?? null) ? $adsData['campaigns'] : [];

        $accName = (string) ($activeAcc['name'] ?? 'Semua Akun Iklan');
        $accId = (string) ($activeAcc['account_id'] ?? 'act_default');
        $currency = (string) ($activeAcc['currency'] ?? 'IDR');

        $rows[] = [
            'height' => 30,
            'cells' => $this->mergedRowCells(7, 'SPARC HUMAS — MONITORING KAMPANYE & IKLAN BERBAYAR (META ADS)', 1),
        ];
        $rows[] = [
            'height' => 20,
            'cells' => $this->mergedRowCells(
                7,
                "Akun Iklan: {$accName} (ID: {$accId})  •  Mata Uang: {$currency}  •  Tanggal Laporan: {$today}",
                2
            ),
        ];
        $rows[] = ['height' => 10, 'cells' => []];

        $rows[] = [
            'height' => 22,
            'cells' => $this->mergedRowCells(7, 'RINGKASAN KINERJA IKLAN META (30 HARI TERAKHIR)', 3),
        ];
        $rows[] = [
            'height' => 24,
            'cells' => [
                ['value' => "Total Spend ({$currency})", 'style' => 6],
                ['value' => 'Total Impressions', 'style' => 6],
                ['value' => 'Total Reach', 'style' => 6],
                ['value' => 'Total Clicks', 'style' => 6],
                ['value' => 'Rata-rata CTR (%)', 'style' => 6],
                ['value' => 'Rata-rata CPC', 'style' => 6],
                ['value' => 'Rata-rata CPM', 'style' => 6],
            ],
        ];
        $rows[] = [
            'height' => 22,
            'cells' => [
                ['value' => (int) round((float) ($summary['total_spend'] ?? 0)), 'type' => 'n', 'style' => 11],
                ['value' => (int) ($summary['total_impressions'] ?? 0), 'type' => 'n', 'style' => 11],
                ['value' => (int) ($summary['total_reach'] ?? 0), 'type' => 'n', 'style' => 11],
                ['value' => (int) ($summary['total_clicks'] ?? 0), 'type' => 'n', 'style' => 11],
                ['value' => number_format((float) ($summary['avg_ctr'] ?? 0), 2, ',', '.').'%', 'style' => 9],
                ['value' => (int) round((float) ($summary['avg_cpc'] ?? 0)), 'type' => 'n', 'style' => 11],
                ['value' => (int) round((float) ($summary['avg_cpm'] ?? 0)), 'type' => 'n', 'style' => 11],
            ],
        ];

        $rows[] = ['height' => 12, 'cells' => []];

        $campHeaderRow = count($rows) + 1;
        $merges[] = "A{$campHeaderRow}:G{$campHeaderRow}";
        $rows[] = [
            'height' => 22,
            'cells' => $this->mergedRowCells(7, 'DAFTAR KAMPANYE IKLAN META ADS MANAGER', 3),
        ];
        $rows[] = [
            'height' => 24,
            'cells' => [
                ['value' => 'No', 'style' => 5],
                ['value' => 'ID Kampanye', 'style' => 5],
                ['value' => 'Nama Kampanye', 'style' => 4],
                ['value' => 'Status', 'style' => 5],
                ['value' => 'Tujuan (Objective)', 'style' => 4],
                ['value' => 'Anggaran Kampanye', 'style' => 6],
                ['value' => 'Sisa Anggaran', 'style' => 6],
            ],
        ];

        if (count($campaigns) === 0) {
            $emptyIdx = count($rows) + 1;
            $merges[] = "A{$emptyIdx}:G{$emptyIdx}";
            $rows[] = [
                'height' => 20,
                'cells' => $this->mergedRowCells(7, 'Belum ada data kampanye iklan Meta yang disinkronkan.', 13),
            ];
        } else {
            foreach ($campaigns as $idx => $c) {
                $isEven = $idx % 2 === 1;
                $budget = ! empty($c['daily_budget'])
                    ? (int) $c['daily_budget']
                    : (! empty($c['lifetime_budget']) ? (int) $c['lifetime_budget'] : null);
                $remaining = ! empty($c['budget_remaining']) ? (int) $c['budget_remaining'] : null;

                $rows[] = [
                    'height' => 20,
                    'cells' => [
                        ['value' => $idx + 1, 'type' => 'n', 'style' => $isEven ? 10 : 9],
                        ['value' => (string) ($c['id'] ?? '—'), 'style' => $isEven ? 10 : 9],
                        ['value' => (string) ($c['name'] ?? '—'), 'style' => $isEven ? 8 : 7],
                        ['value' => strtoupper((string) ($c['status'] ?? '—')), 'style' => $isEven ? 10 : 9],
                        ['value' => (string) ($c['objective'] ?? 'OUTCOME_ENGAGEMENT'), 'style' => $isEven ? 8 : 7],
                        $this->nullableMetricCell($budget, $isEven),
                        $this->nullableMetricCell($remaining, $isEven),
                    ],
                ];
            }
        }

        return [
            'name' => '3. Monitoring Iklan',
            'widths' => [18, 20, 38, 16, 24, 20, 20],
            'rows' => $rows,
            'merges' => $merges,
        ];
    }

    /**
     * Sheet 4: Operational Production Pipeline Report.
     *
     * @param  array<int, array<string, mixed>>  $contentItems
     * @return array{name: string, widths: array<int, int>, rows: array<int, array<string, mixed>>, merges: array<int, string>}
     */
    protected function buildOperationalPipelineSheet(array $contentItems, string $today): array
    {
        $rows = [];
        $merges = ['A1:I1', 'A2:I2', 'A4:D4', 'F4:I4'];

        $totalItems = count($contentItems);
        $overdueCount = 0;
        $stageCounts = [
            'inbox' => ['label' => 'Inbox / Tiket Masuk', 'count' => 0],
            'briefing' => ['label' => 'Perencanaan & Brief', 'count' => 0],
            'in_progress' => ['label' => 'Produksi Kreatif', 'count' => 0],
            'review_approval' => ['label' => 'Review & Approval', 'count' => 0],
            'ready_to_publish' => ['label' => 'Siap Publikasi', 'count' => 0],
            'published' => ['label' => 'Telah Terbit (Published)', 'count' => 0],
        ];
        $pillarCounts = [];

        foreach ($contentItems as $item) {
            $st = (string) ($item['status'] ?? 'inbox');
            if (! isset($stageCounts[$st])) {
                $st = 'inbox';
            }
            $stageCounts[$st]['count']++;

            $pillar = strtoupper((string) ($item['pillar'] ?? 'umum'));
            $pillarCounts[$pillar] = ($pillarCounts[$pillar] ?? 0) + 1;

            $deadline = (string) ($item['productionDeadline'] ?? '');
            if ($st !== 'published' && $deadline !== '' && $deadline < $today) {
                $overdueCount++;
            }
        }

        $onTimeRate = $totalItems > 0
            ? round((($totalItems - $overdueCount) / $totalItems) * 100)
            : 100;

        $rows[] = [
            'height' => 30,
            'cells' => $this->mergedRowCells(9, 'SPARC HUMAS — LAPORAN OPERASIONAL & PIPELINE PRODUKSI KONTEN', 1),
        ];
        $rows[] = [
            'height' => 20,
            'cells' => $this->mergedRowCells(
                9,
                "Total Konten: {$totalItems}  •  Ketepatan Jadwal Produksi (On-Time Rate): {$onTimeRate}%  •  Terlambat: {$overdueCount} Konten",
                2
            ),
        ];
        $rows[] = ['height' => 10, 'cells' => []];

        $secRow = array_fill(0, 9, ['value' => '', 'style' => 0]);
        for ($i = 0; $i < 4; $i++) {
            $secRow[$i] = ['value' => $i === 0 ? 'SEBARAN TAHAP ALUR KERJA (PIPELINE)' : '', 'style' => 3];
        }
        for ($i = 5; $i < 9; $i++) {
            $secRow[$i] = ['value' => $i === 5 ? 'PROPORSI PILAR KOMUNIKASI PUBLIK' : '', 'style' => 3];
        }
        $rows[] = ['height' => 22, 'cells' => $secRow];

        $hdrRow = array_fill(0, 9, ['value' => '', 'style' => 0]);
        $hdrRow[0] = ['value' => 'Tahap Pipeline', 'style' => 4];
        $hdrRow[1] = ['value' => 'Tahap Pipeline', 'style' => 4];
        $hdrRow[2] = ['value' => 'Jumlah Konten', 'style' => 6];
        $hdrRow[3] = ['value' => 'Proporsi (%)', 'style' => 6];
        $hdrRow[5] = ['value' => 'Pilar Komunikasi', 'style' => 4];
        $hdrRow[6] = ['value' => 'Pilar Komunikasi', 'style' => 4];
        $hdrRow[7] = ['value' => 'Jumlah Konten', 'style' => 6];
        $hdrRow[8] = ['value' => 'Proporsi (%)', 'style' => 6];
        $hdrIdx = count($rows) + 1;
        $merges[] = "A{$hdrIdx}:B{$hdrIdx}";
        $merges[] = "F{$hdrIdx}:G{$hdrIdx}";
        $rows[] = ['height' => 22, 'cells' => $hdrRow];

        $stageList = array_values($stageCounts);
        arsort($pillarCounts);
        $pillarList = [];
        foreach ($pillarCounts as $pKey => $pCnt) {
            $pillarList[] = ['pillar' => $pKey, 'count' => $pCnt];
        }

        $maxSummary = max(count($stageList), count($pillarList));
        for ($i = 0; $i < $maxSummary; $i++) {
            $line = array_fill(0, 9, ['value' => '', 'style' => 0]);
            $rIdx = count($rows) + 1;

            if (isset($stageList[$i])) {
                $st = $stageList[$i];
                $pct = $totalItems > 0 ? round(($st['count'] / $totalItems) * 100).'%' : '0%';
                $line[0] = ['value' => $st['label'], 'style' => 7];
                $line[1] = ['value' => '', 'style' => 7];
                $line[2] = ['value' => (int) $st['count'], 'type' => 'n', 'style' => 11];
                $line[3] = ['value' => $pct, 'style' => 9];
                $merges[] = "A{$rIdx}:B{$rIdx}";
            }

            if (isset($pillarList[$i])) {
                $pl = $pillarList[$i];
                $pct = $totalItems > 0 ? round(($pl['count'] / $totalItems) * 100).'%' : '0%';
                $line[5] = ['value' => $pl['pillar'], 'style' => 7];
                $line[6] = ['value' => '', 'style' => 7];
                $line[7] = ['value' => (int) $pl['count'], 'type' => 'n', 'style' => 11];
                $line[8] = ['value' => $pct, 'style' => 9];
                $merges[] = "F{$rIdx}:G{$rIdx}";
            }

            $rows[] = ['height' => 20, 'cells' => $line];
        }

        $rows[] = ['height' => 12, 'cells' => []];

        $listTitleIdx = count($rows) + 1;
        $merges[] = "A{$listTitleIdx}:I{$listTitleIdx}";
        $rows[] = [
            'height' => 22,
            'cells' => $this->mergedRowCells(9, 'DAFTAR KONTEN DALAM ALUR KERJA PRODUKSI', 3),
        ];
        $rows[] = [
            'height' => 24,
            'cells' => [
                ['value' => 'No', 'style' => 5],
                ['value' => 'Kode Konten', 'style' => 5],
                ['value' => 'Judul Konten', 'style' => 4],
                ['value' => 'Status Pipeline', 'style' => 5],
                ['value' => 'Pilar', 'style' => 5],
                ['value' => 'Kanal', 'style' => 5],
                ['value' => 'Format', 'style' => 5],
                ['value' => 'PIC Utama', 'style' => 4],
                ['value' => 'Tenggat Produksi', 'style' => 5],
            ],
        ];

        foreach ($contentItems as $idx => $item) {
            $isEven = $idx % 2 === 1;
            $stKey = (string) ($item['status'] ?? 'inbox');
            $stLabel = $stageCounts[$stKey]['label'] ?? strtoupper($stKey);

            $rows[] = [
                'height' => 20,
                'cells' => [
                    ['value' => $idx + 1, 'type' => 'n', 'style' => $isEven ? 10 : 9],
                    ['value' => (string) ($item['contentId'] ?? '—'), 'style' => $isEven ? 10 : 9],
                    ['value' => (string) ($item['title'] ?? '—'), 'style' => $isEven ? 8 : 7],
                    ['value' => $stLabel, 'style' => $isEven ? 10 : 9],
                    ['value' => strtoupper((string) ($item['pillar'] ?? '—')), 'style' => $isEven ? 10 : 9],
                    ['value' => strtoupper((string) ($item['platform'] ?? '—')), 'style' => $isEven ? 10 : 9],
                    ['value' => strtoupper((string) ($item['format'] ?? '—')), 'style' => $isEven ? 10 : 9],
                    ['value' => (string) ($item['picName'] ?? '—'), 'style' => $isEven ? 8 : 7],
                    ['value' => (string) ($item['productionDeadline'] ?: '—'), 'style' => $isEven ? 10 : 9],
                ],
            ];
        }

        return [
            'name' => '4. Operasional Produksi',
            'widths' => [6, 19, 38, 22, 16, 16, 16, 22, 18],
            'rows' => $rows,
            'merges' => $merges,
        ];
    }

    /**
     * Sheet 5: Team Performance & Workload Report.
     *
     * @param  array<int, array<string, mixed>>  $team
     * @return array{name: string, widths: array<int, int>, rows: array<int, array<string, mixed>>, merges: array<int, string>}
     */
    protected function buildTeamWorkloadSheet(array $team, string $today): array
    {
        $rows = [];
        $merges = ['A1:J1', 'A2:J2', 'A4:J4'];

        $rows[] = [
            'height' => 30,
            'cells' => $this->mergedRowCells(10, 'SPARC HUMAS — REKAP KINERJA & BEBAN KERJA TIM', 1),
        ];
        $rows[] = [
            'height' => 20,
            'cells' => $this->mergedRowCells(
                10,
                'Total Anggota Tim: '.count($team)." Personel  •  Tanggal Evaluasi: {$today}",
                2
            ),
        ];
        $rows[] = ['height' => 10, 'cells' => []];

        $rows[] = [
            'height' => 22,
            'cells' => $this->mergedRowCells(10, 'MATRIKS BEBAN KERJA & KAPASITAS MINGGUAN PERSONEL HUMAS', 3),
        ];
        $rows[] = [
            'height' => 24,
            'cells' => [
                ['value' => 'No', 'style' => 5],
                ['value' => 'Nama Anggota Tim', 'style' => 4],
                ['value' => 'Email Resmi', 'style' => 4],
                ['value' => 'Peran Utama', 'style' => 5],
                ['value' => 'Tugas Aktif', 'style' => 6],
                ['value' => 'Tenggat Minggu Ini', 'style' => 6],
                ['value' => 'Tugas Terlambat', 'style' => 6],
                ['value' => 'Jam Kerja Aktif (Jam)', 'style' => 6],
                ['value' => 'Kapasitas Mingguan (Jam)', 'style' => 6],
                ['value' => 'Utilisasi (%)', 'style' => 6],
            ],
        ];

        foreach ($team as $idx => $member) {
            $isEven = $idx % 2 === 1;
            $effort = (int) ($member['effortHours'] ?? 0);
            $capacity = max(1, (int) ($member['capacityHours'] ?? 30));
            $ratio = min(100, (int) round(($effort / $capacity) * 100));

            $rows[] = [
                'height' => 20,
                'cells' => [
                    ['value' => $idx + 1, 'type' => 'n', 'style' => $isEven ? 10 : 9],
                    ['value' => (string) ($member['name'] ?? '—'), 'style' => $isEven ? 8 : 7],
                    ['value' => (string) ($member['email'] ?? '—'), 'style' => $isEven ? 8 : 7],
                    ['value' => strtoupper((string) ($member['primaryRole'] ?? 'creator')), 'style' => $isEven ? 10 : 9],
                    ['value' => (int) ($member['activeTasks'] ?? 0), 'type' => 'n', 'style' => $isEven ? 12 : 11],
                    ['value' => (int) ($member['dueThisWeek'] ?? 0), 'type' => 'n', 'style' => $isEven ? 12 : 11],
                    ['value' => (int) ($member['overdueTasks'] ?? 0), 'type' => 'n', 'style' => $isEven ? 12 : 11],
                    ['value' => $effort, 'type' => 'n', 'style' => $isEven ? 12 : 11],
                    ['value' => $capacity, 'type' => 'n', 'style' => $isEven ? 12 : 11],
                    ['value' => "{$ratio}%", 'style' => $isEven ? 10 : 9],
                ],
            ];
        }

        return [
            'name' => '5. Kinerja & Beban Tim',
            'widths' => [6, 26, 32, 16, 15, 18, 16, 20, 22, 15],
            'rows' => $rows,
            'merges' => $merges,
        ];
    }

    /**
     * Package worksheet definitions into a valid OpenXML .xlsx binary string.
     *
     * @param  array<int, array{name: string, widths: array<int, int>, rows: array<int, array<string, mixed>>, merges: array<int, string>}>  $sheets
     */
    protected function packageWorkbook(array $sheets, int $activeTabIndex = 0): string
    {
        $tmpFile = tempnam(sys_get_temp_dir(), 'sparc_xlsx_');
        if ($tmpFile === false) {
            throw new RuntimeException('Gagal membuat berkas sementara untuk laporan Excel.');
        }

        $zip = new ZipArchive;
        if ($zip->open($tmpFile, ZipArchive::OVERWRITE | ZipArchive::CREATE) !== true) {
            @unlink($tmpFile);
            throw new RuntimeException('Gagal menginisialisasi arsip OpenXML Excel.');
        }

        $zip->addFromString('[Content_Types].xml', $this->buildContentTypesXml(count($sheets)));
        $zip->addFromString('_rels/.rels', $this->buildRootRelsXml());
        $zip->addFromString('xl/workbook.xml', $this->buildWorkbookXml($sheets, $activeTabIndex));
        $zip->addFromString('xl/_rels/workbook.xml.rels', $this->buildWorkbookRelsXml(count($sheets)));
        $zip->addFromString('xl/styles.xml', $this->buildStylesXml());

        foreach ($sheets as $idx => $sheet) {
            $sheetNum = $idx + 1;
            $zip->addFromString("xl/worksheets/sheet{$sheetNum}.xml", $this->buildWorksheetXml($sheet));
        }

        $zip->close();

        $binary = (string) file_get_contents($tmpFile);
        @unlink($tmpFile);

        return $binary;
    }

    protected function buildContentTypesXml(int $sheetCount): string
    {
        $overrides = '';
        for ($i = 1; $i <= $sheetCount; $i++) {
            $overrides .= '<Override PartName="/xl/worksheets/sheet'.$i.'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            .'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            .'<Default Extension="xml" ContentType="application/xml"/>'
            .'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            .'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            .$overrides
            .'</Types>';
    }

    protected function buildRootRelsXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            .'</Relationships>';
    }

    /**
     * @param  array<int, array{name: string, widths: array<int, int>, rows: array<int, array<string, mixed>>, merges: array<int, string>}>  $sheets
     */
    protected function buildWorkbookXml(array $sheets, int $activeTabIndex): string
    {
        $sheetNodes = '';
        foreach ($sheets as $idx => $sheet) {
            $sheetNum = $idx + 1;
            $safeName = mb_substr(
                str_replace(['\\', '/', '?', '*', ':', '[', ']'], '-', $sheet['name']),
                0,
                31
            );
            $sheetNodes .= '<sheet name="'.$this->xmlEscape($safeName).'" sheetId="'.$sheetNum.'" r:id="rId'.$sheetNum.'"/>';
        }

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            .'<bookViews><workbookView activeTab="'.$activeTabIndex.'"/></bookViews>'
            .'<sheets>'.$sheetNodes.'</sheets>'
            .'</workbook>';
    }

    protected function buildWorkbookRelsXml(int $sheetCount): string
    {
        $rels = '';
        for ($i = 1; $i <= $sheetCount; $i++) {
            $rels .= '<Relationship Id="rId'.$i.'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'.$i.'.xml"/>';
        }
        $styleRelId = $sheetCount + 1;
        $rels .= '<Relationship Id="rId'.$styleRelId.'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            .$rels
            .'</Relationships>';
    }

    protected function buildStylesXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            .'<fonts count="8">'
            // 0: Default Body 10pt
            .'<font><sz val="10"/><color rgb="FF0F172A"/><name val="Segoe UI"/></font>'
            // 1: Banner Title 13pt Bold White
            .'<font><b/><sz val="13"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>'
            // 2: Banner Subtitle 9.5pt Italic Soft White
            .'<font><i/><sz val="9.5"/><color rgb="FFE2E8F0"/><name val="Segoe UI"/></font>'
            // 3: Section Title 10.5pt Bold Navy
            .'<font><b/><sz val="10.5"/><color rgb="FF1E3A8A"/><name val="Segoe UI"/></font>'
            // 4: Table Header 10pt Bold White
            .'<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>'
            // 5: Bold Data / Code 10pt
            .'<font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Segoe UI"/></font>'
            // 6: Muted / Null ("—") 10pt
            .'<font><sz val="10"/><color rgb="FF94A3B8"/><name val="Segoe UI"/></font>'
            // 7: Accent Emerald Bold 10pt
            .'<font><b/><sz val="10"/><color rgb="FF047857"/><name val="Segoe UI"/></font>'
            .'</fonts>'
            .'<fills count="9">'
            // 0 & 1: Required standard Excel fills
            .'<fill><patternFill patternType="none"/></fill>'
            .'<fill><patternFill patternType="gray125"/></fill>'
            // 2: Banner Deep Navy (#1E3A8A)
            .'<fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/><bgColor indexed="64"/></patternFill></fill>'
            // 3: Banner Royal Blue (#1D4ED8)
            .'<fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/><bgColor indexed="64"/></patternFill></fill>'
            // 4: Section Header Soft Blue (#DBEAFE)
            .'<fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/><bgColor indexed="64"/></patternFill></fill>'
            // 5: Table Header Dark Slate (#0F172A)
            .'<fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/><bgColor indexed="64"/></patternFill></fill>'
            // 6: Zebra Even Row (#F8FAFC)
            .'<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>'
            // 7: Summary / Total Row (#E2E8F0)
            .'<fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>'
            // 8: Editable Template Cell (#ECFDF5)
            .'<fill><patternFill patternType="solid"><fgColor rgb="FFECFDF5"/><bgColor indexed="64"/></patternFill></fill>'
            .'</fills>'
            .'<borders count="3">'
            // 0: None
            .'<border><left/><right/><top/><bottom/><diagonal/></border>'
            // 1: Thin Grid Border (#CBD5E1)
            .'<border>'
            .'<left style="thin"><color rgb="FFCBD5E1"/></left>'
            .'<right style="thin"><color rgb="FFCBD5E1"/></right>'
            .'<top style="thin"><color rgb="FFCBD5E1"/></top>'
            .'<bottom style="thin"><color rgb="FFCBD5E1"/></bottom>'
            .'<diagonal/>'
            .'</border>'
            // 2: Summary Top/Bottom Medium Border (#1E3A8A)
            .'<border>'
            .'<left style="thin"><color rgb="FF94A3B8"/></left>'
            .'<right style="thin"><color rgb="FF94A3B8"/></right>'
            .'<top style="medium"><color rgb="FF1E3A8A"/></top>'
            .'<bottom style="double"><color rgb="FF1E3A8A"/></bottom>'
            .'<diagonal/>'
            .'</border>'
            .'</borders>'
            .'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            .'<cellXfs count="20">'
            // 0: Default
            .'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            // 1: Banner Title
            .'<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>'
            // 2: Banner Subtitle
            .'<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>'
            // 3: Section Header
            .'<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>'
            // 4: Table Header Left
            .'<xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>'
            // 5: Table Header Center
            .'<xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
            // 6: Table Header Right
            .'<xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf>'
            // 7: Data Text Left
            .'<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'
            // 8: Data Text Left Zebra
            .'<xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'
            // 9: Data Code Center Bold
            .'<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            // 10: Data Code Center Bold Zebra
            .'<xf numFmtId="0" fontId="5" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            // 11: Data Number Right #,##0
            .'<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>'
            // 12: Data Number Right Zebra #,##0
            .'<xf numFmtId="3" fontId="0" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>'
            // 13: Data Null/Muted Center
            .'<xf numFmtId="0" fontId="6" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            // 14: Data Null/Muted Center Zebra
            .'<xf numFmtId="0" fontId="6" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            // 15: Summary Label
            .'<xf numFmtId="0" fontId="5" fillId="7" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'
            // 16: Summary Number #,##0
            .'<xf numFmtId="3" fontId="5" fillId="7" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>'
            // 17: Summary Accent Emerald
            .'<xf numFmtId="0" fontId="7" fillId="7" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>'
            // 18: Editable Number Input Cell (#ECFDF5)
            .'<xf numFmtId="3" fontId="5" fillId="8" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>'
            // 19: Editable Empty Input Cell (#ECFDF5)
            .'<xf numFmtId="0" fontId="6" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>'
            .'</cellXfs>'
            .'</styleSheet>';
    }

    /**
     * @param  array{name: string, widths: array<int, int>, rows: array<int, array<string, mixed>>, merges: array<int, string>}  $sheet
     */
    protected function buildWorksheetXml(array $sheet): string
    {
        $colsXml = '<cols>';
        foreach ($sheet['widths'] as $idx => $width) {
            $colNum = $idx + 1;
            $colsXml .= '<col min="'.$colNum.'" max="'.$colNum.'" width="'.$width.'" customWidth="1"/>';
        }
        $colsXml .= '</cols>';

        $sheetDataXml = '<sheetData>';
        foreach ($sheet['rows'] as $rIdx => $rowDef) {
            $rowNum = $rIdx + 1;
            $heightAttr = isset($rowDef['height'])
                ? ' ht="'.(int) $rowDef['height'].'" customHeight="1"'
                : '';

            $cells = $rowDef['cells'] ?? [];
            if (count($cells) === 0) {
                $sheetDataXml .= '<row r="'.$rowNum.'"'.$heightAttr.'/>';

                continue;
            }

            $sheetDataXml .= '<row r="'.$rowNum.'"'.$heightAttr.'>';
            foreach ($cells as $cIdx => $cell) {
                $colRef = $this->columnIndexToLetter($cIdx).$rowNum;
                $style = (int) ($cell['style'] ?? 0);
                $type = (string) ($cell['type'] ?? 's');
                $val = $cell['value'] ?? '';

                if ($type === 'n' && is_numeric($val)) {
                    $sheetDataXml .= '<c r="'.$colRef.'" s="'.$style.'"><v>'.$val.'</v></c>';
                } else {
                    $strVal = $this->xmlEscape((string) $val);
                    $sheetDataXml .= '<c r="'.$colRef.'" s="'.$style.'" t="inlineStr"><is><t xml:space="preserve">'.$strVal.'</t></is></c>';
                }
            }
            $sheetDataXml .= '</row>';
        }
        $sheetDataXml .= '</sheetData>';

        $mergesXml = '';
        if (! empty($sheet['merges'])) {
            $mergesXml = '<mergeCells count="'.count($sheet['merges']).'">';
            foreach ($sheet['merges'] as $ref) {
                $mergesXml .= '<mergeCell ref="'.$ref.'"/>';
            }
            $mergesXml .= '</mergeCells>';
        }

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            .'<sheetViews><sheetView workbookViewId="0" showGridLines="1"/></sheetViews>'
            .$colsXml
            .$sheetDataXml
            .$mergesXml
            .'<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>'
            .'</worksheet>';
    }

    /**
     * Extract 2D array of string values from the first worksheet of an .xlsx file.
     *
     * @return array<int, array<int, string>>
     */
    protected function extractRowsFromXlsx(string $filePath): array
    {
        $zip = new ZipArchive;
        if ($zip->open($filePath) !== true) {
            throw new RuntimeException('Berkas Excel (.xlsx) tidak valid atau rusak.');
        }

        // Load sharedStrings.xml if present
        $sharedStrings = [];
        $sharedXmlStr = $zip->getFromName('xl/sharedStrings.xml');
        if (is_string($sharedXmlStr) && $sharedXmlStr !== '') {
            $sx = @simplexml_load_string($sharedXmlStr);
            if ($sx instanceof SimpleXMLElement) {
                $sx->registerXPathNamespace('s', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
                $siNodes = $sx->xpath('//s:si') ?: [];
                foreach ($siNodes as $si) {
                    $si->registerXPathNamespace('s', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
                    $tNodes = $si->xpath('.//s:t') ?: [];
                    $textParts = [];
                    foreach ($tNodes as $tNode) {
                        $textParts[] = (string) $tNode;
                    }
                    $sharedStrings[] = implode('', $textParts);
                }
            }
        }

        // Read sheet1.xml
        $sheetXmlStr = $zip->getFromName('xl/worksheets/sheet1.xml');
        $zip->close();

        if (! is_string($sheetXmlStr) || $sheetXmlStr === '') {
            throw new RuntimeException('Lembar kerja utama (sheet1) tidak ditemukan di dalam berkas Excel.');
        }

        $sheetXml = @simplexml_load_string($sheetXmlStr);
        if (! ($sheetXml instanceof SimpleXMLElement)) {
            throw new RuntimeException('Struktur XML lembar kerja Excel tidak dapat dibaca.');
        }

        $sheetXml->registerXPathNamespace('s', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
        $rowNodes = $sheetXml->xpath('//s:sheetData/s:row') ?: [];

        $rows = [];
        foreach ($rowNodes as $rowNode) {
            $rowNode->registerXPathNamespace('s', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
            $cNodes = $rowNode->xpath('./s:c') ?: [];
            if (count($cNodes) === 0) {
                continue;
            }

            $rowArr = [];
            $maxCol = 0;

            foreach ($cNodes as $cNode) {
                $cNode->registerXPathNamespace('s', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
                $cellRef = (string) ($cNode['r'] ?? '');
                $cellType = (string) ($cNode['t'] ?? '');

                $colIdx = $cellRef !== ''
                    ? $this->cellReferenceToColumnIndex($cellRef)
                    : count($rowArr);
                $maxCol = max($maxCol, $colIdx);

                $val = '';
                if ($cellType === 's') {
                    $sIdx = (int) ($cNode->v ?? 0);
                    $val = $sharedStrings[$sIdx] ?? '';
                } elseif ($cellType === 'inlineStr') {
                    $tNodes = $cNode->xpath('.//s:t') ?: [];
                    $parts = [];
                    foreach ($tNodes as $t) {
                        $parts[] = (string) $t;
                    }
                    $val = implode('', $parts);
                } else {
                    $val = isset($cNode->v) ? (string) $cNode->v : '';
                }

                $rowArr[$colIdx] = trim($val);
            }

            // Fill sparse gaps with empty string up to maxCol
            $normalizedRow = [];
            for ($c = 0; $c <= $maxCol; $c++) {
                $normalizedRow[$c] = $rowArr[$c] ?? '';
            }
            $rows[] = $normalizedRow;
        }

        return $rows;
    }

    /**
     * Normalize raw 2D rows (from Excel or CSV/TSV) into metric arrays by auto-detecting headers or column positions.
     *
     * @param  array<int, array<int, string>>  $rawRows
     * @return array<int, array{
     *   content_id: string,
     *   platform: string,
     *   reach: ?int,
     *   impressions: ?int,
     *   views: ?int,
     *   likes: ?int,
     *   comments: ?int,
     *   shares: ?int,
     *   saves: ?int,
     *   clicks: ?int
     * }>
     */
    protected function normalizeRawRowsToMetrics(array $rawRows): array
    {
        $colMap = null;
        $results = [];

        foreach ($rawRows as $row) {
            $nonEmpty = array_filter($row, static fn (string $v): bool => trim($v) !== '');
            if (count($nonEmpty) < 2) {
                continue;
            }

            // Detect header row
            $lowerRow = array_map(static fn (string $v): string => strtolower(trim($v)), $row);
            $hasContentIdHeader = false;
            foreach ($lowerRow as $cellText) {
                if (in_array($cellText, ['content_id', 'kode konten', 'kode konten (content_id)', 'kode & konten'], true)) {
                    $hasContentIdHeader = true;
                    break;
                }
            }

            if ($hasContentIdHeader) {
                $colMap = $this->buildColumnMapFromHeader($lowerRow);

                continue;
            }

            // If we have a detected header map, extract via map
            if ($colMap !== null) {
                $cId = trim((string) ($row[$colMap['content_id']] ?? ''));
                $plat = strtolower(trim((string) ($row[$colMap['platform']] ?? '')));
                if ($cId === '' || $plat === '' || str_starts_with(strtolower($cId), 'total ')) {
                    continue;
                }

                $results[] = [
                    'content_id' => $cId,
                    'platform' => $plat,
                    'reach' => $this->toNullableInt($row[$colMap['reach']] ?? null),
                    'impressions' => $this->toNullableInt($colMap['impressions'] !== null ? ($row[$colMap['impressions']] ?? null) : null),
                    'views' => $this->toNullableInt($row[$colMap['views']] ?? null),
                    'likes' => $this->toNullableInt($row[$colMap['likes']] ?? null),
                    'comments' => $this->toNullableInt($colMap['comments'] !== null ? ($row[$colMap['comments']] ?? null) : null),
                    'shares' => $this->toNullableInt($row[$colMap['shares']] ?? null),
                    'saves' => $this->toNullableInt($row[$colMap['saves']] ?? null),
                    'clicks' => $this->toNullableInt($colMap['clicks'] !== null ? ($row[$colMap['clicks']] ?? null) : null),
                ];

                continue;
            }

            // Positional fallback when user pastes/imports rows without headers
            // Support 10-col: content_id, platform, reach, impressions, views, likes, comments, shares, saves, clicks
            // Or 11-col template: content_id, title, platform, reach, impressions, views, likes, comments, shares, saves, clicks
            if (count($row) >= 11 && in_array(strtolower(trim($row[2])), ['instagram', 'tiktok', 'youtube', 'website', 'whatsapp'], true)) {
                $results[] = [
                    'content_id' => trim($row[0]),
                    'platform' => strtolower(trim($row[2])),
                    'reach' => $this->toNullableInt($row[3] ?? null),
                    'impressions' => $this->toNullableInt($row[4] ?? null),
                    'views' => $this->toNullableInt($row[5] ?? null),
                    'likes' => $this->toNullableInt($row[6] ?? null),
                    'comments' => $this->toNullableInt($row[7] ?? null),
                    'shares' => $this->toNullableInt($row[8] ?? null),
                    'saves' => $this->toNullableInt($row[9] ?? null),
                    'clicks' => $this->toNullableInt($row[10] ?? null),
                ];
            } elseif (count($row) >= 10) {
                $results[] = [
                    'content_id' => trim($row[0]),
                    'platform' => strtolower(trim($row[1])),
                    'reach' => $this->toNullableInt($row[2] ?? null),
                    'impressions' => $this->toNullableInt($row[3] ?? null),
                    'views' => $this->toNullableInt($row[4] ?? null),
                    'likes' => $this->toNullableInt($row[5] ?? null),
                    'comments' => $this->toNullableInt($row[6] ?? null),
                    'shares' => $this->toNullableInt($row[7] ?? null),
                    'saves' => $this->toNullableInt($row[8] ?? null),
                    'clicks' => $this->toNullableInt($row[9] ?? null),
                ];
            }
        }

        return $results;
    }

    /**
     * @param  array<int, string>  $lowerHeader
     * @return array{
     *   content_id: int,
     *   platform: int,
     *   reach: int,
     *   impressions: ?int,
     *   views: int,
     *   likes: int,
     *   comments: ?int,
     *   shares: int,
     *   saves: int,
     *   clicks: ?int
     * }
     */
    protected function buildColumnMapFromHeader(array $lowerHeader): array
    {
        $findCol = static function (array $candidates, int $default) use ($lowerHeader): int {
            foreach ($lowerHeader as $idx => $h) {
                if (in_array($h, $candidates, true)) {
                    return $idx;
                }
            }

            return $default;
        };

        $findNullableCol = static function (array $candidates) use ($lowerHeader): ?int {
            foreach ($lowerHeader as $idx => $h) {
                if (in_array($h, $candidates, true)) {
                    return $idx;
                }
            }

            return null;
        };

        return [
            'content_id' => $findCol(['content_id', 'kode konten', 'kode konten (content_id)', 'kode & konten'], 0),
            'platform' => $findCol(['platform', 'kanal', 'channel'], 2),
            'reach' => $findCol(['reach', 'jangkauan'], 3),
            'impressions' => $findNullableCol(['impressions', 'impresi']),
            'views' => $findCol(['views', 'tayangan', 'tayangan (views)'], 5),
            'likes' => $findCol(['likes', 'suka'], 6),
            'comments' => $findNullableCol(['comments', 'komentar']),
            'shares' => $findCol(['shares', 'bagikan'], 8),
            'saves' => $findCol(['saves', 'simpan'], 9),
            'clicks' => $findNullableCol(['clicks', 'klik']),
        ];
    }

    protected function toNullableInt(?string $val): ?int
    {
        if ($val === null) {
            return null;
        }

        $clean = trim($val);
        if ($clean === '' || in_array(strtolower($clean), ['—', '-', 'null', 'n/a', 'belum diukur'], true)) {
            return null;
        }

        // Strip thousand separators (e.g. "28.400" or "28,400") when followed by 3 digits
        $normalized = preg_replace('/[.,](?=\d{3}\b)/', '', $clean) ?? $clean;
        if (! is_numeric($normalized)) {
            return null;
        }

        return max(0, (int) round((float) $normalized));
    }

    /**
     * @return array{value: int|string, type?: string, style: int}
     */
    protected function nullableMetricCell(mixed $value, bool $isEven): array
    {
        if ($value === null || $value === '') {
            return [
                'value' => '—',
                'style' => $isEven ? 14 : 13,
            ];
        }

        return [
            'value' => (int) $value,
            'type' => 'n',
            'style' => $isEven ? 12 : 11,
        ];
    }

    /**
     * @return array{value: int|string, type?: string, style: int}
     */
    protected function editableMetricCell(mixed $value): array
    {
        if ($value === null || $value === '') {
            return [
                'value' => '',
                'style' => 19,
            ];
        }

        return [
            'value' => (int) $value,
            'type' => 'n',
            'style' => 18,
        ];
    }

    /**
     * @param  array<string, mixed>  $metrics
     */
    protected function computeErString(array $metrics): string
    {
        $reach = isset($metrics['reach']) && $metrics['reach'] !== null ? (int) $metrics['reach'] : 0;
        if ($reach <= 0) {
            return '—';
        }

        $interactions = (int) ($metrics['likes'] ?? 0)
            + (int) ($metrics['comments'] ?? 0)
            + (int) ($metrics['shares'] ?? 0)
            + (int) ($metrics['saves'] ?? 0);

        return number_format(($interactions / $reach) * 100, 1, ',', '.').'%';
    }

    /**
     * @return array<int, array{value: string, style: int}>
     */
    protected function mergedRowCells(int $colCount, string $text, int $style): array
    {
        $cells = [];
        for ($i = 0; $i < $colCount; $i++) {
            $cells[] = [
                'value' => $i === 0 ? $text : '',
                'style' => $style,
            ];
        }

        return $cells;
    }

    protected function columnIndexToLetter(int $index): string
    {
        $letter = '';
        $n = $index;
        while ($n >= 0) {
            $letter = chr(($n % 26) + 65).$letter;
            $n = intdiv($n, 26) - 1;
        }

        return $letter;
    }

    protected function cellReferenceToColumnIndex(string $cellRef): int
    {
        if (! preg_match('/^([A-Z]+)/i', $cellRef, $matches)) {
            return 0;
        }

        $letters = strtoupper($matches[1]);
        $index = 0;
        $len = strlen($letters);
        for ($i = 0; $i < $len; $i++) {
            $index = $index * 26 + (ord($letters[$i]) - 64);
        }

        return max(0, $index - 1);
    }

    protected function xmlEscape(string $value): string
    {
        $clean = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $value) ?? $value;

        return htmlspecialchars($clean, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }
}
