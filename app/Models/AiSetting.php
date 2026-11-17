<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Singleton runtime configuration for the TRACE APU AI provider.
 *
 * The API key is stored encrypted; env (`GEMINI_API_KEY`, `GEMINI_URL`,
 * `GEMINI_MODEL`) stays the default when the row is empty.
 */
class AiSetting extends Model
{
    public const PROVIDER_GEMINI = 'gemini';

    public const PROVIDER_OPENAI = 'openai';

    /**
     * Providers selectable in Settings. `openai` covers any OpenAI-compatible gateway.
     */
    public const PROVIDERS = [self::PROVIDER_GEMINI, self::PROVIDER_OPENAI];

    protected $fillable = [
        'provider',
        'base_url',
        'api_key',
        'model',
        'embedding_model',
    ];

    protected function casts(): array
    {
        return [
            'api_key' => 'encrypted',
        ];
    }

    /**
     * Return the singleton settings row.
     */
    public static function current(): self
    {
        /** @var self $setting */
        $setting = static::query()->firstOrCreate(['id' => 1], [
            'provider' => self::PROVIDER_GEMINI,
        ]);

        return $setting;
    }

    /**
     * Persist the settings and refresh the in-process Prism config.
     *
     * @param  array{provider?: string, base_url?: string|null, api_key?: string|null, model?: string|null, embedding_model?: string|null}  $attributes
     */
    public static function store(array $attributes): self
    {
        $setting = self::current();

        // An empty API key field means "keep the stored key".
        if (array_key_exists('api_key', $attributes) && blank($attributes['api_key'])) {
            unset($attributes['api_key']);
        }

        $setting->fill($attributes)->save();
        self::apply($setting);

        return $setting;
    }

    /**
     * Push the stored settings into Prism's config, overriding env defaults.
     */
    public static function apply(?self $setting = null): void
    {
        $setting ??= self::current();

        $apiKey = (string) ($setting->api_key ?? '');
        $baseUrl = rtrim((string) ($setting->base_url ?? ''), '/');
        $provider = self::provider();

        if ($apiKey !== '') {
            config(["prism.providers.{$provider}.api_key" => $apiKey]);
        }

        if ($baseUrl !== '') {
            config(["prism.providers.{$provider}.url" => $baseUrl]);
        }

        if (filled($setting->model)) {
            config(['services.gemini.model' => (string) $setting->model]);
        }

        if (filled($setting->embedding_model)) {
            config(['services.gemini.embedding_model' => (string) $setting->embedding_model]);
        }
    }

    /**
     * Active Prism provider name (`gemini` or `openai`).
     */
    public static function provider(): string
    {
        return self::current()->provider ?: self::PROVIDER_GEMINI;
    }

    /**
     * Base URL used for model discovery, resolved from the DB or env.
     */
    public function resolvedBaseUrl(): string
    {
        $url = rtrim((string) ($this->base_url ?? ''), '/');

        return $url !== '' ? $url : rtrim((string) config('prism.providers.'.($this->provider ?: self::PROVIDER_GEMINI).'.url'), '/');
    }

    /**
     * API key used for model discovery, resolved from the DB or env.
     */
    public function resolvedApiKey(): string
    {
        $key = (string) ($this->api_key ?? '');

        return $key !== '' ? $key : (string) config('prism.providers.'.($this->provider ?: self::PROVIDER_GEMINI).'.api_key');
    }
}
