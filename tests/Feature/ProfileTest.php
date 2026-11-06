<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class ProfileTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware([PreventRequestForgery::class]);
    }

    public function test_profile_page_is_displayed_for_authenticated_user(): void
    {
        $user = User::factory()->create([
            'role' => 'admin',
        ]);

        $this->actingAs($user)
            ->get(route('profile.edit'))
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page): AssertableInertia => $page
                ->component('Profile/Edit')
                ->has('user.name')
                ->has('user.email')
                ->has('user.role')
            );
    }

    public function test_profile_information_can_be_updated(): void
    {
        $user = User::factory()->create([
            'name' => 'Original Name',
            'email' => 'original@humas.instansi.go.id',
            'role' => 'creator',
        ]);

        $this->actingAs($user)
            ->patch(route('profile.update'), [
                'name' => 'Updated Personel Name',
                'email' => 'updated@humas.instansi.go.id',
            ])
            ->assertRedirect()
            ->assertSessionHas('toast.type', 'success');

        $user->refresh();
        $this->assertSame('Updated Personel Name', $user->name);
        $this->assertSame('updated@humas.instansi.go.id', $user->email);
    }

    public function test_profile_password_can_be_updated(): void
    {
        $user = User::factory()->create([
            'password' => Hash::make('old-password-123'),
        ]);

        $this->actingAs($user)
            ->put(route('profile.password'), [
                'current_password' => 'old-password-123',
                'password' => 'new-secret-password',
                'password_confirmation' => 'new-secret-password',
            ])
            ->assertRedirect()
            ->assertSessionHas('toast.type', 'success');

        $user->refresh();
        $this->assertTrue(Hash::check('new-secret-password', $user->password));
    }

    public function test_profile_password_fails_with_incorrect_current_password(): void
    {
        $user = User::factory()->create([
            'password' => Hash::make('real-password-123'),
        ]);

        $this->actingAs($user)
            ->from(route('profile.edit'))
            ->put(route('profile.password'), [
                'current_password' => 'wrong-password',
                'password' => 'new-password-321',
                'password_confirmation' => 'new-password-321',
            ])
            ->assertRedirect(route('profile.edit'))
            ->assertSessionHasErrors(['current_password']);

        $user->refresh();
        $this->assertTrue(Hash::check('real-password-123', $user->password));
    }

    public function test_profile_avatar_can_be_uploaded_and_removed(): void
    {
        Storage::fake('public');

        $user = User::factory()->create([
            'avatar' => null,
        ]);

        $file = UploadedFile::fake()->image('my-photo.jpg', 400, 400);

        $this->actingAs($user)
            ->post(route('profile.avatar'), [
                'avatar_file' => $file,
                'action' => 'upload',
            ])
            ->assertRedirect()
            ->assertSessionHas('toast.type', 'success');

        $user->refresh();
        $this->assertNotNull($user->avatar);
        $this->assertStringStartsWith('/storage/avatars/', $user->avatar);

        // Now test remove
        $this->actingAs($user)
            ->post(route('profile.avatar'), [
                'action' => 'remove',
            ])
            ->assertRedirect()
            ->assertSessionHas('toast.type', 'info');

        $user->refresh();
        $this->assertNull($user->avatar);
    }
}
