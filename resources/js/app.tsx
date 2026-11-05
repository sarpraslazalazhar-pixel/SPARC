import '../css/app.css';

import React from 'react';
import { createRoot } from 'react-dom/client';
import { createInertiaApp, type ResolvedComponent } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { MotionConfig } from 'framer-motion';
import { ThemeProvider } from '@/Components/ThemeProvider';
import { ToastProvider } from '@/Components/UI/Toast';
import { PersistentAppShell } from '@/Layouts/AppLayout';

const appName = import.meta.env.VITE_APP_NAME || 'SPARC';

const persistentShellLayout = (page: React.ReactNode) => (
    <PersistentAppShell>{page}</PersistentAppShell>
);

createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    resolve: async (name) => {
        const page = await resolvePageComponent(
            `./Pages/${name}.tsx`,
            import.meta.glob<{ default: ResolvedComponent }>('./Pages/**/*.tsx')
        );
        if (name !== 'Welcome' && !name.startsWith('Auth/') && !page.default.layout) {
            page.default.layout = persistentShellLayout;
        }
        return page.default;
    },
    setup({ el, App, props }) {
        const root = createRoot(el);
        root.render(
            <MotionConfig reducedMotion="user">
                <ThemeProvider>
                    <ToastProvider>
                        <App {...props} />
                    </ToastProvider>
                </ThemeProvider>
            </MotionConfig>
        );
    },
    progress: {
        color: '#1546D8',
        delay: 120,
        includeCSS: true,
        showSpinner: false,
    },
});
