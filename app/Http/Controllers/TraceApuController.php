<?php

namespace App\Http\Controllers;

use App\Services\TraceApuCorpusService;
use App\Services\TraceApuService;
use App\Services\TrendFinderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class TraceApuController extends Controller
{
    /**
     * Stream one TRACE APU agent turn as NDJSON.
     */
    public function chat(Request $request, TraceApuService $traceApu): StreamedResponse|JsonResponse
    {
        if (! $traceApu->isConfigured()) {
            return $this->notConfigured();
        }

        $data = $request->validate([
            'message' => ['required', 'string', 'max:4000'],
            'scope' => ['nullable', 'string', 'max:60', 'regex:/^(global|studio:[A-Za-z0-9_-]{1,40})$/'],
            'fresh' => ['boolean'],
        ]);

        $scope = $traceApu->scopeFor($data['scope'] ?? 'global', $request->user());

        return $traceApu->stream($scope, $data['message'], (bool) ($data['fresh'] ?? false));
    }

    /**
     * Fresh conversation state for the panel: greeting + transcript.
     */
    public function panel(Request $request, TraceApuService $traceApu, TraceApuCorpusService $corpus): JsonResponse
    {
        $scope = $traceApu->scopeFor((string) $request->query('scope', 'global'), $request->user());
        $trends = $corpus->activeTrends(3);
        $lastRefresh = $corpus->lastRefreshed($corpus->activeTrends(50));

        return response()->json([
            'configured' => $traceApu->isConfigured(),
            'scope' => $scope,
            'greeting' => $trends->isEmpty()
                ? 'Halo, saya TRACE APU. Tren belum tersedia — minta saya mencari tren terkini atau tanyakan apa saja soal konten.'
                : 'Halo, saya TRACE APU. '.$trends->count().' tren aktif terakhir '.($lastRefresh?->diffForHumans() ?? 'baru saja').'.',
            'trends' => $trends->map(static fn ($trend): array => [
                'id' => $trend->id,
                'title' => (string) $trend->title,
                'momentum' => (string) $trend->momentum,
                'category' => (string) $trend->category,
            ])->values(),
            'history' => $traceApu->history($scope),
            'instructions' => $traceApu->instructions($scope),
        ]);
    }

    /**
     * Persist scope-level steering instructions ("steering di").
     */
    public function updateInstructions(Request $request, TraceApuService $traceApu): JsonResponse
    {
        $data = $request->validate([
            'scope' => ['nullable', 'string', 'max:60', 'regex:/^(global|studio:[A-Za-z0-9_-]{1,40})$/'],
            'persona' => ['nullable', 'string', 'max:500'],
            'rules' => ['array', 'max:10'],
            'rules.*' => ['string', 'max:200'],
        ]);

        $scope = $traceApu->scopeFor($data['scope'] ?? 'global', $request->user());

        return response()->json([
            'instructions' => $traceApu->saveInstructions($scope, [
                'persona' => $data['persona'] ?? '',
                'rules' => $data['rules'] ?? [],
            ]),
        ]);
    }

    public function forget(Request $request, TraceApuService $traceApu): JsonResponse
    {
        $scope = $traceApu->scopeFor((string) $request->input('scope', 'global'), $request->user());
        $traceApu->forget($scope);

        return response()->json(['forgotten' => true]);
    }

    /**
     * Grounded trend search exposed to the Trends page and the Hook Bank.
     */
    public function refreshTrends(TrendFinderService $trends): JsonResponse
    {
        if (! $trends->isConfigured()) {
            return $this->notConfigured();
        }

        return response()->json([
            'saved' => $trends->fetchAndStore(),
            'lastRefreshed' => $trends->lastRefreshed()?->toISOString(),
        ]);
    }

    /**
     * Draft a Studio script through TRACE APU (structured output, no tools).
     */
    public function draft(Request $request, TraceApuService $traceApu): JsonResponse
    {
        if (! $traceApu->isConfigured()) {
            return $this->notConfigured();
        }

        $data = $request->validate([
            'project' => ['required', 'array'],
            'project.title' => ['required', 'string', 'max:200'],
            'project.format' => ['nullable', 'string', 'max:40'],
            'project.pillar' => ['nullable', 'string', 'max:40'],
            'project.caption' => ['nullable', 'string', 'max:4000'],
            'project.hashtags' => ['nullable', 'string', 'max:500'],
            'include_trends' => ['boolean'],
        ]);

        $scope = $traceApu->scopeFor('studio:'.($data['project']['id'] ?? 'draft'), $request->user());
        $project = $data['project'];

        $question = implode("\n", array_filter([
            'Susun draf naskah untuk proyek Studio berikut.',
            'Judul: '.$project['title'],
            'Format: '.($project['format'] ?? '-'),
            'Pilar: '.($project['pillar'] ?? '-'),
            'Caption saat ini: '.($project['caption'] ?? '-'),
            'Hashtag saat ini: '.($project['hashtags'] ?? '-'),
            ! empty($data['include_trends']) ? 'Kaitkan dengan tren aktif di konteks.' : null,
        ]));

        try {
            $draft = $traceApu->draft($scope, $question);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['message' => 'TRACE APU gagal menyusun draf. Coba lagi.'], 502);
        }

        return response()->json(['draft' => $draft]);
    }

    /**
     * Persist a reviewed caption proposal straight into the content item.
     */
    public function applyCaption(Request $request, TraceApuCorpusService $corpus): JsonResponse
    {
        if (! WorkspaceV3Controller::resolveAuthContextData($request)['can']['editContent']) {
            return response()->json(['message' => 'Peran Anda tidak diizinkan mengubah caption konten.'], 403);
        }

        $data = $request->validate([
            'content_ref' => ['required', 'string', 'max:64'],
            'caption' => ['required', 'string', 'max:4000'],
        ]);

        $item = $corpus->findItem($data['content_ref']);

        if ($item === null) {
            return response()->json(['message' => 'Konten tidak ditemukan. Muat ulang daftar konten.'], 404);
        }

        $item->update(['caption' => $data['caption']]);

        return response()->json([
            'message' => 'Caption '.($item->content_id ?: $item->getKey()).' tersimpan.',
            'content_ref' => (string) ($item->content_id ?: $item->getKey()),
        ]);
    }

    private function notConfigured(): JsonResponse
    {
        return response()->json([
            'message' => 'Layanan AI belum dikonfigurasi. Isi GEMINI_API_KEY terlebih dahulu.',
        ], 503);
    }
}
