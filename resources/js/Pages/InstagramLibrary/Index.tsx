import React, { useEffect, useMemo, useState } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import {
    BarChart3,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Eye,
    Images,
    RefreshCw,
    Search,
    TrendingUp,
} from 'lucide-react';
import { AppLayout, type SharedWorkspaceProps } from '@/Layouts/AppLayout';
import { ContentDetailSheet } from '@/Components/ContentDetailSheet';
import { InstagramIcon } from '@/Components/Icons';
import { formatMonthLabel } from '@/Components/MonthNavigator';
import { Button } from '@/Components/UI/Button';
import { ContentIdBadge, FORMAT_GROUPS, PlatformChip } from '@/Components/UI/Semantics';
import {
    runChunkedInstagramSync,
    runMissingInsightsBackfill,
    runQuickNewPostCheck,
    type InstagramSyncMode,
} from '@/lib/instagramSync';
import { useToast } from '@/Components/UI/Toast';
import type { SparcContentItem, SparcTeamMember } from '@/types/sparc';

interface InstagramLibraryPageProps {
    today?: string;
    contentItems?: SparcContentItem[];
    monthOptions?: string[];
    kpi?: {
        totalPosts: number;
        measuredCount: number;
        totalReach: number | null;
        totalViews: number | null;
        avgEr: number | null;
    };
    pagination?: {
        currentPage: number;
        lastPage: number;
        perPage: number;
        total: number;
        from: number;
        to: number;
    };
    filters?: {
        q?: string;
        month?: string;
        format?: string;
        sort?: string;
    };
    archiveSyncState?: {
        savedCursor: string | null;
        dbIgCount: number;
        igMediaCount: number | null;
        missingInsightsCount: number;
    };
    team?: SparcTeamMember[];
}

const PAGE_BATCH_SIZE = 50;

function interactions(item: SparcContentItem): number {
    return (
        (item.likes ?? 0) +
        (item.commentsCount ?? 0) +
        (item.shares ?? 0) +
        (item.saves ?? 0)
    );
}

function erValue(item: SparcContentItem): number | null {
    if (!item.reach || item.reach <= 0) {
        return null;
    }

    return (interactions(item) / item.reach) * 100;
}

function formatEr(item: SparcContentItem): string {
    const val = erValue(item);

    return val === null ? '—' : `${val.toFixed(1)}%`;
}

function metric(value: number | null | undefined): string {
    if (value === null || value === undefined) {
        return '—';
    }

    return value.toLocaleString('id-ID');
}

