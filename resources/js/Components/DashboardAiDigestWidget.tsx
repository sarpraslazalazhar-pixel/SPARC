import React, { useEffect, useState } from 'react';
import { Link } from '@inertiajs/react';
import { ArrowUpRight, RefreshCw, Sparkles, TrendingUp } from 'lucide-react';
import { fetchDigest } from '@/lib/aiAnalysis';
import type { AiDigestResult } from '@/types/aiAnalysis';

/**
 * Dashboard card: the newest AI period digest. Renders only when one exists,
 * so a workspace without AI credentials stays unchanged.
 */
export function DashboardAiDigestWidget() {
    const [digest, setDigest] = useState<AiDigestResult | null>(null);
    const [configured, setConfigured] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        void fetchDigest().then(({ analysis, configured: isConfigured }) => {
            if (cancelled) {
                return;
            }
            setDigest((analysis?.result as AiDigestResult | null) ?? null);
            setConfigured(isConfigured);
        });

        return () => {
            cancelled = true;
        };
    }, []);

    const refresh = async () => {
        setLoading(true);
        setError(null);
        const { analysis, error: failure } = await fetchDigest(true);
        setLoading(false);

        if (failure) {
            setError(failure);
            return;
        }

        setDigest((analysis?.result as AiDigestResult | null) ?? null);
    };

    // Only hide when the server explicitly reports missing AI credentials.
    if (!digest && !configured) {
        return null;
    }

    return (
        <section className="rounded-3xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-4 sm:p-5 shadow-2xs space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-rose-500 flex items-center justify-center text-white shrink-0">
                        <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-muted)]">
                            Ringkasan Strategi AI
                        </p>
                        <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] truncate">
                            {digest?.headline ?? 'Belum ada ringkasan'}
                        </h3>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={refresh}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] disabled:opacity-60 cursor-pointer shrink-0"
                >
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    {digest ? 'Segarkan' : 'Buat Ringkasan'}
                </button>
            </div>

            {error && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400 leading-relaxed">{error}</p>
            )}

            {digest && (
                <div className="space-y-3">
                    <p className="text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
                        {digest.summary}
                    </p>
                    {digest.winning_patterns.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                                <TrendingUp className="w-3 h-3" /> Pola Berhasil
                            </p>
                            <ul className="space-y-1">
                                {digest.winning_patterns.slice(0, 3).map((pattern) => (
                                    <li
                                        key={pattern}
                                        className="text-[11px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)] pl-3 relative before:content-['•'] before:absolute before:left-0"
                                    >
                                        {pattern}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {digest.pillar_recommendations.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {digest.pillar_recommendations.slice(0, 3).map((idea) => (
                                <span
                                    key={idea}
                                    className="text-[10px] font-bold px-2 py-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] border border-[var(--md-sys-color-outline-variant)]/60"
                                >
                                    {idea}
                                </span>
                            ))}
                        </div>
                    )}
                    <Link
                        href="/trends"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--md-sys-color-primary)] hover:underline"
                    >
                        Lihat tren terkait
                        <ArrowUpRight className="w-3 h-3" />
                    </Link>
                </div>
            )}
        </section>
    );
}
