<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">
        <title inertia>{{ config('app.name', 'SPARC') }}</title>

        <!-- Favicon -->
        <link rel="icon" type="image/svg+xml" href="{{ asset('favicon.svg') }}">
        <link rel="icon" type="image/png" sizes="32x32" href="{{ asset('favicon-32x32.png') }}">
        <link rel="icon" type="image/x-icon" href="{{ asset('favicon.ico') }}">
        <link rel="apple-touch-icon" sizes="180x180" href="{{ asset('apple-touch-icon.png') }}">
        <!-- Inline MD3 Theme Initialization Script (Prevents FOUC & Hydration Mismatch) -->
        <script>
            (function() {
                try {
                    var stored = localStorage.getItem('sparc_theme') || 'system';
                    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    var isDark = stored === 'dark' || (stored === 'system' && prefersDark);
                    var root = document.documentElement;
                    if (isDark) {
                        root.classList.add('dark');
                        root.style.colorScheme = 'dark';
                    } else {
                        root.classList.remove('dark');
                        root.style.colorScheme = 'light';
                    }
                    root.dataset.themePreference = stored;
                } catch (_) {}
            })();
        </script>

        <!-- Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">

        <!-- Scripts -->
        @viteReactRefresh
        @vite(['resources/js/app.tsx'])
        @inertiaHead
    </head>
    <body class="font-sans antialiased bg-[var(--md-sys-color-background)] text-[var(--md-sys-color-on-background)] min-h-screen selection:bg-[#1546D8]/20 dark:selection:bg-blue-400/30">
        @inertia
    </body>
</html>
