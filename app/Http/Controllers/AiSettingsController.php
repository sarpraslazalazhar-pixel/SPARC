<?php

namespace App\Http\Controllers;

use App\Models\AiSetting;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\Rule;
use Throwable;

/**
 * Admin configuration for the TRACE APU AI provider: endpoint, key, models.
 */
class AiSettingsController extends Controller
{
    /**
     * Persist endpoint/key/model and refresh the Prism config immediately.
     */
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'provider' => ['nullable', Rule::in(AiSetting::PROVIDERS)],
            'base_url' => ['nullable', 'url', 'max:255'],
            'api_key' => ['nullable', 'string', 'max:255'],
            'model' => ['nullable', 'string', 'max:120'],
            'embedding_model' => ['nullable', 'string', 'max:120'],
        ]);

        $setting = AiSetting::store([
            'provider' => $data['provider'] ?? AiSetting::provider(),
            'base_url' => $data['base_url'] ? rtrim($data['base_url'], '/') : null,
            'api_key' => $data['api_key'] ?? null,
            'model' => $data['model'] ?? null,
            'embedding_model' => $data['embedding_model'] ?? null,
        ]);

        return response()->json([
            'message' => 'Konfigurasi AI disimpan.',
            'aiProvider' => $this->payload($setting),
        ]);
    }

    /**
     * Probe the endpoint for the models this API key can actually use.
     */
    public function models(): JsonResponse
    {
        $setting = AiSetting::current();
        $apiKey = $setting->resolvedApiKey();

        if ($apiKey === '') {
            return response()->json([
                'message' => 'Isi API key terlebih dahulu.',
                'models' => [],
            ], 422);
        }

        try {
            $response = $this->client($apiKey, $setting->resolvedBaseUrl())
                ->get('models', ['pageSize' => 200]);

            if ($response->failed()) {
                return response()->json([
                    'message' => $this->errorMessage($response->json('error.message'), $response->status()),
                    'models' => [],
                ], 422);
            }

            $provider = $setting->provider ?: AiSetting::PROVIDER_GEMINI;

            $models = collect($provider === AiSetting::PROVIDER_OPENAI
                ? array_map(fn (array $model): array => [
                    'id' => (string) ($model['id'] ?? ''),
                    'label' => (string) ($model['id'] ?? ''),
                    'description' => '',
                    'input_tokens' => null,
                    'output_tokens' => null,
                    // OpenAI-compatible listings never flag embeddings; a `/embed` in the id is the only hint.
                    'supports_generate' => ! str_contains((string) ($model['id'] ?? ''), 'embed'),
                    'supports_embedding' => str_contains((string) ($model['id'] ?? ''), 'embed'),
                ], (array) $response->json('data', []))
                : $this->geminiModels((array) $response->json('models', [])))
                ->filter(fn (array $model): bool => $model['id'] !== '')
                ->sortByDesc(fn (array $model): bool => $model['supports_generate'])
                ->values();

            return response()->json([
                'models' => $models,
                'count' => $models->count(),
                'fetched_at' => now()->toIso8601String(),
            ]);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'Tidak bisa menghubungi endpoint: '.$exception->getMessage(),
                'models' => [],
            ], 422);
        }
    }

    /**
     * @return array{base_url: string, resolved_base_url: string, model: string, embedding_model: string, has_api_key: bool, key_source: string, configured: bool, timeout: int}
     */
    private function payload(AiSetting $setting): array
    {
        return [
            'provider' => $setting->provider ?: AiSetting::PROVIDER_GEMINI,
            'base_url' => (string) ($setting->base_url ?? ''),
            'resolved_base_url' => $setting->resolvedBaseUrl(),
            'model' => (string) ($setting->model ?: config('services.gemini.model', 'gemini-2.5-flash')),
            'embedding_model' => (string) ($setting->embedding_model ?: config('services.gemini.embedding_model', 'gemini-embedding-001')),
            'has_api_key' => $setting->resolvedApiKey() !== '',
            'key_source' => filled($setting->api_key) ? 'database' : (filled(config('prism.providers.'.AiSetting::provider().'.api_key')) ? 'env' : 'none'),
            'configured' => $setting->resolvedApiKey() !== '',
            'timeout' => (int) config('services.gemini.timeout', 120),
        ];
    }

    private function client(string $apiKey, string $baseUrl): PendingRequest
    {
        $client = Http::baseUrl(rtrim($baseUrl, '/').'/')->timeout(20)->acceptJson();

        // Gemini reads `x-goog-api-key`; OpenAI-compatible gateways only honor Bearer.
        return AiSetting::provider() === AiSetting::PROVIDER_OPENAI
            ? $client->withToken($apiKey)
            : $client->withHeaders(['x-goog-api-key' => $apiKey]);
    }

    /**
     * Normalize Gemini's `models[]` listing.
     *
     * @param  list<array<string, mixed>>  $models
     * @return list<array<string, mixed>>
     */
    private function geminiModels(array $models): array
    {
        return array_map(function (array $model): array {
            $name = (string) ($model['name'] ?? '');
            $methods = array_map('strtolower', (array) ($model['supportedGenerationMethods'] ?? []));

            return [
                'id' => str_contains($name, '/') ? substr($name, strrpos($name, '/') + 1) : $name,
                'label' => (string) ($model['displayName'] ?? $name),
                'description' => (string) ($model['description'] ?? ''),
                'input_tokens' => $model['inputTokenLimit'] ?? null,
                'output_tokens' => $model['outputTokenLimit'] ?? null,
                'supports_generate' => in_array('generatecontent', $methods, true),
                'supports_embedding' => in_array('embedcontent', $methods, true)
                    || in_array('batchembedcontents', $methods, true),
            ];
        }, $models);
    }

    private function errorMessage(?string $message, int $status): string
    {
        return match ($status) {
            400 => 'API key tidak valid atau endpoint menolak permintaan. '.($message ?? ''),
            401, 403 => 'API key ditolak. Periksa kembali kuncinya.',
            404 => 'Endpoint tidak ditemukan. Pastikan URL berakhir di versi API, misalnya .../v1beta/.',
            default => $message ?? 'Permintaan ditolak (HTTP '.$status.').',
        };
    }
}
