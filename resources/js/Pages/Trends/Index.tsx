import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import {
    AlertCircle,
    ArrowUpRight,
    AudioLines,
    Filter,
    Hash,
    Lightbulb,
    Newspaper,
    RefreshCw,
    Sparkles,
    TrendingDown,
    TrendingUp,
    Minus,
} from 'lucide-react';
import { AppLayout } from '@/Layouts/AppLayout';
import { fetchTrends } from '@/lib/traceApu';
import { Button } from '@/Components/UI/Button';
import { TraceApuChat } from '@/Components/TraceApuChat';
import { useToast } from '@/Components/UI/Toast';
import type { TrendHook, TrendInsightItem } from '@/types/traceApu';

interface TrendsIndexProps {
    trends?: TrendInsightItem[];
    hooks?: TrendHook[];
    configured?: boolean;
    lastRefreshed?: string | null;
}

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
    format: { label: 'Format', icon: Sparkles },
    topic: { label: 'Topik', icon: Filter },
    hashtag: { label: 'Hashtag', icon: Hash },
    audio: { label: 'Audio', icon: AudioLines },
    news: { label: 'Berita', icon: Newspaper },
};

const MOMENTUM_META: Record<string, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
    rising: {
        label: 'Naik',
        className: 'text-[var(--md-sys-color-success)]',
        icon: TrendingUp,
    },
    steady: {
        label: 'Stabil',
        className: 'text-[var(--md-sys-color-on-surface-variant)]',
        icon: Minus,
    },
    declining: {
        label: 'Turun',
        className: 'text-[var(--md-sys-color-error)]',
        icon: TrendingDown,
    },
};

function formatRefreshed(value?: string | null): string {
    if (!value) {
        return 'Belum pernah disegarkan';
    }
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? 'Belum pernah disegarkan' : `Terakhir ${date.toLocaleString('id-ID')}`;
}

