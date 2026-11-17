<?php

namespace Tests\Feature;

use App\Models\ContentItem;
use App\Models\ContentPillar;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContentPillarCrudTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create(['role' => 'admin', 'primary_role' => 'admin']));
        $this->withoutMiddleware(PreventRequestForgery::class);
    }

    public function test_admin_creates_updates_deactivates_and_deletes_pillar(): void
    {
        $this->assertDatabaseCount('content_pillars', 9);

        $this->post('/settings/pilars', ['label' => 'Kearifan Lokal', 'accent' => 'amber'])
            ->assertRedirect()
            ->assertSessionHasNoErrors();

        $pillar = ContentPillar::query()->where('label', 'Kearifan Lokal')->firstOrFail();
        $this->assertStringStartsWith('kearifan_lokal_', $pillar->key);

        $this->patch("/settings/pilars/{$pillar->id}", [
            'label' => 'Budaya Lokal',
            'accent' => 'rose',
            'is_active' => true,
        ])->assertSessionHasNoErrors();

        $this->assertSame('Budaya Lokal', $pillar->fresh()->label);

        $this->patch("/settings/pilars/{$pillar->id}", [
            'label' => 'Budaya Lokal',
            'accent' => 'rose',
            'is_active' => false,
        ])->assertSessionHasNoErrors();

        $this->delete("/settings/pilars/{$pillar->id}")->assertSessionHasNoErrors();
        $this->assertDatabaseMissing('content_pillars', ['id' => $pillar->id]);
    }

    public function test_pillar_in_use_cannot_be_deleted(): void
    {
        $pillar = ContentPillar::query()->where('key', 'edukasi')->firstOrFail();
        ContentItem::factory()->create(['pillar' => 'edukasi']);

        $this->delete("/settings/pilars/{$pillar->id}")->assertSessionHasErrors('pillar');

        $this->assertDatabaseHas('content_pillars', ['id' => $pillar->id]);
    }

    public function test_non_admin_cannot_manage_pillars(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'creator', 'primary_role' => 'creator']));

        $this->post('/settings/pilars', ['label' => 'Konten Kreator', 'accent' => 'blue'])
            ->assertForbidden();

        $this->assertDatabaseMissing('content_pillars', ['label' => 'Konten Kreator']);
    }
}
