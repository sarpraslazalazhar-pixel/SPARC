<?php

namespace App\Http\Controllers;

use App\Jobs\RefreshTrendsJob;
use App\Services\TrendFinderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class TrendsController extends Controller
{
    public function index(TrendFinderService $service): Response
    {
        return Inertia::render('Trends/Index', [
            'trends' => $service->latest(),
            'hooks' => $service->hookIdeas(),
            'configured' => $service->isConfigured(),
            'lastRefreshed' => $service->lastRefreshed()?->toISOString(),
        ]);
    }

    public function refresh(TrendFinderService $service): RedirectResponse
    {
        if (! $service->isConfigured()) {
            abort(503, 'Layanan AI belum dikonfigurasi. Isi GEMINI_API_KEY terlebih dahulu.');
        }

        // ponytail: grounded search takes ~30s; dispatch so the redirect returns instantly.
        RefreshTrendsJob::dispatch();

        return redirect()->back()->with('status', 'Pencarian tren dikirim ke antrean TRACE APU. Hasilnya muncul beberapa saat lagi.');
    }

    public function data(TrendFinderService $service): JsonResponse
    {
        return response()->json([
            'trends' => $service->latest()->values(),
            'configured' => $service->isConfigured(),
            'lastRefreshed' => $service->lastRefreshed()?->toISOString(),
        ]);
    }
}
