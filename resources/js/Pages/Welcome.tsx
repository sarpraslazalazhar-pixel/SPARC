import { Head, Link } from '@inertiajs/react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/Components/UI/Button';
import { ThemeSwitcher } from '@/Components/UI/ThemeSwitcher';

interface WelcomeProps {
    appName?: string;
}

export default function Welcome({ appName }: WelcomeProps) {
    return (
        <div className="min-h-screen bg-[var(--md-sys-color-background)] text-[var(--md-sys-color-on-background)] flex flex-col items-center justify-center p-6 relative">
            <Head title="Welcome - SPARC" />

            <div className="absolute top-6 right-6">
                <ThemeSwitcher />
            </div>

            <div className="max-w-md w-full bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-3xl shadow-[var(--md-elevation-2)] border border-[var(--md-sys-color-outline-variant)] p-8 text-center space-y-5">
                <div className="w-16 h-16 rounded-2xl bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] flex items-center justify-center font-extrabold text-2xl mx-auto shadow-[var(--md-elevation-1)]">
                    SP
                </div>
                <div className="space-y-1.5">
                    <h1 className="text-2xl font-black tracking-tight text-[var(--md-sys-color-on-surface)]">
                        {appName || 'SPARC'}
                    </h1>
                    <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                        Social Media Planner, Analytics &amp; Report Content (Humas)
                    </p>
                </div>

                <div className="pt-2">
                    <Link href="/">
                        <Button variant="primary" size="md" className="w-full">
                            Masuk ke Dashboard <ArrowRight className="w-4 h-4" />
                        </Button>
                    </Link>
                </div>

                <div className="pt-4 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-center gap-2 text-xs text-[#00A870] dark:text-emerald-400 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-[#00A870] dark:bg-emerald-400 animate-pulse" />
                    Laravel 13 + Inertia v3 + React 19 + Material Design 3
                </div>
            </div>
        </div>
    );
}
