import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/js/app.tsx'],
            refresh: true,
        }),
        react(),
        tailwindcss(),
    ],
    resolve: {
        alias: {
            '@': path.resolve(import.meta.dirname, 'resources/js'),
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        if (
                            id.includes('/react/') ||
                            id.includes('/react-dom/') ||
                            id.includes('/scheduler/')
                        ) {
                            return 'vendor-react';
                        }
                        if (id.includes('framer-motion') || id.includes('motion-dom')) {
                            return 'vendor-motion';
                        }
                        if (id.includes('@radix-ui') || id.includes('lucide-react')) {
                            return 'vendor-ui';
                        }
                    }
                    return undefined;
                },
            },
        },
    },
});
