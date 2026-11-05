<?php

use App\Models\InstagramSchedule;
use App\Services\InstagramGraphService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Facades\Schema;

Artisan::command('inspire', function (): void {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('instagram:sync-metrics', function (InstagramGraphService $service): int {
    if (! $service->isConfigured()) {
        $this->warn('Instagram Graph API belum dikonfigurasi, sinkronisasi dilewati.');

        return 0;
    }

    $result = $service->syncAllContentMetrics();

    if (! ($result['success'] ?? false)) {
        $this->error($result['error'] ?? 'Terjadi kesalahan saat sinkronisasi metrik Instagram.');

        return 1;
    }

    $service->syncRecentComments(25);
    $service->syncAccountProfileAndInsights();

    $this->info(sprintf(
        'Berhasil menyinkronkan %d konten Instagram (%d postingan baru diimpor).',
        $result['synced_count'],
        $result['imported_count'] ?? 0
    ));

    return 0;
})->purpose('Sinkronisasi metrik performa, komentar publik, dan Account Insights Instagram');

Artisan::command('instagram:process-scheduled', function (InstagramGraphService $service): int {
    if (! Schema::hasTable('instagram_schedules')) {
        return 0;
    }

    $dueSchedules = InstagramSchedule::query()
        ->whereIn('status', ['queued', 'processing'])
        ->where(function ($q): void {
            $q->whereNull('scheduled_at')
                ->orWhere('scheduled_at', '<=', now());
        })
        ->orderBy('scheduled_at')
        ->limit(15)
        ->get();

    if ($dueSchedules->isEmpty()) {
        $this->info('Tidak ada jadwal Auto-Publish Instagram yang jatuh tempo.');

        return 0;
    }

    if (! $service->isConfigured()) {
        $this->warn('Instagram Graph API belum dikonfigurasi.');

        return 1;
    }

    $publishedCount = 0;
    $processingCount = 0;
    $failedCount = 0;

    foreach ($dueSchedules as $schedule) {
        $res = $service->publishSchedule($schedule);
        $status = $res['status'] ?? 'failed';
        if ($status === 'published') {
            $publishedCount++;
        } elseif ($status === 'processing') {
            $processingCount++;
        } else {
            $failedCount++;
        }
    }

    $this->info(sprintf(
        'Auto-Publish Instagram: %d tayang, %d sedang diproses Meta, %d gagal.',
        $publishedCount,
        $processingCount,
        $failedCount
    ));

    return 0;
})->purpose('Eksekusi otomatis antrean jadwal publikasi Instagram yang jatuh tempo');

Artisan::command('instagram:refresh-token', function (InstagramGraphService $service): int {
    $res = $service->refreshTokenIfExpiring(14, false);

    if (! ($res['success'] ?? false)) {
        $this->warn($res['error'] ?? 'Token belum dapat diperbarui.');

        return 0;
    }

    if ($res['refreshed'] ?? false) {
        $service->inspectTokenPermissions();
        $this->info('Long-Lived Token Instagram berhasil diperpanjang otomatis 60 hari ke depan.');
    } else {
        $this->info(sprintf('Token Instagram masih sehat (%s hari tersisa).', $res['days_remaining'] ?? '—'));
    }

    return 0;
})->purpose('Perpanjangan otomatis Long-Lived Token Instagram sebelum kedaluwarsa');

Schedule::command('instagram:process-scheduled')->everyMinute()->withoutOverlapping();
Schedule::command('instagram:sync-metrics')->everyThirtyMinutes()->withoutOverlapping();
Schedule::command('instagram:refresh-token')->dailyAt('02:00')->withoutOverlapping();
