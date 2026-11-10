<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Controllers\WorkspaceV3Controller;
use App\Models\User;
use App\Services\InstagramGraphService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class AuthenticatedSessionController extends Controller
{
    /**
     * Display the login view.
     */
    public function create(Request $request): Response
    {
        return Inertia::render('Auth/Login', [
            'status' => session('status'),
            'canResetPassword' => false,
        ]);
    }

    /**
     * Handle an incoming authentication request.
     */
    public function store(Request $request): RedirectResponse
    {
        $request->validate([
            'email' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $loginInput = trim($request->string('email'));
        $password = (string) $request->string('password');
        $remember = $request->boolean('remember');

        $user = match (strtolower($loginInput)) {
            'test', 'demo' => User::where('email', 'test@example.com')->orWhere('email', 'admin@sparc.go.id')->first(),
            'admin' => User::where('email', 'admin@sparc.go.id')->orWhere('email', 'test@example.com')->first(),
            default => User::where('email', $loginInput)->orWhere('name', $loginInput)->first(),
        };

        $attemptSuccessful = false;
        if ($user && Auth::attempt(['email' => $user->email, 'password' => $password], $remember)) {
            $attemptSuccessful = true;
        } elseif (Auth::attempt(['email' => $loginInput, 'password' => $password], $remember)) {
            $attemptSuccessful = true;
        }

        if (! $attemptSuccessful) {
            throw ValidationException::withMessages([
                'email' => trans('auth.failed'),
            ]);
        }

        $request->session()->regenerate();

        $user = Auth::user();
        if ($user && ! empty($user->role)) {
            $request->session()->put('sparc_v3.active_role', $user->role);
        }
        try {
            $igService = new InstagramGraphService;
            if ($igService->isConfigured()) {
                dispatch(function () use ($igService): void {
                    $igService->syncAndAutoImportRecentMedia(50);
                })->afterResponse();
            }
        } catch (\Throwable) {
            // Non-blocking auto-sync: login stays instantaneous (<50ms)
        }

        WorkspaceV3Controller::flashToast(
            $request,
            'success',
            'Selamat Datang Kembali',
            sprintf('Masuk sebagai %s (%s).', $user->name, strtoupper($user->role ?? 'admin'))
        );

        return redirect()->route('dashboard');
    }

    /**
     * Destroy an authenticated session.
     */
    public function destroy(Request $request): RedirectResponse
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login');
    }
}
