<?php

namespace Tests\Feature;

use App\Models\AiSetting;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class AiProviderSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $user = User::factory()->create([
            'role' => 'admin',
            'primary_role' => 'admin',
        ]);
        $this->actingAs($user);
        $this->withoutMiddleware(PreventRequestForgery::class);
    }

    public function test_models_are_discovered_from_the_configured_endpoint(): void
    {
        AiSetting::store([
            'base_url' => 'https://llm.example.com/v1beta/',
            'api_key' => 'secret-key',
        ]);

        Http::fake([
            'https://llm.example.com/v1beta/models*' => Http::response([
                'models' => [
                    [
                        'name' => 'models/gemini-2.5-pro',
                        'displayName' => 'Gemini 2.5 Pro',
                        'supportedGenerationMethods' => ['generateContent', 'countTokens'],
                        'inputTokenLimit' => 1048576,
                        'outputTokenLimit' => 65536,
                    ],
                    [
                        'name' => 'models/text-embedding-004',
                        'displayName' => 'Text Embedding 004',
                        'supportedGenerationMethods' => ['embedContent'],
                    ],
                ],
            ]),
        ]);

        $response = $this->getJson('/trace-apu/provider/models');

        $response->assertOk()
            ->assertJsonPath('count', 2)
            ->assertJsonPath('models.0.id', 'gemini-2.5-pro')
            ->assertJsonPath('models.0.supports_generate', true)
            ->assertJsonPath('models.1.supports_embedding', true);

        Http::assertSent(fn ($request): bool => $request->hasHeader('x-goog-api-key', 'secret-key')
            && str_starts_with($request->url(), 'https://llm.example.com/v1beta/models'));
    }

    public function test_models_report_bad_key_with_actionable_message(): void
    {
        AiSetting::store(['api_key' => 'wrong']);

        Http::fake([
            '*/models*' => Http::response(['error' => ['message' => 'API key not valid']], 400),
        ]);

        $this->getJson('/trace-apu/provider/models')
            ->assertStatus(422)
            ->assertJsonPath('models', []);
    }

    public function test_models_require_a_key(): void
    {
        config()->set('prism.providers.gemini.api_key', null);

        $this->getJson('/trace-apu/provider/models')
            ->assertStatus(422)
            ->assertJsonPath('message', 'Isi API key terlebih dahulu.');
    }

    public function test_saving_settings_encrypts_key_and_overrides_prism_config(): void
    {
        config()->set('prism.providers.gemini.api_key', 'env-key');

        $this->putJson('/trace-apu/provider', [
            'base_url' => 'https://llm.example.com/v1beta/',
            'api_key' => 'db-key',
            'model' => 'gemini-2.5-pro',
            'embedding_model' => 'text-embedding-004',
        ])
            ->assertOk()
            ->assertJsonPath('aiProvider.model', 'gemini-2.5-pro')
            ->assertJsonPath('aiProvider.key_source', 'database')
            ->assertJsonPath('aiProvider.resolved_base_url', 'https://llm.example.com/v1beta');

        $setting = AiSetting::current();

        $this->assertSame('db-key', $setting->api_key);
        $this->assertNotSame('db-key', $setting->getRawOriginal('api_key'), 'API key must be encrypted at rest');
        $this->assertSame('db-key', config('prism.providers.gemini.api_key'));
        $this->assertSame('https://llm.example.com/v1beta', config('prism.providers.gemini.url'));
        $this->assertSame('gemini-2.5-pro', config('services.gemini.model'));
        $this->assertSame('text-embedding-004', config('services.gemini.embedding_model'));
    }

    public function test_blank_key_keeps_the_stored_one(): void
    {
        AiSetting::store(['api_key' => 'stored-key']);

        $this->putJson('/trace-apu/provider', [
            'base_url' => '',
            'api_key' => '',
            'model' => 'gemini-2.5-flash',
        ])->assertOk();

        $this->assertSame('stored-key', AiSetting::current()->api_key);
        $this->assertSame('gemini-2.5-flash', config('services.gemini.model'));
    }

    public function test_settings_page_exposes_ai_payload_without_secret(): void
    {
        AiSetting::store(['api_key' => 'stored-key', 'model' => 'gemini-2.5-pro']);

        $this->get('/settings')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Settings/Index')
                ->where('settings.ai.has_api_key', true)
                ->where('settings.ai.key_source', 'database')
                ->where('settings.ai.model', 'gemini-2.5-pro')
                ->missing('settings.ai.api_key'));
    }
}
