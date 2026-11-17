<?php

namespace App\Providers;

use App\Models\AiSetting;
use App\Services\HaloApuClientService;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Prism\Prism\PrismManager;
use Throwable;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(HaloApuClientService::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if (str_starts_with((string) config('app.url'), 'https://') || $this->app->environment('production')) {
            URL::forceScheme('https');
        }

        $this->registerOpenAiCompatibleGateway();
        $this->applyAiSettings();
    }

    /**
     * Route the `openai` Prism provider through the Chat Completions bridge.
     */
    private function registerOpenAiCompatibleGateway(): void
    {
        if (! class_exists(PrismManager::class)) {
            // Vendor server belum berisi prism-php/prism (composer install belum dijalankan).
            return;
        }

        app(PrismManager::class)->extend('openai', fn ($app, array $config): OpenAiCompatibleGateway => new OpenAiCompatibleGateway(
            apiKey: (string) ($config['api_key'] ?? ''),
            url: (string) ($config['url'] ?? ''),
            organization: $config['organization'] ?? null,
            project: $config['project'] ?? null,
        ));
    }

    /**
     * Apply admin-configured AI credentials (DB) over env defaults.
     */
    private function applyAiSettings(): void
    {
        // Runs for HTTP, console commands and queue workers alike.
        try {
            if (! Schema::hasTable('ai_settings')) {
                return;
            }

            AiSetting::apply();
        } catch (Throwable) {
            // Database not ready (fresh install, migration in progress): keep env defaults.
        }
    }
}