export default function TrendsIndex({ trends = [], hooks = [], configured = false, lastRefreshed = null }: TrendsIndexProps) {
    const { success, error: toastError } = useToast();
    const [category, setCategory] = useState<string>('all');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [liveTrends, setLiveTrends] = useState(trends);
    const [liveHooks, setLiveHooks] = useState(hooks);

    useEffect(() => {
        setLiveTrends(trends);
        setLiveHooks(hooks);
    }, [trends, hooks]);

    const filtered = useMemo(
        () => (category === 'all' ? liveTrends : liveTrends.filter((trend) => trend.category === category)),
        [category, liveTrends]
    );

    useEffect(() => {
        if (!isRefreshing) {
            return;
        }

        const poll = async () => {
            const feed = await fetchTrends();
            if (!feed) {
                return;
            }
            setLiveTrends(feed.trends);
            setLiveHooks(feed.hooks);
            if (feed.trends.length > 0) {
                setIsRefreshing(false);
            }
        };

        const timer = window.setInterval(() => void poll(), 4000);
        const stop = window.setTimeout(() => setIsRefreshing(false), 120_000);

        return () => {
            window.clearInterval(timer);
            window.clearTimeout(stop);
        };
    }, [isRefreshing]);

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        router.post(
            '/trends/refresh',
            {},
            {
                preserveScroll: true,
                onSuccess: () => success('Pencarian Tren Dikirim', 'TRACE APU sedang menggali tren terbaru. Hasil muncul otomatis.'),
                onError: () => {
                    setIsRefreshing(false);
                    toastError('Gagal Mencari Tren', 'Coba lagi beberapa saat.');
                },
            }
        );
    }, [success, toastError]);

    const handleApplyHook = useCallback(
        (hook: string) => {
            void navigator.clipboard.writeText(hook).then(
                () => success('Hook Disalin', hook),
                () => toastError('Gagal Menyalin', 'Salin manual dari kartu tren.')
            );
        },
        [success, toastError]
    );

    return (
        <AppLayout
            title="Tren Konten"
            subtitle="Tren media sosial Indonesia hasil Google Search grounding — sumber selalu ditampilkan"
            actions={
                <Button
                    size="sm"
                    variant="primary"
                    isLoading={isRefreshing}
                    disabled={!configured}
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    onClick={handleRefresh}
                >
                    {isRefreshing ? 'Mencari tren...' : 'Cari tren sekarang'}
                </Button>
            }
        >
            <Head title="Tren Konten" />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="space-y-4 lg:col-span-8">
                    {!configured && (
                        <div className="flex items-start gap-2 rounded-3xl border border-[var(--md-sys-color-error)]/30 bg-[var(--md-sys-color-error-container)]/40 p-4 text-xs text-[var(--md-sys-color-on-surface)]">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--md-sys-color-error)]" />
                            <span>
                                Tren belum aktif. Isi <code>GEMINI_API_KEY</code> dan <code>GEMINI_MODEL</code> di
                                environment server, lalu jalankan <code>php artisan trends:refresh</code>.
                            </span>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{formatRefreshed(lastRefreshed)}</span>
                        <div className="ml-auto flex flex-wrap gap-1.5">
                            <button
                                type="button"
                                onClick={() => setCategory('all')}
                                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                                    category === 'all'
                                        ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
                                        : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)]'
                                }`}
                            >
                                Semua
                            </button>
                            {Object.entries(CATEGORY_META).map(([key, meta]) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setCategory(key)}
                                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                                        category === key
                                            ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
                                            : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)]'
                                    }`}
                                >
                                    {meta.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {isRefreshing && filtered.length === 0 && (
                        <div className="space-y-3">
                            {[0, 1, 2].map((row) => (
                                <div
                                    key={row}
                                    className="h-28 animate-pulse rounded-3xl border border-[var(--md-sys-color-outline-variant)]/60 bg-[var(--md-sys-color-surface-container-low)]"
                                />
                            ))}
                        </div>
                    )}

                    {filtered.length === 0 && !isRefreshing && (
                        <div className="rounded-3xl border border-dashed border-[var(--md-sys-color-outline-variant)] p-8 text-center">
                            <Sparkles className="mx-auto h-6 w-6 text-[var(--md-sys-color-primary)]" />
                            <p className="mt-2 text-sm font-bold text-[var(--md-sys-color-on-surface)]">Belum ada tren tersimpan</p>
                            <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                Klik “Cari tren sekarang” atau tanya TRACE APU di panel sebelah.
                            </p>
                        </div>
                    )}

                    <div className="space-y-3">
                        {filtered.map((trend) => {
                            const momentum = MOMENTUM_META[trend.momentum] ?? MOMENTUM_META.steady;
                            const categoryMeta = CATEGORY_META[trend.category] ?? CATEGORY_META.topic;
                            const MomentumIcon = momentum.icon;
                            const CategoryIcon = categoryMeta.icon;

                            return (
                                <article
                                    key={trend.id}
                                    className="rounded-3xl border border-[var(--md-sys-color-outline-variant)]/60 bg-[var(--md-sys-color-surface)] p-4 shadow-[var(--md-elevation-1)]"
                                >
                                    <header className="flex flex-wrap items-center gap-2">
                                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-surface-container)] px-2 py-0.5 text-[10px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                                            <CategoryIcon className="h-2.5 w-2.5" />
                                            {categoryMeta.label}
                                        </span>
                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${momentum.className}`}>
                                            <MomentumIcon className="h-2.5 w-2.5" />
                                            {momentum.label}
                                        </span>
                                        <span className="ml-auto text-[10px] font-bold text-[var(--md-sys-color-on-surface-variant)]">
                                            Skor {trend.relevance_score}
                                        </span>
                                    </header>
                                    <h3 className="mt-2 text-sm font-bold text-[var(--md-sys-color-on-surface)]">{trend.title}</h3>
                                    <p className="mt-1 text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">{trend.summary}</p>

                                    {trend.hook_ideas.length > 0 && (
                                        <div className="mt-3 space-y-1.5">
                                            {trend.hook_ideas.map((idea, index) => (
                                                <button
                                                    key={`${trend.id}-hook-${index}`}
                                                    type="button"
                                                    onClick={() => handleApplyHook(idea.hook)}
                                                    className="block w-full rounded-2xl border border-[var(--md-sys-color-outline-variant)]/60 bg-[var(--md-sys-color-surface-container-low)] px-3 py-2 text-left"
                                                >
                                                    <span className="flex items-start gap-1.5 text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                                                        <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-[var(--md-sys-color-primary)]" />
                                                        {idea.hook}
                                                    </span>
                                                    {idea.rationale && (
                                                        <span className="mt-0.5 block text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                                                            {idea.rationale}
                                                        </span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {trend.sources.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--md-sys-color-outline-variant)]/60 pt-2">
                                            {trend.sources.slice(0, 4).map((source) => (
                                                <a
                                                    key={source.url}
                                                    href={source.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--md-sys-color-primary)] hover:underline"
                                                >
                                                    {source.title}
                                                    <ArrowUpRight className="h-2.5 w-2.5" />
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                </div>

                <aside className="space-y-4 lg:col-span-4">
                    <TraceApuChat scope="global" onApplyHook={handleApplyHook} />

                    <div className="rounded-3xl border border-[var(--md-sys-color-outline-variant)]/60 bg-[var(--md-sys-color-surface)] p-4">
                        <h3 className="flex items-center gap-1.5 text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                            <Lightbulb className="h-3.5 w-3.5 text-[var(--md-sys-color-primary)]" />
                            Hook Bank aktif
                        </h3>
                        {liveHooks.length === 0 ? (
                            <p className="mt-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                Hook otomatis diambil dari tren aktif begitu pencarian selesai.
                            </p>
                        ) : (
                            <ul className="mt-2 space-y-2">
                                {liveHooks.slice(0, 6).map((hook) => (
                                    <li key={hook.id}>
                                        <button
                                            type="button"
                                            onClick={() => handleApplyHook(hook.text)}
                                            className="w-full rounded-2xl border border-[var(--md-sys-color-outline-variant)]/60 px-3 py-2 text-left text-xs text-[var(--md-sys-color-on-surface)] hover:border-[var(--md-sys-color-primary)]/60"
                                        >
                                            {hook.text}
                                            <span className="mt-0.5 block text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                                                {hook.category}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="rounded-3xl border border-[var(--md-sys-color-outline-variant)]/60 bg-[var(--md-sys-color-surface-container-low)] p-4 text-[10px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
                        Sumber ditampilkan karena Google mensyaratkan atribusi untuk hasil Search grounding.
                        Tren disegarkan otomatis tiap pukul 05.00 dan disimpan 7 hari.
                        <Link href="/studio" className="mt-2 block font-semibold text-[var(--md-sys-color-primary)]">
                            Terapkan di Script Studio →
                        </Link>
                    </div>
                </aside>
            </div>
        </AppLayout>
    );
}
