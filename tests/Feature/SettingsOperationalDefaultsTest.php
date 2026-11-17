<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class SettingsOperationalDefaultsTest extends TestCase
{
    use RefreshDatabase;

    public function test_operational_parameters_are_never_blank_on_first_visit(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'admin', 'primary_role' => 'admin']));

        $this->get('/settings')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Settings/Index')
                ->where('settings.monthlyContentTarget', 24)
                ->where('settings.workingHoursStart', '08:00')
                ->where('settings.workingHoursEnd', '17:00')
                ->where('settings.pollingIntervalSeconds', 30));
    }
}
