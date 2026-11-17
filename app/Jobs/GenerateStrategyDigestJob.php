<?php

namespace App\Jobs;

use App\Services\ContentAnalyzerService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Generates the monthly strategy digest in the background so the dashboard never
 * blocks on a model call.
 */
class GenerateStrategyDigestJob implements ShouldQueue
{
    use Queueable;

    /**
     * The number of seconds the job can run before timing out.
     *
     * @var int
     */
    public $timeout = 180;

    /**
     * The number of times the job may be attempted.
     *
     * @var int
     */
    public $tries = 2;

    public function handle(ContentAnalyzerService $analyzer): void
    {
        if (! $analyzer->isConfigured()) {
            return;
        }

        try {
            $analyzer->digest();
        } catch (Throwable $exception) {
            // No published metrics yet is an expected state, not a job failure.
            report($exception);
        }
    }
}
