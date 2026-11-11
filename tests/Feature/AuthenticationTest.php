<?php

namespace Tests\Feature;

use App\Models\InstagramConnection;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(PreventRequestForgery::class);
    }

    public function test_login_screen_can_be_rendered(): void
    {
        $response = $this->get(route('login'));

        $response->assertOk()
            ->assertInertia(fn (AssertableInertia $page): AssertableInertia => $page
                ->component('Auth/Login')
            );
    }

    public function test_users_can_authenticate_using_the_login_screen(): void
    {
        $user = User::factory()->create([
            'email' => 'admin@sparc.go.id',
            'password' => bcrypt('password123'),
            'role' => 'admin',
        ]);

        $response = $this->post(route('login.store'), [
            'email' => 'admin@sparc.go.id',
            'password' => 'password123',
        ]);

        $this->assertAuthenticatedAs($user);
        $response->assertRedirect(route('dashboard'));
    }

    public function test_demo_account_can_authenticate_via_login_post(): void
    {
        $user = User::factory()->create([
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);

        $response = $this->post(route('login.store'), [
            'email' => 'test@example.com',
            'password' => 'password',
        ]);

        $this->assertAuthenticatedAs($user);
        $response->assertRedirect(route('dashboard'));
        $this->assertEquals('admin', session('sparc_v3.active_role'));
    }

    public function test_users_can_not_authenticate_with_invalid_password(): void
    {
        $user = User::factory()->create([
            'email' => 'admin@sparc.go.id',
            'password' => bcrypt('password123'),
        ]);

        $response = $this->post(route('login.store'), [
            'email' => 'admin@sparc.go.id',
            'password' => 'wrong-password',
        ]);

        $this->assertGuest();
        $response->assertSessionHasErrors('email');
    }

    public function test_users_can_logout(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post(route('logout'));

        $this->assertGuest();
        $response->assertRedirect(route('login'));
    }

    public function test_guest_is_redirected_to_login_from_protected_routes(): void
    {
        $response = $this->get(route('dashboard'));

        $response->assertRedirect(route('login'));
    }

    public function test_user_login_does_not_block_on_external_instagram_sync(): void
    {
        config([
            'services.instagram.account_id' => '17841400123456789',
            'services.instagram.access_token' => 'EAATestToken123',
            'services.instagram.graph_version' => 'v21.0',
        ]);

        InstagramConnection::current()->update([
            'account_id' => '17841400123456789',
            'access_token' => 'EAATestToken123',
            'connected' => true,
            'username' => 'sparc_official',
        ]);

        Http::fake();

        $user = User::factory()->create([
            'email' => 'admin@sparc.go.id',
            'password' => bcrypt('password123'),
            'role' => 'admin',
        ]);

        $response = $this->post(route('login.store'), [
            'email' => 'admin@sparc.go.id',
            'password' => 'password123',
        ]);

        $response->assertRedirect(route('dashboard'));
        Http::assertNothingSent();
    }
}
