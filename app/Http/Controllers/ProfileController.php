<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;
use Inertia\Response;

class ProfileController extends Controller
{
    /**
     * Display the user's profile settings page (`GET /profile`).
     */
    public function edit(Request $request): Response
    {
        $state = WorkspaceV3Controller::hydrateWorkspace($request);
        /** @var User $user */
        $user = $request->user();

        return Inertia::render('Profile/Edit', [
            'user' => [
                'id' => (string) $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'no_wa' => $user->no_wa ?? '',
                'notify_browser' => (bool) ($user->notify_browser ?? true),
                'notify_inapp' => (bool) ($user->notify_inapp ?? true),
                'notify_sound' => (bool) ($user->notify_sound ?? true),
                'role' => (string) ($user->role ?: $user->primary_role ?: 'creator'),
                'roleLabel' => $state['currentUser']['roleLabel'] ?? ucfirst($user->role ?? 'creator'),
                'avatar' => $user->avatar,
                'defaultAvatar' => 'https://ui-avatars.com/api/?name='.urlencode($user->name).'&background=1546D8&color=fff&size=128&bold=true',
                'createdAt' => $user->created_at?->format('d M Y') ?? '',
            ],
        ]);
    }

    /**
     * Update the user's profile information (name & email) (`PATCH /profile`).
     */
    public function update(Request $request): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:100'],
            'email' => [
                'required',
                'string',
                'email',
                'max:150',
                Rule::unique(User::class)->ignore($user->id),
            ],
            'no_wa' => ['nullable', 'string', 'max:30'],
            'notify_browser' => ['nullable', 'boolean'],
            'notify_inapp' => ['nullable', 'boolean'],
            'notify_sound' => ['nullable', 'boolean'],
            'current_password' => ['nullable', 'current_password'],
            'password' => ['nullable', 'string', 'min:8', 'confirmed'],
        ], [
            'name.required' => 'Nama lengkap wajib diisi.',
            'email.required' => 'Email kedinasan wajib diisi.',
            'email.email' => 'Format email tidak valid.',
            'email.unique' => 'Alamat email ini sudah digunakan oleh personel lain.',
            'current_password.current_password' => 'Kata sandi saat ini tidak cocok.',
            'password.min' => 'Kata sandi baru minimal 8 karakter.',
            'password.confirmed' => 'Konfirmasi kata sandi baru tidak cocok.',
        ]);

        $user->name = $validated['name'];
        $user->email = $validated['email'];
        $user->no_wa = $validated['no_wa'] ?? null;

        if ($request->has('notify_browser')) {
            $user->notify_browser = $request->boolean('notify_browser');
        }
        if ($request->has('notify_inapp')) {
            $user->notify_inapp = $request->boolean('notify_inapp');
        }
        if ($request->has('notify_sound')) {
            $user->notify_sound = $request->boolean('notify_sound');
        }

        if (! empty($validated['password'])) {
            $user->password = Hash::make($validated['password']);
        }

        $user->save();
        WorkspaceV3Controller::flashToast(
            $request,
            'success',
            'Profil Diperbarui',
            'Informasi nama dan email akun Anda berhasil diperbarui.'
        );

        return back();
    }

    /**
     * Update or remove the user's custom avatar (`POST /profile/avatar`).
     */
    public function updateAvatar(Request $request): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        $action = (string) $request->input('action', 'upload');

        if ($action === 'remove') {
            if (! empty($user->avatar) && str_starts_with($user->avatar, '/storage/avatars/')) {
                $path = str_replace('/storage/', '', $user->avatar);
                Storage::disk('public')->delete($path);
            }

            $user->avatar = null;
            $user->save();

            WorkspaceV3Controller::flashToast(
                $request,
                'info',
                'Foto Profil Direset',
                'Foto profil Anda telah dikembalikan ke inisial nama resmi.'
            );

            return back();
        }

        $request->validate([
            'avatar_file' => ['required', 'image', 'mimes:jpeg,png,jpg,webp,gif', 'max:3072'],
        ], [
            'avatar_file.required' => 'Pilih berkas foto terlebih dahulu.',
            'avatar_file.image' => 'Berkas harus berupa gambar.',
            'avatar_file.mimes' => 'Format gambar yang didukung: JPG, PNG, WebP, atau GIF.',
            'avatar_file.max' => 'Ukuran berkas gambar maksimal 3 MB.',
        ]);

        if (! empty($user->avatar) && str_starts_with($user->avatar, '/storage/avatars/')) {
            $oldPath = str_replace('/storage/', '', $user->avatar);
            Storage::disk('public')->delete($oldPath);
        }

        $path = $request->file('avatar_file')->store('avatars', 'public');
        $user->avatar = '/storage/'.$path;
        $user->save();

        WorkspaceV3Controller::flashToast(
            $request,
            'success',
            'Foto Profil Diperbarui',
            'Foto profil baru Anda berhasil diunggah dan disimpan.'
        );

        return back();
    }

    /**
     * Update the user's password (`PUT /profile/password`).
     */
    public function updatePassword(Request $request): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'current_password' => ['required', 'current_password'],
            'password' => ['required', Password::defaults(), 'confirmed'],
        ], [
            'current_password.required' => 'Kata sandi saat ini wajib diisi.',
            'current_password.current_password' => 'Kata sandi saat ini tidak cocok dengan data kami.',
            'password.required' => 'Kata sandi baru wajib diisi.',
            'password.min' => 'Kata sandi baru minimal 8 karakter.',
            'password.confirmed' => 'Konfirmasi kata sandi baru tidak cocok.',
        ]);

        $user->update([
            'password' => Hash::make($validated['password']),
        ]);

        WorkspaceV3Controller::flashToast(
            $request,
            'success',
            'Kata Sandi Berhasil Diganti',
            'Kata sandi akun Anda telah diperbarui dengan aman.'
        );

        return back();
    }
}