export default function InstagramLibraryIndex({
    today = '2026-10-27',
    contentItems = [],
    monthOptions: serverMonthOptions,
    kpi: serverKpi,
    pagination: serverPagination,
    filters: serverFilters,
    team = [],
    archiveSyncState,
}: InstagramLibraryPageProps) {
    const { props } = usePage<SharedWorkspaceProps>();
    const can = props.auth?.can;
    const { success: toastSuccess, error: toastError } = useToast();
    const isServerPaginated = Boolean(serverPagination && serverKpi);

    const [searchQuery, setSearchQuery] = useState(serverFilters?.q ?? '');
    const [monthFilter, setMonthFilter] = useState(serverFilters?.month ?? 'all');
    const [formatFilter, setFormatFilter] = useState<'all' | 'reels' | 'feed' | 'carousel'>(
        (serverFilters?.format as 'all' | 'reels' | 'feed' | 'carousel') || 'all'
    );
    const [sortBy, setSortBy] = useState<'newest' | 'reach' | 'views' | 'er'>(
        (serverFilters?.sort as 'newest' | 'reach' | 'views' | 'er') || 'newest'
    );
    const [visibleCount, setVisibleCount] = useState(PAGE_BATCH_SIZE);
    const [activeDetailId, setActiveDetailId] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isSyncingArchive, setIsSyncingArchive] = useState(false);
    const [isBackfillingInsights, setIsBackfillingInsights] = useState(false);
    const [insightsProgress, setInsightsProgress] = useState<{ updated: number; remaining: number } | null>(null);
    const [syncProgressCount, setSyncProgressCount] = useState(0);

    const visitWithQuery = (next: {
        q?: string;
        month?: string;
        format?: string;
        sort?: string;
        page?: number;
    }) => {
        if (!isServerPaginated) {
            return;
        }
        const qVal = (next.q ?? searchQuery).trim();
        const monthVal = next.month ?? monthFilter;
        const formatVal = next.format ?? formatFilter;
        const sortVal = next.sort ?? sortBy;
        const pageVal = next.page ?? 1;

        const params: Record<string, string | number> = {};
        if (qVal !== '') {
            params.q = qVal;
        }
        if (monthVal !== 'all') {
            params.month = monthVal;
        }
        if (formatVal !== 'all') {
            params.format = formatVal;
        }
        if (sortVal !== 'newest') {
            params.sort = sortVal;
        }
        if (pageVal > 1) {
            params.page = pageVal;
        }

        router.get('/instagram/library', params, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    };

    useEffect(() => {
        setVisibleCount(PAGE_BATCH_SIZE);
        if (!isServerPaginated) {
            return;
        }
        if (searchQuery === (serverFilters?.q ?? '')) {
            return;
        }
        const timer = window.setTimeout(() => {
            visitWithQuery({ q: searchQuery, page: 1 });
        }, 350);

        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery]);
    useEffect(() => {
        if (!(can?.editContent || can?.managePublishing)) {
            return;
        }
        let cancelled = false;
        void runQuickNewPostCheck().then((res) => {
            if (!cancelled && res.importedCount > 0) {
                toastSuccess(
                    'Konten Instagram Baru Ditemukan',
                    `${res.importedCount.toLocaleString('id-ID')} postingan baru otomatis ditambahkan ke SPARC.`
                );
                router.reload({ only: ['contentItems', 'kpi', 'pagination', 'monthOptions', 'archiveSyncState'] });
            }
        });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSyncInstagram = async (mode: InstagramSyncMode = 'smart', resetCursor = false) => {
        if (mode === 'archive') {
            setIsSyncingArchive(true);
        } else {
            setIsSyncing(true);
        }
        setSyncProgressCount(0);
        const res = await runChunkedInstagramSync({
            mode,
            resetCursor,
            onProgress: (p) => setSyncProgressCount(p.fetchedCount),
        });
        setIsSyncing(false);
        setIsSyncingArchive(false);
        if (!res.success) {
            toastError(
                res.rateLimited ? 'Jeda Sementara Rate-Limit Meta' : 'Sinkronisasi Gagal',
                res.error || 'Terjadi kesalahan saat menyinkronkan Instagram.'
            );
            router.reload({ only: ['contentItems', 'kpi', 'pagination', 'monthOptions', 'archiveSyncState'] });

            return;
        }
        toastSuccess(
            mode === 'archive' ? 'Penarikan Arsip Instagram Selesai' : 'Sinkronisasi Konten Baru Selesai',
            `${res.syncedCount.toLocaleString('id-ID')} postingan diperbarui (${res.importedCount.toLocaleString('id-ID')} postingan baru diimpor).`
        );
        router.reload();
    };

    const handleBackfillInsights = async () => {
        setIsBackfillingInsights(true);
        setInsightsProgress({ updated: 0, remaining: archiveSyncState?.missingInsightsCount ?? 0 });
        const res = await runMissingInsightsBackfill({
            onProgress: (updated, remaining) => setInsightsProgress({ updated, remaining }),
        });
        setIsBackfillingInsights(false);
        if (!res.success) {
            toastError('Lengkapi Insights Terhenti', res.error || 'Terjadi kesalahan saat mengambil insights.');
        } else {
            toastSuccess(
                'Insights Arsip Diperbarui',
                `${res.updatedCount.toLocaleString('id-ID')} postingan berhasil dilengkapi metrik Reach/Views.`
            );
        }
        router.reload();
    };

    const monthOptions = useMemo(() => {
        if (serverMonthOptions && serverMonthOptions.length > 0) {
            return serverMonthOptions;
        }
        const set = new Set<string>();
        contentItems.forEach((item) => {
            const ym = (item.publishDate || '').slice(0, 7);
            if (/^\d{4}-\d{2}$/.test(ym)) {
                set.add(ym);
            }
        });

        return Array.from(set).sort((a, b) => b.localeCompare(a));
    }, [serverMonthOptions, contentItems]);

    const filteredItems = useMemo(() => {
        if (isServerPaginated) {
            return contentItems;
        }
        const q = searchQuery.trim().toLowerCase();

        const filtered = contentItems.filter((item) => {
            if (monthFilter !== 'all' && (item.publishDate || '').slice(0, 7) !== monthFilter) {
                return false;
            }
            if (
                formatFilter !== 'all' &&
                !FORMAT_GROUPS[formatFilter].includes((item.format || '').toLowerCase())
            ) {
                return false;
            }
            if (q !== '') {
                const inTitle = item.title.toLowerCase().includes(q);
                const inCaption = (item.caption || '').toLowerCase().includes(q);
                const inCode = item.contentId.toLowerCase().includes(q);
                if (!inTitle && !inCaption && !inCode) {
                    return false;
                }
            }

            return true;
        });

        if (sortBy === 'newest') {
            return filtered;
        }

        return [...filtered].sort((a, b) => {
            if (sortBy === 'reach') {
                return (b.reach ?? -1) - (a.reach ?? -1);
            }
            if (sortBy === 'views') {
                return (b.views ?? 0) - (a.views ?? 0);
            }

            return (erValue(b) ?? -1) - (erValue(a) ?? -1);
        });
    }, [isServerPaginated, contentItems, searchQuery, monthFilter, formatFilter, sortBy]);

    const kpi = useMemo(() => {
        if (serverKpi) {
            return {
                totalPosts: serverKpi.totalPosts,
                totalReach: serverKpi.totalReach !== null ? serverKpi.totalReach.toLocaleString('id-ID') : '—',
                measuredCount: serverKpi.measuredCount,
                totalViews: serverKpi.totalViews !== null ? serverKpi.totalViews.toLocaleString('id-ID') : '—',
                avgEr: serverKpi.avgEr !== null ? `${serverKpi.avgEr.toFixed(1)}%` : '—',
            };
        }
        const reachItems = filteredItems.filter((i) => i.reach !== null && i.reach !== undefined);
        const totalReach = reachItems.reduce((sum, i) => sum + (i.reach ?? 0), 0);
        const totalViews = filteredItems.reduce((sum, i) => sum + (i.views ?? 0), 0);
        const erEligible = filteredItems.filter((i) => (i.reach ?? 0) > 0);
        const erReachSum = erEligible.reduce((sum, i) => sum + (i.reach ?? 0), 0);
        const erInteractionSum = erEligible.reduce((sum, i) => sum + interactions(i), 0);

        return {
            totalPosts: filteredItems.length,
            totalReach: reachItems.length > 0 ? totalReach.toLocaleString('id-ID') : '—',
            measuredCount: reachItems.length,
            totalViews: filteredItems.length > 0 ? totalViews.toLocaleString('id-ID') : '—',
            avgEr: erReachSum > 0 ? `${((erInteractionSum / erReachSum) * 100).toFixed(1)}%` : '—',
        };
    }, [serverKpi, filteredItems]);

    const visibleItems = useMemo(
        () => (isServerPaginated ? filteredItems : filteredItems.slice(0, visibleCount)),
        [isServerPaginated, filteredItems, visibleCount]
    );
    const remainingCount = isServerPaginated
        ? 0
        : Math.max(0, filteredItems.length - visibleItems.length);
    const activeDetailItem = useMemo(
        () => (activeDetailId ? contentItems.find((i) => i.id === activeDetailId) ?? null : null),
        [activeDetailId, contentItems]
    );

    return (
        <AppLayout
            title="Konten Instagram"
            subtitle="Seluruh postingan Instagram yang ditarik dari Meta beserta statistik performanya"
            actions={
                (can?.editContent || can?.managePublishing) && (
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={isSyncing || isSyncingArchive || isBackfillingInsights}
                            isLoading={isSyncing}
                            icon={<RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />}
                            onClick={() => handleSyncInstagram('smart')}
                        >
                            {isSyncing && syncProgressCount > 0 ? `Cek Terbaru (${syncProgressCount})...` : 'Sync Konten Baru'}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isSyncing || isSyncingArchive || isBackfillingInsights}
                            isLoading={isSyncingArchive}
                            icon={<RefreshCw className={`w-3.5 h-3.5 ${isSyncingArchive ? 'animate-spin' : ''}`} />}
                            onClick={() => handleSyncInstagram('archive')}
                        >
                            {isSyncingArchive
                                ? `Menarik Arsip (${syncProgressCount})...`
                                : archiveSyncState?.savedCursor
                                    ? 'Lanjutkan Arsip IG'
                                    : 'Tarik Semua Arsip'}
                        </Button>
                    </div>
                )
            }
        >
            <Head title="Konten Instagram — SPARC" />

            <div className="space-y-5 min-w-0">
                {archiveSyncState && (archiveSyncState.savedCursor || (archiveSyncState.igMediaCount !== null && archiveSyncState.dbIgCount < archiveSyncState.igMediaCount) || archiveSyncState.missingInsightsCount > 0) && (
                    <div className="p-3.5 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="space-y-0.5">
                            <div className="font-bold text-[var(--md-sys-color-on-surface)]">
                                Status Sinkronisasi Arsip:{' '}
                                <span className="sparc-code-id text-[var(--md-sys-color-primary)]">
                                    {archiveSyncState.dbIgCount.toLocaleString('id-ID')}
                                    {archiveSyncState.igMediaCount ? ` / ${archiveSyncState.igMediaCount.toLocaleString('id-ID')}` : ''}
                                </span>{' '}
                                postingan IG tersimpan di SPARC
                            </div>
                            <div className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                {archiveSyncState.savedCursor
                                    ? 'Ada posisi arsip tersimpan — klik "Lanjutkan Arsip IG" untuk melanjutkan dari postingan berikutnya tanpa mengulang dari awal.'
                                    : archiveSyncState.missingInsightsCount > 0
                                        ? `${archiveSyncState.missingInsightsCount.toLocaleString('id-ID')} postingan arsip belum memiliki data Reach/Views (klik "Lengkapi Reach/Views" untuk menarik bertahap).`
                                        : 'Klik "Tarik Semua Arsip" untuk mengambil sisa postingan lama secara cepat tanpa timeout.'}
                            </div>
                        </div>
                        {(can?.editContent || can?.managePublishing) && (
                            <div className="flex flex-wrap items-center gap-2">
                                {archiveSyncState.savedCursor && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={isSyncing || isSyncingArchive}
                                        onClick={() => handleSyncInstagram('archive', true)}
                                    >
                                        Mulai Arsip dari Awal
                                    </Button>
                                )}
                                {archiveSyncState.missingInsightsCount > 0 && (
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        disabled={isSyncing || isSyncingArchive || isBackfillingInsights}
                                        isLoading={isBackfillingInsights}
                                        onClick={handleBackfillInsights}
                                    >
                                        {isBackfillingInsights && insightsProgress
                                            ? `Insights +${insightsProgress.updated} (sisa ${insightsProgress.remaining})...`
                                            : `Lengkapi Reach/Views (${archiveSyncState.missingInsightsCount.toLocaleString('id-ID')})`}
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                )}
                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                        <div className="flex items-center justify-between">
                            <span className="sparc-eyebrow">Total Postingan</span>
                            <Images className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                        </div>
                        <p className="sparc-code-id text-2xl font-black text-[var(--md-sys-color-on-surface)] mt-1.5">
                            {kpi.totalPosts.toLocaleString('id-ID')}
                        </p>
                        <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] mt-1">
                            Sesuai filter saat ini
                        </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                        <div className="flex items-center justify-between">
                            <span className="sparc-eyebrow">Total Reach</span>
                            <TrendingUp className="w-4 h-4 text-[var(--md-sys-color-secondary)]" />
                        </div>
                        <p className="sparc-code-id text-2xl font-black text-[var(--md-sys-color-on-surface)] mt-1.5">
                            {kpi.totalReach}
                        </p>
                        <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] mt-1">
                            Dari {kpi.measuredCount.toLocaleString('id-ID')} postingan terukur
                        </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                        <div className="flex items-center justify-between">
                            <span className="sparc-eyebrow">Total Views</span>
                            <Eye className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                        </div>
                        <p className="sparc-code-id text-2xl font-black text-[var(--md-sys-color-on-surface)] mt-1.5">
                            {kpi.totalViews}
                        </p>
                        <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] mt-1">
                            Akumulasi tayangan Reels &amp; Feed
                        </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                        <div className="flex items-center justify-between">
                            <span className="sparc-eyebrow">Rata-rata ER</span>
                            <BarChart3 className="w-4 h-4 text-[var(--md-sys-color-tertiary)]" />
                        </div>
                        <p className="sparc-code-id text-2xl font-black text-[var(--md-sys-color-on-surface)] mt-1.5">
                            {kpi.avgEr}
                        </p>
                        <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] mt-1">
                            (Likes + Komentar + Share + Save) / Reach
                        </p>
                    </div>
                </div>

                {/* Search & Facet Filter Toolbar */}
                <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-3.5 rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] flex flex-wrap items-center gap-2.5">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--md-sys-color-on-surface-muted)] pointer-events-none" />
                        <input
                            type="search"
                            aria-label="Cari judul, caption, atau kode SPARC"
                            placeholder="Cari judul, caption, atau SPARC-2026-XXXX..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-9 pl-9 pr-3 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 focus:border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-muted)]"
                        />
                    </div>

                    <select
                        aria-label="Filter bulan tayang"
                        value={monthFilter}
                        onChange={(e) => {
                            const v = e.target.value;
                            setMonthFilter(v);
                            visitWithQuery({ month: v, page: 1 });
                        }}
                        className="h-9 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 text-[var(--md-sys-color-on-surface)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 cursor-pointer capitalize"
                    >
                        <option value="all">Semua Bulan</option>
                        {monthOptions.map((ym) => (
                            <option key={ym} value={ym}>
                                {formatMonthLabel(ym)}
                            </option>
                        ))}
                    </select>

                    <select
                        aria-label="Filter format konten"
                        value={formatFilter}
                        onChange={(e) => {
                            const v = e.target.value as typeof formatFilter;
                            setFormatFilter(v);
                            visitWithQuery({ format: v, page: 1 });
                        }}
                        className="h-9 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 text-[var(--md-sys-color-on-surface)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 cursor-pointer"
                    >
                        <option value="all">Format: Semua</option>
                        <option value="reels">Reels / Video</option>
                        <option value="feed">Feed / Single</option>
                        <option value="carousel">Carousel</option>
                    </select>

                    <select
                        aria-label="Urutkan postingan"
                        value={sortBy}
                        onChange={(e) => {
                            const v = e.target.value as typeof sortBy;
                            setSortBy(v);
                            visitWithQuery({ sort: v, page: 1 });
                        }}
                        className="h-9 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 text-[var(--md-sys-color-on-surface)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 cursor-pointer"
                    >
                        <option value="newest">Urutkan: Terbaru</option>
                        <option value="reach">Urutkan: Reach Tertinggi</option>
                        <option value="views">Urutkan: Views Tertinggi</option>
                        <option value="er">Urutkan: ER Tertinggi</option>
                    </select>
                </div>

                {/* Instagram Library Table */}
                {kpi.totalPosts === 0 && !searchQuery && monthFilter === 'all' && formatFilter === 'all' ? (
                    <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] p-12 text-center space-y-2 shadow-[var(--md-elevation-1)]">
                        <Images className="w-9 h-9 text-[var(--md-sys-color-on-surface-muted)] mx-auto" />
                        <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                            Belum ada konten Instagram yang ditarik. Klik Sync Instagram untuk menarik postingan dari Meta.
                        </p>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] p-12 text-center space-y-2 shadow-[var(--md-elevation-1)]">
                        <Search className="w-9 h-9 text-[var(--md-sys-color-on-surface-muted)] mx-auto" />
                        <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                            Tidak ada postingan yang cocok dengan filter.
                        </p>
                    </div>
                ) : (
                    <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">
                                        <th className="py-3 px-4">Thumbnail</th>
                                        <th className="py-3 px-3">Konten</th>
                                        <th className="py-3 px-3">Format</th>
                                        <th className="py-3 px-3 text-right">Reach</th>
                                        <th className="py-3 px-3 text-right">Views</th>
                                        <th className="py-3 px-3 text-right">Likes</th>
                                        <th className="py-3 px-3 text-right">Komentar</th>
                                        <th className="py-3 px-3 text-right">Share</th>
                                        <th className="py-3 px-3 text-right">Save</th>
                                        <th className="py-3 px-3 text-right">ER</th>
                                        <th className="py-3 px-4 text-right">Tautan</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]/60">
                                    {visibleItems.map((item) => {
                                        const er = formatEr(item);
                                        return (
                                            <tr
                                                key={item.id}
                                                onClick={() => setActiveDetailId(item.id)}
                                                className="notion-row cursor-pointer"
                                            >
                                                <td className="py-2.5 px-4 w-16">
                                                    {item.igThumbnailUrl ? (
                                                        <img
                                                            src={item.igThumbnailUrl}
                                                            alt={item.title}
                                                            loading="lazy"
                                                            className="w-12 h-12 rounded-lg object-cover border border-[var(--md-sys-color-outline-variant)]"
                                                        />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-lg bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] flex items-center justify-center text-[var(--md-sys-color-on-surface-muted)]">
                                                            <InstagramIcon className="w-5 h-5" />
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-3 min-w-[240px] max-w-sm">
                                                    <div className="flex items-center gap-1.5 mb-0.5">
                                                        <ContentIdBadge contentId={item.contentId} />
                                                        <span className="sparc-code-id text-[10px] text-[var(--md-sys-color-on-surface-muted)]">
                                                            {item.publishDate || '—'}
                                                            {item.publishTime ? ` ${item.publishTime}` : ''}
                                                        </span>
                                                    </div>
                                                    <div className="font-bold text-[var(--md-sys-color-on-surface)] line-clamp-1">
                                                        {item.title}
                                                    </div>
                                                </td>
                                                <td className="py-2.5 px-3 whitespace-nowrap">
                                                    <PlatformChip platform={item.platform} format={item.format} />
                                                </td>
                                                <td className="py-2.5 px-3 text-right sparc-code-id font-semibold text-[var(--md-sys-color-on-surface)]">
                                                    {metric(item.reach)}
                                                </td>
                                                <td className="py-2.5 px-3 text-right sparc-code-id text-[var(--md-sys-color-on-surface-variant)]">
                                                    {metric(item.views)}
                                                </td>
                                                <td className="py-2.5 px-3 text-right sparc-code-id text-[var(--md-sys-color-on-surface-variant)]">
                                                    {metric(item.likes)}
                                                </td>
                                                <td className="py-2.5 px-3 text-right sparc-code-id text-[var(--md-sys-color-on-surface-variant)]">
                                                    {metric(item.commentsCount)}
                                                </td>
                                                <td className="py-2.5 px-3 text-right sparc-code-id text-[var(--md-sys-color-on-surface-variant)]">
                                                    {metric(item.shares)}
                                                </td>
                                                <td className="py-2.5 px-3 text-right sparc-code-id text-[var(--md-sys-color-on-surface-variant)]">
                                                    {metric(item.saves)}
                                                </td>
                                                <td
                                                    className={`py-2.5 px-3 text-right sparc-code-id font-bold ${
                                                        er === '—'
                                                            ? 'text-[var(--md-sys-color-on-surface-muted)]'
                                                            : 'text-[var(--md-sys-color-secondary)]'
                                                    }`}
                                                >
                                                    {er}
                                                </td>
                                                <td className="py-2.5 px-4 text-right whitespace-nowrap">
                                                    {item.publishedUrl && (
                                                        <a
                                                            href={item.publishedUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            aria-label={`Buka postingan ${item.title} di Instagram`}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="inline-flex items-center justify-center p-1.5 rounded-lg text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary-container)]/40 transition-colors"
                                                        >
                                                            <ExternalLink className="w-4 h-4" />
                                                        </a>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {isServerPaginated && serverPagination ? (
                            <div className="px-4 py-3 border-t border-[var(--md-sys-color-outline-variant)] flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span className="text-[var(--md-sys-color-on-surface-muted)]">
                                    Menampilkan{' '}
                                    <strong className="sparc-code-id text-[var(--md-sys-color-on-surface)]">
                                        {serverPagination.from.toLocaleString('id-ID')}–{serverPagination.to.toLocaleString('id-ID')}
                                    </strong>{' '}
                                    dari{' '}
                                    <strong className="sparc-code-id text-[var(--md-sys-color-on-surface)]">
                                        {serverPagination.total.toLocaleString('id-ID')}
                                    </strong>{' '}
                                    postingan • Halaman {serverPagination.currentPage} dari {serverPagination.lastPage}
                                </span>
                                {serverPagination.lastPage > 1 && (
                                    <div className="inline-flex items-center gap-1.5">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            disabled={serverPagination.currentPage <= 1}
                                            icon={<ChevronLeft className="w-3.5 h-3.5" />}
                                            onClick={() => visitWithQuery({ page: serverPagination.currentPage - 1 })}
                                        >
                                            Sebelumnya
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            disabled={serverPagination.currentPage >= serverPagination.lastPage}
                                            onClick={() => visitWithQuery({ page: serverPagination.currentPage + 1 })}
                                        >
                                            Berikutnya
                                            <ChevronRight className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            remainingCount > 0 && (
                                <div className="p-4 border-t border-[var(--md-sys-color-outline-variant)] flex justify-center">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setVisibleCount((c) => c + PAGE_BATCH_SIZE)}
                                    >
                                        Tampilkan {PAGE_BATCH_SIZE} lagi (sisa {remainingCount.toLocaleString('id-ID')})
                                    </Button>
                                </div>
                            )
                        )}
                    </div>
                )}
            </div>

            <ContentDetailSheet
                item={activeDetailItem}
                today={today}
                team={team}
                onClose={() => setActiveDetailId(null)}
            />
        </AppLayout>
    );
}
