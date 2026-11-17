<?php

namespace App\Http\Controllers;

use App\Models\AiAnalysis;
use App\Models\ContentItem;
use App\Services\ContentAnalyzerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class AiAnalysisController extends Controller
{
    /**
     * Review a draft caption before publishing (`POST /ai/analyze-draft`).
     */
    public function analyzeDraft(Request $request, ContentAnalyzerService $analyzer): JsonResponse
    {
        $data = $request->validate([
            'content_item_id' => ['nullable', 'string', 'max:60'],
            'title' => ['nullable', 'string', 'max:255'],
            'caption' => ['required', 'string', 'min:10', 'max:5000'],
            'format' => ['nullable', 'string', 'max:60'],
            'pillar' => ['nullable', 'string', 'max:60'],
            'brief' => ['nullable', 'string', 'max:2000'],
            'force' => ['boolean'],
        ]);

        if (! $analyzer->isConfigured()) {
            return $this->notConfigured();
        }

        $item = null;
        if (! empty($data['content_item_id'])) {
            $item = $this->resolveItem((string) $data['content_item_id']);
        }

        try {
            $analysis = $analyzer->analyzeDraft([
                'title' => (string) ($data['title'] ?? $item?->title ?? ''),
                'caption' => (string) $data['caption'],
                'format' => (string) ($data['format'] ?? $item?->format ?? ''),
                'pillar' => (string) ($data['pillar'] ?? $item?->pillar ?? ''),
                'brief' => (string) ($data['brief'] ?? $item?->brief ?? ''),
                'ref_design_url' => (string) ($item?->ref_design_url ?? ''),
                'result_design_url' => (string) ($item?->result_design_url ?? ''),
            ], $item, (bool) ($data['force'] ?? false));
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['message' => 'Analisis AI gagal: '.$exception->getMessage()], 502);
        }

        return response()->json($this->payload($analysis));
    }

    /**
     * Explain the Instagram metrics of one published item (`POST /ai/analyze-post/{id}`).
     */
    public function analyzePost(Request $request, string $id, ContentAnalyzerService $analyzer): JsonResponse
    {
        $item = $this->resolveItem($id);
        if (! $item instanceof ContentItem) {
            return response()->json(['message' => 'Konten tidak ditemukan.'], 404);
        }

        if (! $analyzer->isConfigured()) {
            return $this->notConfigured();
        }

        if ((int) ($item->reach ?? 0) <= 0 && (int) ($item->likes ?? 0) <= 0) {
            return response()->json(['message' => 'Metrik Instagram belum tersinkron. Tarik metrik terlebih dahulu.'], 422);
        }

        try {
            $analysis = $analyzer->analyzePerformance($item, (bool) $request->boolean('force'));
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['message' => 'Analisis AI gagal: '.$exception->getMessage()], 502);
        }

        return response()->json($this->payload($analysis));
    }

    /**
     * Latest cached review for one item and type, without spending tokens (`GET /ai/analysis/{id}`).
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $item = $this->resolveItem($id);
        if (! $item instanceof ContentItem) {
            return response()->json(['message' => 'Konten tidak ditemukan.'], 404);
        }

        $type = $request->query('type') === AiAnalysis::PRE_PUBLISH
            ? AiAnalysis::PRE_PUBLISH
            : AiAnalysis::POST_PUBLISH;

        $analysis = AiAnalysis::latestCompletedFor($item, $type);

        return response()->json([
            'configured' => app(ContentAnalyzerService::class)->isConfigured(),
            'analysis' => $analysis instanceof AiAnalysis ? $this->payload($analysis) : null,
        ]);
    }

    /**
     * Period digest for the dashboard widget (`GET /ai/digest`).
     */
    public function digest(Request $request, ContentAnalyzerService $analyzer): JsonResponse
    {
        $cachedOnly = ! $request->boolean('refresh');

        if ($cachedOnly) {
            $analysis = AiAnalysis::query()
                ->where('type', AiAnalysis::PERIODIC_DIGEST)
                ->where('status', AiAnalysis::STATUS_COMPLETED)
                ->latest('id')
                ->first();

            return response()->json([
                'configured' => $analyzer->isConfigured(),
                'analysis' => $analysis instanceof AiAnalysis ? $this->payload($analysis) : null,
            ]);
        }

        if (! $analyzer->isConfigured()) {
            return $this->notConfigured();
        }

        try {
            $analysis = $analyzer->digest();
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['message' => $exception->getMessage()], 422);
        }

        return response()->json(['configured' => true, 'analysis' => $this->payload($analysis)]);
    }

    private function resolveItem(string $reference): ?ContentItem
    {
        if (ctype_digit($reference)) {
            return ContentItem::find((int) $reference);
        }

        $clean = str_replace(['ci-', 'p-'], '', $reference);
        if (ctype_digit($clean) && $found = ContentItem::find((int) $clean)) {
            return $found;
        }

        return ContentItem::where('content_id', $reference)->first();
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(AiAnalysis $analysis): array
    {
        return [
            'id' => $analysis->id,
            'type' => $analysis->type,
            'status' => $analysis->status,
            'model' => $analysis->model,
            'analyzed_at' => $analysis->updated_at?->toIso8601String(),
            'result' => $analysis->result,
        ];
    }

    private function notConfigured(): JsonResponse
    {
        return response()->json([
            'message' => 'Kredensial AI belum dikonfigurasi. Isi API key di Pengaturan › AI.',
        ], 503);
    }
}
