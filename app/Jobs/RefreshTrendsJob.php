<?php

namespace App\Jobs;

use App\Services\TrendFinderService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class RefreshTrendsJob implements ShouldQueue
{
    use Queueable;

    /**
     * The number of seconds the job can run before timing out.
     *
     * @var int
     */
    public $timeout = 120;

    /**
     * The number of times the job may be attempted.
     *
     * @var int
     */
    public $tries = 2;

    public function handle(TrendFinderService $service): void
    {
        if (! $service->isConfigured()) {
            return;
        }

        $service->fetchAndStore();
    }
}
