import React, { useMemo, useState } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    AlertCircle,
    BarChart3,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    Copy,
    DollarSign,
    Download,
    ExternalLink,
    Eye,
    FileSpreadsheet,
    Globe,
    History,
    Layers,
    MapPin,
    Megaphone,
    MousePointerClick,
    PieChart,
    Plus,
    RefreshCw,
    RotateCcw,
    Sparkles,
    Tag,
    TrendingUp,
    Upload,
    Users,
    Video,
} from 'lucide-react';
import { AppLayout, type SharedWorkspaceProps } from '@/Layouts/AppLayout';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
import { Modal } from '@/Components/UI/Modal';
import { Select } from '@/Components/UI/Select';
import {
    ContentIdBadge,
    FORMAT_GROUPS,
    normalizeWorkflowStatus,
    PillarTag,
    PlatformChip,
    RoleBadge,
    StatusChip,
    WORKFLOW_STATUS_META,
    type CanonicalWorkflowStatus,
} from '@/Components/UI/Semantics';
import { Tabs } from '@/Components/UI/Tabs';
import { Textarea } from '@/Components/UI/Textarea';
import { useToast } from '@/Components/UI/Toast';
import { copyToClipboard } from '@/lib/utils';
import type {
    SparcContentItem,
    SparcPublication,
    SparcSystemSettings,
    SparcTeamMember,
} from '@/types/sparc';

export interface ReportPageProps {
    today?: string;
    contentItems?: SparcContentItem[];
    publications?: SparcPublication[];
    team?: SparcTeamMember[];
    pageTitle?: string;
    instagramSettings?: SparcSystemSettings['instagram'];
}

const CSV_TEMPLATE =
    'content_id,platform,reach,impressions,views,likes,comments,shares,saves,clicks\nSPARC-2026-0001,instagram,28400,36900,45200,2640,148,510,920,310';

function formatNullableMetric(value: number | null | undefined): string {
    if (value === null || value === undefined) {
        return '—';
    }
    return value.toLocaleString('id-ID');
}

function publicationDate(pub: SparcPublication): string {
    const raw = pub.publishedActualAt || pub.scheduledAt || '';
    return raw.length >= 10 ? raw.slice(0, 10) : '';
}

function computeEngagementRate(pub: SparcPublication): string {
    const m = pub.metrics;
    if (!m || m.reach === null || m.reach <= 0) {
        return '—';
    }
    const interactions =
        (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
    return `${((interactions / m.reach) * 100).toFixed(1)}%`;
}
export default function ReportIndex({
    today = '2026-10-27',
    contentItems = [],
    publications = [],
    team = [],
    pageTitle = 'Performance Report',
    instagramSettings,
}: ReportPageProps) {
    const { props } = usePage<SharedWorkspaceProps>();
    const can = props.auth?.can;
    const { success: toastSuccess, error: toastError } = useToast();

    const [activeLayer, setActiveLayer] = useState<'content' | 'ads' | 'creator' | 'operational' | 'team'>('content');
    const [isSyncingAds, setIsSyncingAds] = useState(false);
    const [selectedAdAccountId, setSelectedAdAccountId] = useState('');
    const [adsDatePreset, setAdsDatePreset] = useState('last_30d');
    const [isSyncingDemographics, setIsSyncingDemographics] = useState(false);
    const [isSyncingStories, setIsSyncingStories] = useState(false);
    const [isSyncingMentions, setIsSyncingMentions] = useState(false);
    const [platformFilter, setPlatformFilter] = useState('all');
    const [formatFilter, setFormatFilter] = useState<'all' | 'reels' | 'feed' | 'carousel'>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [manualModalOpen, setManualModalOpen] = useState(false);
    const [csvModalOpen, setCsvModalOpen] = useState(false);

    const [isSyncingIg, setIsSyncingIg] = useState(false);
    const [isSyncingIgProfile, setIsSyncingIgProfile] = useState(false);

    const igAccount = instagramSettings ?? props.instagramStatus;

    const handleSyncIgAccountInsights = () => {
        setIsSyncingIgProfile(true);
        router.post(
            '/settings/instagram/sync-profile',
            {},
            {
                preserveScroll: true,
                onFinish: () => setIsSyncingIgProfile(false),
            }
        );
    };

    const handleSyncInstagram = () => {
        setIsSyncingIg(true);
        router.post(
            '/content/instagram/sync-all',
            {},
            {
                preserveScroll: true,
                onFinish: () => setIsSyncingIg(false),
            }
        );
    };
    const handleSyncAds = (overrideAccountId?: string, overridePreset?: string) => {
        setIsSyncingAds(true);
        const payload: Record<string, string> = {
            date_preset: overridePreset ?? adsDatePreset,
        };
        const targetAcc = overrideAccountId ?? (selectedAdAccountId || igAccount?.adsData?.active_account?.account_id || '');
        if (targetAcc) {
            payload.ad_account_id = targetAcc;
        }
        router.post(
            '/settings/instagram/sync-ads',
            payload,
            {
                preserveScroll: true,
                onFinish: () => setIsSyncingAds(false),
            }
        );
    };

    const handleSyncDemographics = () => {
        setIsSyncingDemographics(true);
        router.post(
            '/settings/instagram/sync-demographics',
            {},
            {
                preserveScroll: true,
                onFinish: () => setIsSyncingDemographics(false),
            }
        );
    };

    const handleSyncStories = () => {
        setIsSyncingStories(true);
        router.post(
            '/settings/instagram/sync-stories',
            {},
            {
                preserveScroll: true,
                onFinish: () => setIsSyncingStories(false),
            }
        );
    };

    const handleSyncMentions = () => {
        setIsSyncingMentions(true);
        router.post(
            '/settings/instagram/sync-mentions',
            {},
            {
                preserveScroll: true,
                onFinish: () => setIsSyncingMentions(false),
            }
        );
    };
    const filteredPubs = useMemo(
        () =>
            publications.filter((p) => {
                if (platformFilter !== 'all' && p.platform !== platformFilter) {
                    return false;
                }
                if (
                    formatFilter !== 'all' &&
                    !FORMAT_GROUPS[formatFilter].includes((p.format || '').toLowerCase())
                ) {
                    return false;
                }
                if (dateFrom || dateTo) {
                    const d = publicationDate(p);
                    if (!d) {
                        return false;
                    }
                    if (dateFrom && d < dateFrom) {
                        return false;
                    }
                    if (dateTo && d > dateTo) {
                        return false;
                    }
                }
                return true;
            }),
        [publications, platformFilter, formatFilter, dateFrom, dateTo]
    );

    // Aggregate KPI metrics strictly from non-null recorded rows
    const kpiSummary = useMemo(() => {
        const measured = filteredPubs.filter((p) => p.metrics !== null && p.metrics.reach !== null);
        const unmeasuredCount = filteredPubs.length - measured.length;

        const totalReach = measured.reduce((sum, p) => sum + (p.metrics?.reach ?? 0), 0);
        const totalViews = measured.reduce((sum, p) => sum + (p.metrics?.views ?? 0), 0);
        const totalInteractions = measured.reduce(
            (sum, p) =>
                sum +
                (p.metrics?.likes ?? 0) +
                (p.metrics?.comments ?? 0) +
                (p.metrics?.shares ?? 0) +
                (p.metrics?.saves ?? 0),
            0
        );
        const avgEr =
            totalReach > 0 ? `${((totalInteractions / totalReach) * 100).toFixed(1)}%` : '—';

        return {
            measuredCount: measured.length,
            unmeasuredCount,
            totalReach: measured.length > 0 ? totalReach.toLocaleString('id-ID') : '—',
            totalViews: measured.length > 0 ? totalViews.toLocaleString('id-ID') : '—',
            totalInteractions:
                measured.length > 0 ? totalInteractions.toLocaleString('id-ID') : '—',
            avgEr,
        };
    }, [filteredPubs]);

    // Channel Reach Breakdown for readable bar visualization
    const channelStats = useMemo(() => {
        const map: Record<string, { platform: string; reach: number; posts: number }> = {};
        filteredPubs.forEach((p) => {
            if (!map[p.platform]) {
                map[p.platform] = { platform: p.platform, reach: 0, posts: 0 };
            }
            map[p.platform].posts += 1;
            if (p.metrics?.reach) {
                map[p.platform].reach += p.metrics.reach;
            }
        });
        const list = Object.values(map).sort((a, b) => b.reach - a.reach);
        const maxReach = Math.max(1, ...list.map((c) => c.reach));
        return list.map((c) => ({ ...c, pct: Math.round((c.reach / maxReach) * 100) }));
    }, [filteredPubs]);

    // Operational stage & pillar counts
    const operationalSummary = useMemo(() => {
        const stages: CanonicalWorkflowStatus[] = [
            'inbox',
            'briefing',
            'in_progress',
            'review_approval',
            'ready_to_publish',
            'published',
        ];
        const byStage = stages.map((st) => ({
            status: st,
            label: WORKFLOW_STATUS_META[st].label,
            count: contentItems.filter((i) => normalizeWorkflowStatus(i.status) === st).length,
        }));

        const pillarMap: Record<string, number> = {};
        contentItems.forEach((i) => {
            pillarMap[i.pillar] = (pillarMap[i.pillar] ?? 0) + 1;
        });

        const overdueCount = contentItems.filter(
            (i) =>
                normalizeWorkflowStatus(i.status) !== 'published' &&
                Boolean(i.productionDeadline) &&
                i.productionDeadline < today
        ).length;

        const onTimeRate =
            contentItems.length > 0
                ? Math.round(((contentItems.length - overdueCount) / contentItems.length) * 100)
                : 100;

        return {
            byStage,
            pillars: Object.entries(pillarMap).sort((a, b) => b[1] - a[1]),
            overdueCount,
            onTimeRate,
        };
    }, [contentItems, today]);

    const reelsItems = useMemo(
        () =>
            contentItems.filter((i) =>
                FORMAT_GROUPS.reels.includes((i.format || '').toLowerCase())
            ),
        [contentItems]
    );
    const [reelsPageSize, setReelsPageSize] = useState<number>(15);
    const [reelsPage, setReelsPage] = useState<number>(1);
    const totalReelsPages = reelsPageSize === 0 ? 1 : Math.max(1, Math.ceil(reelsItems.length / reelsPageSize));
    const safeReelsPage = Math.min(reelsPage, totalReelsPages);
    const visibleReelsItems = useMemo(() => {
        if (reelsPageSize === 0) {
            return reelsItems;
        }
        const start = (safeReelsPage - 1) * reelsPageSize;

        return reelsItems.slice(start, start + reelsPageSize);
    }, [reelsItems, reelsPageSize, safeReelsPage]);

    // Manual Metric Form (`POST /report/metrics`)
    const metricForm = useForm({
        publication_id: publications[0]?.id ?? '',
        reach: '',
        impressions: '',
        views: '',
        likes: '',
        comments: '',
        shares: '',
        saves: '',
        clicks: '',
    });

    const openManualForPub = (pub?: SparcPublication) => {
        metricForm.clearErrors();
        const target = pub ?? publications[0];
        metricForm.setData({
            publication_id: target?.id ?? '',
            reach: target?.metrics?.reach !== null && target?.metrics?.reach !== undefined ? String(target.metrics.reach) : '',
            impressions:
                target?.metrics?.impressions !== null && target?.metrics?.impressions !== undefined
                    ? String(target.metrics.impressions)
                    : '',
            views: target?.metrics?.views !== null && target?.metrics?.views !== undefined ? String(target.metrics.views) : '',
            likes: target?.metrics?.likes !== null && target?.metrics?.likes !== undefined ? String(target.metrics.likes) : '',
            comments:
                target?.metrics?.comments !== null && target?.metrics?.comments !== undefined
                    ? String(target.metrics.comments)
                    : '',
            shares: target?.metrics?.shares !== null && target?.metrics?.shares !== undefined ? String(target.metrics.shares) : '',
            saves: target?.metrics?.saves !== null && target?.metrics?.saves !== undefined ? String(target.metrics.saves) : '',
            clicks: target?.metrics?.clicks !== null && target?.metrics?.clicks !== undefined ? String(target.metrics.clicks) : '',
        });
        setManualModalOpen(true);
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        metricForm.post('/report/metrics', {
            preserveScroll: true,
            onSuccess: () => {
                setManualModalOpen(false);
            },
            onError: () => {
                toastError('Validasi Metrik Gagal', 'Pastikan angka metrik bernilai positif atau kosongkan jika belum diukur.');
            },
        });
    };

    // Excel / Tabular Import Form (`POST /report/metrics/import-excel`)
    const [showPasteFallback, setShowPasteFallback] = useState(false);
    const excelForm = useForm<{
        excel_file: File | null;
        csv_text: string;
    }>({
        excel_file: null,
        csv_text: '',
    });

    const handleExcelSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        excelForm.post('/report/metrics/import-excel', {
            preserveScroll: true,
            forceFormData: true,
            onSuccess: () => {
                setCsvModalOpen(false);
                excelForm.reset();
            },
            onError: (errors) => {
                toastError(
                    'Impor Excel Belum Cocok',
                    errors.excel_file ||
                        errors.csv_text ||
                        'Periksa kecocokan Kode Konten dan nama Platform pada berkas Excel Anda.'
                );
            },
        });
    };

    const handleDownloadExcelReport = () => {
        const params = new URLSearchParams({
            platform: platformFilter,
            format: formatFilter,
            layer: activeLayer,
        });
        if (dateFrom) params.set('date_from', dateFrom);
        if (dateTo) params.set('date_to', dateTo);
        const downloadUrl = `/report/export-excel?${params.toString()}`;
        try {
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `Laporan-Performa-SPARC-${today}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch {
            window.location.href = downloadUrl;
        }
        toastSuccess(
            'Laporan Excel (.xlsx) Diunduh',
            'Berkas Excel rapi berisi 5 lembar kerja (Performa, Wawasan, Iklan, Operasional & Tim) sedang diunduh.'
        );
    };

    const handleDownloadExcelTemplate = () => {
        const templateUrl = '/report/template-excel';
        try {
            const a = document.createElement('a');
            a.href = templateUrl;
            a.download = `Template-Impor-Metrik-SPARC-${today}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch {
            window.location.href = templateUrl;
        }
        toastSuccess(
            'Template Excel (.xlsx) Diunduh',
            'Silakan isi angka capaian pada kolom hijau di Excel lalu unggah kembali.'
        );
    };

    const handleCopyTemplate = async () => {
        const ok = await copyToClipboard(CSV_TEMPLATE);
        if (ok) {
            toastSuccess('Contoh Baris Disalin', 'Format baris siap ditempelkan ke spreadsheet Anda.');
        }
    };

    return (
        <AppLayout
            title={pageTitle}
            subtitle="Pelaporan 3-lapis HUMAS — performa distribusi lintas kanal, ketepatan produksi konten, dan beban kerja tim"
            actions={
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        icon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                        onClick={handleDownloadExcelReport}
                        title="Unduh laporan lengkap dalam format Microsoft Excel (.xlsx) multi-sheet yang rapi"
                    >
                        Ekspor Excel
                    </Button>
                    {can?.managePublishing && (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                icon={
                                    <RefreshCw
                                        className={`w-3.5 h-3.5 text-purple-600 dark:text-purple-400 ${
                                            isSyncingIg ? 'animate-spin' : ''
                                        }`}
                                    />
                                }
                                isLoading={isSyncingIg}
                                onClick={handleSyncInstagram}
                                title="Sinkronisasi seluruh postingan Instagram dari Meta Graph API"
                            >
                                Sync Metrik IG
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                icon={<Upload className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                                onClick={() => {
                                    excelForm.clearErrors();
                                    setCsvModalOpen(true);
                                }}
                            >
                                Impor Excel
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                icon={<Plus className="w-3.5 h-3.5" />}
                                onClick={() => openManualForPub()}
                            >
                                Input Metrik
                            </Button>
                        </>
                    )}
                </div>
            }
        >
            <Head title={`${pageTitle} - SPARC`} />

            <div className="space-y-5">
                {/* 3-Layer Report Navigation */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <Tabs
                        tabs={[
                            { id: 'content', label: 'Performa Konten' },
                            { id: 'ads', label: 'Monitoring Iklan (Meta Ads)' },
                            { id: 'creator', label: 'Wawasan Kreator & Demografi' },
                            { id: 'operational', label: 'Operasional Produksi' },
                            { id: 'team', label: 'Kinerja & Beban Tim' },
                        ]}
                        activeTab={activeLayer}
                        onChange={(id) => setActiveLayer(id as typeof activeLayer)}
                    />

                    {activeLayer === 'content' && (
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                aria-label="Filter kanal pada laporan"
                                value={platformFilter}
                                onChange={(e) => setPlatformFilter(e.target.value)}
                                className="h-9 text-xs bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 text-[var(--md-sys-color-on-surface)] font-medium cursor-pointer"
                            >
                                <option value="all">Kanal: Semua Platform</option>
                                <option value="instagram">Instagram</option>
                                <option value="tiktok">TikTok</option>
                                <option value="youtube">YouTube</option>
                                <option value="website">Website Resmi</option>
                                <option value="whatsapp">WhatsApp</option>
                            </select>

                            <select
                                aria-label="Filter format konten"
                                value={formatFilter}
                                onChange={(e) => setFormatFilter(e.target.value as typeof formatFilter)}
                                className="h-9 text-xs bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 text-[var(--md-sys-color-on-surface)] font-medium cursor-pointer"
                            >
                                <option value="all">Format: Semua</option>
                                <option value="reels">Reels / Video</option>
                                <option value="feed">Feed (Single)</option>
                                <option value="carousel">Carousel</option>
                            </select>

                            <div className="flex items-center gap-1.5 bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 h-9">
                                <input
                                    type="date"
                                    aria-label="Tanggal dari"
                                    value={dateFrom}
                                    max={dateTo || undefined}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="bg-transparent text-xs text-[var(--md-sys-color-on-surface)] outline-none cursor-pointer"
                                    title="Tanggal Mulai"
                                />
                                <span className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] font-medium select-none">
                                    s/d
                                </span>
                                <input
                                    type="date"
                                    aria-label="Tanggal sampai"
                                    value={dateTo}
                                    min={dateFrom || undefined}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="bg-transparent text-xs text-[var(--md-sys-color-on-surface)] outline-none cursor-pointer"
                                    title="Tanggal Selesai"
                                />
                            </div>

                            {(platformFilter !== 'all' || formatFilter !== 'all' || dateFrom || dateTo) && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    icon={<RotateCcw className="w-3.5 h-3.5" />}
                                    onClick={() => {
                                        setPlatformFilter('all');
                                        setFormatFilter('all');
                                        setDateFrom('');
                                        setDateTo('');
                                    }}
                                    className="text-xs"
                                >
                                    Reset
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                {/* =========================================================
                    LAYER 1: CONTENT PERFORMANCE REPORT (NULL !== 0)
                   ========================================================= */}
                {activeLayer === 'content' && (
                    <div className="space-y-5">
                        {/* Instagram Business 28-Day Insights & Best Posting Hours Banner */}
                        {igAccount?.connected && (
                            <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-amber-500/10 border border-purple-500/25 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                <div className="space-y-1.5 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                        <span className="text-xs font-extrabold text-[var(--md-sys-color-on-surface)]">
                                            Wawasan Akun Instagram @{igAccount.username || 'instansi'} (28 Hari Terakhir)
                                        </span>
                                        {igAccount.followersCount !== null && igAccount.followersCount !== undefined && (
                                            <span className="sparc-code-id px-2 py-0.5 rounded-full text-[11px] font-bold bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)]">
                                                {igAccount.followersCount.toLocaleString('id-ID')} Pengikut
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                        <span>
                                            Reach Akun:{' '}
                                            <strong className="sparc-code-id text-[var(--md-sys-color-on-surface)]">
                                                {igAccount.accountInsights?.reach_28d !== undefined &&
                                                igAccount.accountInsights.reach_28d !== null
                                                    ? igAccount.accountInsights.reach_28d.toLocaleString('id-ID')
                                                    : '—'}
                                            </strong>
                                        </span>
                                        <span>
                                            Views Akun:{' '}
                                            <strong className="sparc-code-id text-[var(--md-sys-color-on-surface)]">
                                                {igAccount.accountInsights?.views_28d !== undefined &&
                                                igAccount.accountInsights.views_28d !== null
                                                    ? igAccount.accountInsights.views_28d.toLocaleString('id-ID')
                                                    : '—'}
                                            </strong>
                                        </span>
                                        <span>
                                            Akun Berinteraksi:{' '}
                                            <strong className="sparc-code-id text-[var(--md-sys-color-on-surface)]">
                                                {igAccount.accountInsights?.accounts_engaged_28d !== undefined &&
                                                igAccount.accountInsights.accounts_engaged_28d !== null
                                                    ? igAccount.accountInsights.accounts_engaged_28d.toLocaleString('id-ID')
                                                    : '—'}
                                            </strong>
                                        </span>
                                    </div>

                                    {(igAccount.bestPostingHours?.length ?? 0) > 0 && (
                                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px]">
                                            <span className="inline-flex items-center gap-1 font-semibold text-[var(--md-sys-color-on-surface-muted)]">
                                                <Clock className="w-3 h-3 text-purple-600" /> Rekomendasi Jam Tayang Terbaik (WIB):
                                            </span>
                                            {igAccount.bestPostingHours?.map((bh) => (
                                                <span
                                                    key={bh}
                                                    className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300 font-bold"
                                                >
                                                    {bh}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {(can?.managePublishing || can?.editContent || can?.manageSettings) && (
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        isLoading={isSyncingIgProfile}
                                        icon={<RefreshCw className={`w-3.5 h-3.5 ${isSyncingIgProfile ? 'animate-spin' : ''}`} />}
                                        onClick={handleSyncIgAccountInsights}
                                    >
                                        Sync Profil & Insights
                                    </Button>
                                )}
                            </div>
                        )}

                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                                <div className="flex items-center justify-between">
                                    <span className="sparc-eyebrow">Total Jangkauan (Reach)</span>
                                    <TrendingUp className="w-4 h-4 text-[var(--md-sys-color-secondary)]" />
                                </div>
                                <p className="sparc-code-id text-2xl font-black text-[var(--md-sys-color-on-surface)] mt-1.5">
                                    {kpiSummary.totalReach}
                                </p>
                                <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] mt-1">
                                    Dari {kpiSummary.measuredCount} slot terukur ({kpiSummary.unmeasuredCount} belum diukur)
                                </p>
                            </div>

                            <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                                <div className="flex items-center justify-between">
                                    <span className="sparc-eyebrow">Total Tayangan (Views)</span>
                                    <Eye className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                                </div>
                                <p className="sparc-code-id text-2xl font-black text-[var(--md-sys-color-on-surface)] mt-1.5">
                                    {kpiSummary.totalViews}
                                </p>
                                <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] mt-1">
                                    Akumulasi video & halaman rilis
                                </p>
                            </div>

                            <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                                <div className="flex items-center justify-between">
                                    <span className="sparc-eyebrow">Rata-Rata Engagement</span>
                                    <BarChart3 className="w-4 h-4 text-[var(--md-sys-color-tertiary)]" />
                                </div>
                                <p className="sparc-code-id text-2xl font-black text-[var(--md-sys-color-on-surface)] mt-1.5">
                                    {kpiSummary.avgEr}
                                </p>
                                <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] mt-1">
                                    (Likes + Komentar + Share + Save) / Reach
                                </p>
                            </div>

                            <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                                <div className="flex items-center justify-between">
                                    <span className="sparc-eyebrow">Total Interaksi Publik</span>
                                    <CheckCircle2 className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                                </div>
                                <p className="sparc-code-id text-2xl font-black text-[var(--md-sys-color-on-surface)] mt-1.5">
                                    {kpiSummary.totalInteractions}
                                </p>
                                <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] mt-1">
                                    Nilai belum diukur ditampilkan sebagai &ldquo;—&rdquo;
                                </p>
                            </div>
                        </div>

                        {/* Readable Channel Reach Comparison Chart */}
                        <div className="p-5 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-3.5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                        Distribusi Jangkauan (Reach) per Kanal
                                    </h3>
                                    <p className="text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                        Perbandingan kontribusi akun unik berdasarkan data terverifikasi
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {channelStats.map((ch) => (
                                    <div key={ch.platform} className="space-y-1">
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                                <PlatformChip platform={ch.platform} compact />
                                                <span className="text-[var(--md-sys-color-on-surface-muted)]">
                                                    {ch.posts} slot publikasi
                                                </span>
                                            </div>
                                            <span className="sparc-code-id font-bold text-[var(--md-sys-color-on-surface)]">
                                                {ch.reach > 0
                                                    ? `${ch.reach.toLocaleString('id-ID')} akun`
                                                    : 'Belum diukur (—)'}
                                            </span>
                                        </div>
                                        <div className="h-2 rounded-full bg-[var(--md-sys-color-surface-container-high)] overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-[var(--md-sys-color-primary)] transition-all duration-300"
                                                style={{ width: `${ch.reach > 0 ? Math.max(4, ch.pct) : 0}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Publication Metrics Table (`NULL !== 0` enforced) */}
                        <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] overflow-hidden">
                            <div className="p-4 border-b border-[var(--md-sys-color-outline-variant)] flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                        Rincian Capaian per Publikasi
                                    </h3>
                                    <p className="text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                        Tanda &ldquo;—&rdquo; menandakan metrik H+3 belum dicatat (bukan angka nol)
                                    </p>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">
                                            <th className="py-3 px-4">Kode & Konten</th>
                                            <th className="py-3 px-3">Kanal & Format</th>
                                            <th className="py-3 px-3">Tanggal</th>
                                            <th className="py-3 px-3 text-right">Reach</th>
                                            <th className="py-3 px-3 text-right">Views</th>
                                            <th className="py-3 px-3 text-right">Likes</th>
                                            <th className="py-3 px-3 text-right">Shares</th>
                                            <th className="py-3 px-3 text-right">Saves</th>
                                            <th className="py-3 px-3 text-right">ER (%)</th>
                                            {can?.managePublishing && (
                                                <th className="py-3 px-4 text-right">Aksi</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]/60">
                                        {filteredPubs.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={can?.managePublishing ? 10 : 9}
                                                    className="py-8 text-center text-xs text-[var(--md-sys-color-on-surface-muted)]"
                                                >
                                                    Tidak ada publikasi pada rentang tanggal / format ini.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredPubs.map((pub) => {
                                                const m = pub.metrics;
                                                const er = computeEngagementRate(pub);
                                                return (
                                                    <tr key={pub.id} className="notion-row">
                                                        <td className="py-3 px-4 min-w-[230px]">
                                                            <div className="flex items-center gap-1.5 mb-0.5">
                                                                <ContentIdBadge contentId={pub.contentId} />
                                                                {m?.source && (
                                                                    <span className="text-[10px] uppercase font-semibold text-[var(--md-sys-color-on-surface-muted)]">
                                                                        • {m.source}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="font-bold text-[var(--md-sys-color-on-surface)] line-clamp-1">
                                                                {pub.title}
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-3 whitespace-nowrap">
                                                            <PlatformChip platform={pub.platform} format={pub.format} />
                                                        </td>
                                                        <td className="py-3 px-3 whitespace-nowrap sparc-code-id text-[var(--md-sys-color-on-surface-variant)]">
                                                            {publicationDate(pub) || '—'}
                                                        </td>
                                                        <td className="py-3 px-3 text-right sparc-code-id font-semibold text-[var(--md-sys-color-on-surface)]">
                                                            {formatNullableMetric(m?.reach)}
                                                        </td>
                                                    <td className="py-3 px-3 text-right sparc-code-id text-[var(--md-sys-color-on-surface-variant)]">
                                                        {formatNullableMetric(m?.views)}
                                                    </td>
                                                    <td className="py-3 px-3 text-right sparc-code-id text-[var(--md-sys-color-on-surface-variant)]">
                                                        {formatNullableMetric(m?.likes)}
                                                    </td>
                                                    <td className="py-3 px-3 text-right sparc-code-id text-[var(--md-sys-color-on-surface-variant)]">
                                                        {formatNullableMetric(m?.shares)}
                                                    </td>
                                                    <td className="py-3 px-3 text-right sparc-code-id text-[var(--md-sys-color-on-surface-variant)]">
                                                        {formatNullableMetric(m?.saves)}
                                                    </td>
                                                    <td
                                                        className={`py-3 px-3 text-right sparc-code-id font-bold ${
                                                            er === '—'
                                                                ? 'text-[var(--md-sys-color-on-surface-muted)]'
                                                                : 'text-[var(--md-sys-color-secondary)]'
                                                        }`}
                                                    >
                                                        {er}
                                                    </td>
                                                    {can?.managePublishing && (
                                                        <td className="py-3 px-4 text-right whitespace-nowrap">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => openManualForPub(pub)}
                                                            >
                                                                {m ? 'Perbarui' : 'Input H+3'}
                                                            </Button>
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        }))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* =========================================================
                    LAYER 2: OPERATIONAL PRODUCTION REPORT
                   ========================================================= */}
                {activeLayer === 'operational' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="p-5 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                        Sebaran Tahap Alur Kerja (Pipeline)
                                    </h3>
                                    <p className="text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                        Ketepatan jadwal produksi saat ini: {operationalSummary.onTimeRate}%
                                    </p>
                                </div>
                                <Layers className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                            </div>

                            <div className="space-y-2.5">
                                {operationalSummary.byStage.map((row) => (
                                    <div
                                        key={row.status}
                                        className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]/70"
                                    >
                                        <StatusChip status={row.status} />
                                        <span className="sparc-code-id text-sm font-black text-[var(--md-sys-color-on-surface)]">
                                            {row.count} konten
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="p-5 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-4">
                            <div>
                                <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                    Proporsi Pilar Komunikasi Publik
                                </h3>
                                <p className="text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                    Keseimbangan topik edukasi, kelembagaan, dan program strategis
                                </p>
                            </div>

                            <div className="space-y-3">
                                {operationalSummary.pillars.map(([pillar, count]) => {
                                    const pct = Math.round(
                                        (count / Math.max(1, contentItems.length)) * 100
                                    );
                                    return (
                                        <div key={pillar} className="space-y-1">
                                            <div className="flex items-center justify-between text-xs">
                                                <PillarTag pillar={pillar} />
                                                <span className="sparc-code-id font-bold text-[var(--md-sys-color-on-surface)]">
                                                    {count} konten ({pct}%)
                                                </span>
                                            </div>
                                            <div className="h-2 rounded-full bg-[var(--md-sys-color-surface-container-high)] overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-[var(--md-sys-color-secondary)]"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* =========================================================
                    LAYER 3: TEAM PERFORMANCE & WORKLOAD REPORT
                   ========================================================= */}
                {activeLayer === 'team' && (
                    <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] overflow-hidden">
                        <div className="p-4 border-b border-[var(--md-sys-color-outline-variant)] flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                    Rekap Beban Kerja & Ketepatan Tim HUMAS
                                </h3>
                                <p className="text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                    Alokasi tugas aktif dibanding kapasitas jam kerja mingguan
                                </p>
                            </div>
                            <Users className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">
                                        <th className="py-3 px-4">Anggota Tim</th>
                                        <th className="py-3 px-3">Peran Utama</th>
                                        <th className="py-3 px-3 text-right">Tugas Aktif</th>
                                        <th className="py-3 px-3 text-right">Tenggat Minggu Ini</th>
                                        <th className="py-3 px-3 text-right">Terlambat</th>
                                        <th className="py-3 px-4">Utilisasi Kapasitas</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]/60">
                                    {team.map((member) => {
                                        const ratio = Math.min(
                                            100,
                                            Math.round(
                                                (member.effortHours / Math.max(1, member.capacityHours)) * 100
                                            )
                                        );
                                        return (
                                            <tr key={member.id} className="notion-row">
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2.5">
                                                        <img
                                                            src={member.avatar}
                                                            alt={member.name}
                                                            className="w-7 h-7 rounded-full object-cover border border-[var(--md-sys-color-outline-variant)]"
                                                        />
                                                        <div>
                                                            <div className="font-bold text-[var(--md-sys-color-on-surface)]">
                                                                {member.name}
                                                            </div>
                                                            <div className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                                                {member.email}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-3 whitespace-nowrap">
                                                    <RoleBadge role={member.primaryRole} />
                                                </td>
                                                <td className="py-3 px-3 text-right sparc-code-id font-bold text-[var(--md-sys-color-on-surface)]">
                                                    {member.activeTasks}
                                                </td>
                                                <td className="py-3 px-3 text-right sparc-code-id text-[var(--md-sys-color-on-surface-variant)]">
                                                    {member.dueThisWeek}
                                                </td>
                                                <td
                                                    className={`py-3 px-3 text-right sparc-code-id font-bold ${
                                                        member.overdueTasks > 0
                                                            ? 'text-[var(--md-sys-color-error)]'
                                                            : 'text-[var(--md-sys-color-on-surface-muted)]'
                                                    }`}
                                                >
                                                    {member.overdueTasks}
                                                </td>
                                                <td className="py-3 px-4 min-w-[180px]">
                                                    <div className="flex items-center justify-between text-[11px] mb-1">
                                                        <span className="sparc-code-id text-[var(--md-sys-color-on-surface-variant)]">
                                                            {member.effortHours}j / {member.capacityHours}j
                                                        </span>
                                                        <span className="sparc-code-id font-bold text-[var(--md-sys-color-on-surface)]">
                                                            {ratio}%
                                                        </span>
                                                    </div>
                                                    <div className="h-1.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${
                                                                ratio >= 90
                                                                    ? 'bg-[var(--md-sys-color-error)]'
                                                                    : ratio >= 75
                                                                      ? 'bg-[var(--md-sys-color-tertiary)]'
                                                                      : 'bg-[var(--md-sys-color-primary)]'
                                                            }`}
                                                            style={{ width: `${ratio}%` }}
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* =========================================================
                    LAYER 4: META MARKETING API & ADS MONITORING
                   ========================================================= */}
                {activeLayer === 'ads' && (
                    <div className="space-y-5">
                        {/* Ads Header Card */}
                        <div className="p-5 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Megaphone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                    <h3 className="font-bold text-sm sm:text-base text-[var(--md-sys-color-on-surface)]">
                                        Meta Marketing API — Monitoring Kampanye & Iklan Berbayar
                                    </h3>
                                </div>
                                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                    Akun Iklan Terhubung:{' '}
                                    {igAccount?.adsData?.active_account ? (
                                        <strong className="text-[var(--md-sys-color-on-surface)]">
                                            {igAccount.adsData.active_account.name} (ID: act_{igAccount.adsData.active_account.account_id})
                                        </strong>
                                    ) : igAccount?.adsData?.synced_at ? (
                                        <strong className="text-amber-700 dark:text-amber-300">
                                            Belum ada Ad Account ditemukan di Meta Ads Manager
                                        </strong>
                                    ) : (
                                        <strong className="text-[var(--md-sys-color-on-surface)]">
                                            Belum disinkronkan
                                        </strong>
                                    )}
                                    {igAccount?.adsData?.synced_at && (
                                        <span className="ml-2 text-[var(--md-sys-color-on-surface-muted)]">
                                            • Terakhir disinkronkan: {igAccount.adsData.synced_at}
                                        </span>
                                    )}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {(igAccount?.adsData?.accounts?.length ?? 0) > 1 && (
                                    <select
                                        aria-label="Pilih Akun Iklan Meta"
                                        value={selectedAdAccountId || igAccount?.adsData?.active_account?.account_id || ''}
                                        onChange={(e) => {
                                            setSelectedAdAccountId(e.target.value);
                                            handleSyncAds(e.target.value, adsDatePreset);
                                        }}
                                        className="h-8 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 text-[var(--md-sys-color-on-surface)] font-medium focus:outline-none"
                                    >
                                        {igAccount?.adsData?.accounts?.map((acc) => (
                                            <option key={acc.id} value={acc.account_id}>
                                                {acc.name} (act_{acc.account_id})
                                            </option>
                                        ))}
                                    </select>
                                )}
                                <select
                                    aria-label="Periode Data Iklan Meta"
                                    value={adsDatePreset}
                                    onChange={(e) => {
                                        setAdsDatePreset(e.target.value);
                                        handleSyncAds(undefined, e.target.value);
                                    }}
                                    className="h-8 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 text-[var(--md-sys-color-on-surface)] font-medium focus:outline-none"
                                >
                                    <option value="last_7d">7 Hari Terakhir</option>
                                    <option value="last_30d">30 Hari Terakhir</option>
                                    <option value="last_90d">90 Hari Terakhir</option>
                                    <option value="this_month">Bulan Ini</option>
                                </select>
                                <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    isLoading={isSyncingAds}
                                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                                    onClick={() => handleSyncAds()}
                                >
                                    Tarik Data Iklan Meta
                                </Button>
                            </div>
                        </div>

                        {/* Ads KPI Summary Cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                            <div className="p-4 rounded-xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] space-y-1">
                                <div className="flex items-center justify-between text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                    <span>Total Biaya (Spend)</span>
                                    <DollarSign className="w-4 h-4 text-emerald-500" />
                                </div>
                                <div className="text-xl sm:text-2xl font-extrabold sparc-code-id text-[var(--md-sys-color-on-surface)]">
                                    {igAccount?.adsData?.active_account?.currency || 'IDR'}{' '}
                                    {(igAccount?.adsData?.summary?.total_spend ?? 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                                </div>
                                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                                    Periode: {igAccount?.adsData?.summary?.date_preset || '30 Hari Terakhir'}
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] space-y-1">
                                <div className="flex items-center justify-between text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                    <span>Total Impresi & Reach</span>
                                    <Eye className="w-4 h-4 text-purple-500" />
                                </div>
                                <div className="text-xl sm:text-2xl font-extrabold sparc-code-id text-[var(--md-sys-color-on-surface)]">
                                    {(igAccount?.adsData?.summary?.total_impressions ?? 0).toLocaleString('id-ID')}
                                </div>
                                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                                    Jangkauan: {(igAccount?.adsData?.summary?.total_reach ?? 0).toLocaleString('id-ID')} audiens
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] space-y-1">
                                <div className="flex items-center justify-between text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                    <span>Total Klik & CTR</span>
                                    <MousePointerClick className="w-4 h-4 text-blue-500" />
                                </div>
                                <div className="text-xl sm:text-2xl font-extrabold sparc-code-id text-[var(--md-sys-color-on-surface)]">
                                    {(igAccount?.adsData?.summary?.total_clicks ?? 0).toLocaleString('id-ID')}
                                </div>
                                <div className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                                    Rata-rata CTR: {igAccount?.adsData?.summary?.avg_ctr ?? 0}%
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] space-y-1">
                                <div className="flex items-center justify-between text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                    <span>Efisiensi CPC & CPM</span>
                                    <TrendingUp className="w-4 h-4 text-amber-500" />
                                </div>
                                <div className="text-xl sm:text-2xl font-extrabold sparc-code-id text-[var(--md-sys-color-on-surface)]">
                                    CPC {(igAccount?.adsData?.summary?.avg_cpc ?? 0).toLocaleString('id-ID')}
                                </div>
                                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                                    CPM: {(igAccount?.adsData?.summary?.avg_cpm ?? 0).toLocaleString('id-ID')}
                                </div>
                            </div>
                        </div>

                        {/* Organic vs Paid Comparison */}
                        <div className="p-5 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] space-y-3">
                            <h4 className="font-bold text-xs uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-2">
                                <PieChart className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                                Perbandingan Jangkauan Publikasi (Organik vs Iklan Berbayar)
                            </h4>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs font-semibold">
                                    <span className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                                        <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                                        Organik (Instagram Graph API): {((igAccount?.accountInsights?.reach_28d ?? 0)).toLocaleString('id-ID')} Reach
                                    </span>
                                    <span className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                                        Iklan (Meta Marketing API): {(igAccount?.adsData?.summary?.total_reach ?? 0).toLocaleString('id-ID')} Reach
                                    </span>
                                </div>
                                <div className="w-full h-3 rounded-full bg-[var(--md-sys-color-surface-container-highest)] overflow-hidden flex">
                                    <div
                                        className="h-full bg-purple-500 transition-all"
                                        style={{
                                            width: `${Math.round(
                                                ((igAccount?.accountInsights?.reach_28d ?? 0) /
                                                    Math.max(1, (igAccount?.accountInsights?.reach_28d ?? 0) + (igAccount?.adsData?.summary?.total_reach ?? 0))) *
                                                    100
                                            )}%`,
                                        }}
                                        title="Porsi Organik"
                                    />
                                    <div
                                        className="h-full bg-blue-500 transition-all"
                                        style={{
                                            width: `${Math.round(
                                                ((igAccount?.adsData?.summary?.total_reach ?? 0) /
                                                    Math.max(1, (igAccount?.accountInsights?.reach_28d ?? 0) + (igAccount?.adsData?.summary?.total_reach ?? 0))) *
                                                    100
                                            )}%`,
                                        }}
                                        title="Porsi Iklan Berbayar"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Campaigns Table */}
                        <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] overflow-hidden">
                            <div className="p-4 border-b border-[var(--md-sys-color-outline-variant)] flex items-center justify-between">
                                <div>
                                    <h4 className="font-bold text-sm text-[var(--md-sys-color-on-surface)]">
                                        Daftar Kampanye Iklan Meta
                                    </h4>
                                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                        Data kampanye yang berjalan di Meta Ads Manager
                                    </p>
                                </div>
                                <span className="text-xs sparc-code-id font-bold text-[var(--md-sys-color-on-surface)]">
                                    {igAccount?.adsData?.campaigns?.length ?? 0} Kampanye Terdata
                                </span>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">
                                            <th className="py-3 px-4">Nama Kampanye</th>
                                            <th className="py-3 px-3">Status</th>
                                            <th className="py-3 px-3">Tujuan (Objective)</th>
                                            <th className="py-3 px-3 text-right">Anggaran</th>
                                            <th className="py-3 px-3 text-right">Sisa Anggaran</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]/60">
                                        {(igAccount?.adsData?.campaigns?.length ?? 0) === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="py-8 text-center text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                                    Belum ada data kampanye. Klik tombol "Tarik Data Iklan Meta" di atas untuk menyinkronkan kampanye aktif dari Ads Manager.
                                                </td>
                                            </tr>
                                        ) : (
                                            igAccount?.adsData?.campaigns?.map((c) => (
                                                <tr key={c.id} className="notion-row">
                                                    <td className="py-3 px-4 font-bold text-[var(--md-sys-color-on-surface)]">
                                                        <div className="line-clamp-1">{c.name}</div>
                                                        <div className="text-[10px] text-[var(--md-sys-color-on-surface-muted)] sparc-code-id">ID: {c.id}</div>
                                                    </td>
                                                    <td className="py-3 px-3">
                                                        <span
                                                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                                                c.status === 'ACTIVE'
                                                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                                                                    : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/30'
                                                            }`}
                                                        >
                                                            {c.status}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-3 text-[var(--md-sys-color-on-surface-variant)] font-medium">
                                                        {c.objective || 'OUTCOME_ENGAGEMENT'}
                                                    </td>
                                                    <td className="py-3 px-3 text-right sparc-code-id font-bold text-[var(--md-sys-color-on-surface)]">
                                                        {c.daily_budget ? `Harian: ${Number(c.daily_budget).toLocaleString('id-ID')}` : c.lifetime_budget ? `Total: ${Number(c.lifetime_budget).toLocaleString('id-ID')}` : '—'}
                                                    </td>
                                                    <td className="py-3 px-3 text-right sparc-code-id text-[var(--md-sys-color-on-surface-variant)]">
                                                        {c.budget_remaining ? Number(c.budget_remaining).toLocaleString('id-ID') : '—'}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* =========================================================
                    LAYER 5: CREATOR & BUSINESS AUDIENCE DEMOGRAPHICS
                   ========================================================= */}
                {activeLayer === 'creator' && (
                    <div className="space-y-5">
                        {/* Creator Header Card */}
                        <div className="p-5 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                    <h3 className="font-bold text-sm sm:text-base text-[var(--md-sys-color-on-surface)]">
                                        Wawasan Kreator & Demografi Audiens
                                    </h3>
                                </div>
                                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                    Profil Resmi: @{igAccount?.username || 'humas_instansi'} • {igAccount?.followersCount?.toLocaleString('id-ID') ?? 0} Pengikut • {igAccount?.mediaCount?.toLocaleString('id-ID') ?? 0} Postingan
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    isLoading={isSyncingStories}
                                    icon={<History className="w-3.5 h-3.5" />}
                                    onClick={handleSyncStories}
                                >
                                    Tarik Story 24 Jam
                                </Button>
                                <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    isLoading={isSyncingDemographics}
                                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                                    onClick={handleSyncDemographics}
                                >
                                    Tarik Demografi
                                </Button>
                            </div>
                        </div>

                        {/* Demographics Overview Cards */}
                        {!igAccount?.demographicsData?.has_data ? (
                            <div className="p-8 text-center rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] space-y-2">
                                <Users className="w-8 h-8 text-[var(--md-sys-color-on-surface-muted)] mx-auto" />
                                <h4 className="font-bold text-sm text-[var(--md-sys-color-on-surface)]">
                                    {(igAccount?.followersCount ?? 0) >= 100
                                        ? igAccount?.demographicsData?.synced_at
                                            ? 'Data Demografi Belum Dikembalikan oleh Meta'
                                            : 'Data Demografi Pengikut Belum Ditarik'
                                        : 'Demografi Audiens Belum Terbuka dari Meta'}
                                </h4>
                                <p className="text-xs text-[var(--md-sys-color-on-surface-muted)] max-w-lg mx-auto leading-relaxed">
                                    {(igAccount?.followersCount ?? 0) >= 100 ? (
                                        igAccount?.demographicsData?.synced_at ? (
                                            <>
                                                Akun memiliki <strong>{(igAccount?.followersCount ?? 0).toLocaleString('id-ID')} pengikut</strong> (sinkron terakhir: {igAccount.demographicsData.synced_at}), namun Meta Graph API belum mengembalikan sebaran pengikut. Pastikan izin <code>instagram_manage_insights</code> aktif di menu Pengaturan lalu klik <strong>Tarik Demografi</strong>.
                                            </>
                                        ) : (
                                            <>
                                                Akun Anda memiliki <strong>{(igAccount?.followersCount ?? 0).toLocaleString('id-ID')} pengikut</strong> dan sudah memenuhi syarat Meta. Klik tombol <strong>Tarik Demografi</strong> di kanan atas untuk memuat sebaran gender, rentang usia, kota, dan negara audiens.
                                            </>
                                        )
                                    ) : (
                                        <>
                                            Sesuai kebijakan privasi Meta Graph API, rincian sebaran gender, usia, kota, dan negara baru dapat diakses setelah akun mencapai minimal <strong>100 pengikut</strong> (saat ini akun memiliki {igAccount?.followersCount ?? 0} pengikut).
                                        </>
                                    )}
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Gender & Age Distribution */}
                                <div className="p-4 rounded-xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-xs uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">
                                            Komposisi Gender & Usia
                                        </h4>
                                        <Users className="w-4 h-4 text-purple-500" />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-blue-600 dark:text-blue-400 font-semibold">Laki-laki</span>
                                            <span className="font-extrabold sparc-code-id">{igAccount?.demographicsData?.gender_distribution?.male ?? 0}%</span>
                                        </div>
                                        <div className="w-full h-2 rounded-full bg-[var(--md-sys-color-surface-container-highest)] overflow-hidden">
                                            <div
                                                className="h-full bg-blue-500 rounded-full"
                                                style={{ width: `${igAccount?.demographicsData?.gender_distribution?.male ?? 0}%` }}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-pink-600 dark:text-pink-400 font-semibold">Perempuan</span>
                                            <span className="font-extrabold sparc-code-id">{igAccount?.demographicsData?.gender_distribution?.female ?? 0}%</span>
                                        </div>
                                        <div className="w-full h-2 rounded-full bg-[var(--md-sys-color-surface-container-highest)] overflow-hidden">
                                            <div
                                                className="h-full bg-pink-500 rounded-full"
                                                style={{ width: `${igAccount?.demographicsData?.gender_distribution?.female ?? 0}%` }}
                                            />
                                        </div>
                                        {Object.keys(igAccount?.demographicsData?.gender_age ?? {}).length > 0 && (() => {
                                            const ageTotals: Record<string, number> = {};
                                            Object.entries(igAccount?.demographicsData?.gender_age ?? {}).forEach(([k, v]) => {
                                                const bracket = k.includes('.') ? k.split('.').slice(1).join('.') : k;
                                                ageTotals[bracket] = (ageTotals[bracket] ?? 0) + Number(v || 0);
                                            });
                                            const ageEntries = Object.entries(ageTotals)
                                                .sort((a, b) => b[1] - a[1])
                                                .slice(0, 5);
                                            const maxAge = Math.max(1, ...ageEntries.map(([, cnt]) => cnt));
                                            return (
                                                <div className="pt-2.5 mt-2.5 border-t border-[var(--md-sys-color-outline-variant)]/60 space-y-1.5">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-muted)] block">
                                                        Rentang Usia Dominan
                                                    </span>
                                                    {ageEntries.map(([bracket, cnt]) => (
                                                        <div key={bracket} className="flex items-center gap-2 text-[11px]">
                                                            <span className="sparc-code-id w-11 text-[var(--md-sys-color-on-surface)] font-semibold shrink-0">
                                                                {bracket}
                                                            </span>
                                                            <div className="flex-1 h-1.5 rounded-full bg-[var(--md-sys-color-surface-container-highest)] overflow-hidden">
                                                                <div
                                                                    className="h-full bg-purple-500 rounded-full"
                                                                    style={{ width: `${Math.round((cnt / maxAge) * 100)}%` }}
                                                                />
                                                            </div>
                                                            <span className="sparc-code-id text-[10px] text-[var(--md-sys-color-on-surface-muted)] shrink-0">
                                                                {cnt.toLocaleString('id-ID')}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {/* Top Cities */}
                                <div className="p-4 rounded-xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-xs uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">
                                            Top Kota Audiens
                                        </h4>
                                        <MapPin className="w-4 h-4 text-emerald-500" />
                                    </div>
                                    <div className="space-y-1.5 text-xs">
                                        {Object.entries(igAccount?.demographicsData?.top_cities ?? {}).length === 0 ? (
                                            <p className="text-xs text-[var(--md-sys-color-on-surface-muted)] italic">Belum ada data kota</p>
                                        ) : (
                                            Object.entries(igAccount?.demographicsData?.top_cities ?? {}).map(([city, count]) => (
                                                <div key={city} className="flex items-center justify-between">
                                                    <span className="text-[var(--md-sys-color-on-surface)] font-medium">{city}</span>
                                                    <span className="sparc-code-id text-[var(--md-sys-color-on-surface-muted)]">{count.toLocaleString('id-ID')}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Top Countries */}
                                <div className="p-4 rounded-xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-xs uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">
                                            Top Negara Audiens
                                        </h4>
                                        <Globe className="w-4 h-4 text-amber-500" />
                                    </div>
                                    <div className="space-y-1.5 text-xs">
                                        {Object.entries(igAccount?.demographicsData?.top_countries ?? {}).length === 0 ? (
                                            <p className="text-xs text-[var(--md-sys-color-on-surface-muted)] italic">Belum ada data negara</p>
                                        ) : (
                                            Object.entries(igAccount?.demographicsData?.top_countries ?? {}).map(([country, count]) => (
                                                <div key={country} className="flex items-center justify-between">
                                                    <span className="text-[var(--md-sys-color-on-surface)] font-medium">{country}</span>
                                                    <span className="sparc-code-id text-[var(--md-sys-color-on-surface-muted)]">{count.toLocaleString('id-ID')}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        {/* Reels Performance & Retention */}
                        <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] overflow-hidden">
                            <div className="p-4 border-b border-[var(--md-sys-color-outline-variant)] flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <h4 className="font-bold text-sm text-[var(--md-sys-color-on-surface)] flex items-center gap-2">
                                        <Video className="w-4 h-4 text-purple-500" />
                                        Retensi Video Reels (Drop-Off & Total Waktu Tonton)
                                    </h4>
                                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                        Metrik video khusus: ig_reels_video_view_total_time & ig_reels_avg_watch_time
                                    </p>
                                </div>
                                {reelsItems.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs sparc-code-id font-bold text-[var(--md-sys-color-on-surface-variant)] px-2.5 py-1 rounded-xl bg-[var(--md-sys-color-surface-container-high)]">
                                            {reelsPageSize === 0 || reelsItems.length <= reelsPageSize
                                                ? `${reelsItems.length.toLocaleString('id-ID')} Reels`
                                                : `${((safeReelsPage - 1) * reelsPageSize + 1).toLocaleString('id-ID')}–${Math.min(safeReelsPage * reelsPageSize, reelsItems.length).toLocaleString('id-ID')} dari ${reelsItems.length.toLocaleString('id-ID')} Reels`}
                                        </span>
                                        <select
                                            aria-label="Jumlah baris tabel Retensi Video Reels"
                                            value={reelsPageSize}
                                            onChange={(e) => {
                                                setReelsPageSize(Number(e.target.value));
                                                setReelsPage(1);
                                            }}
                                            className="h-8 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-2.5 text-[var(--md-sys-color-on-surface)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 cursor-pointer"
                                        >
                                            <option value={15}>15 / halaman</option>
                                            <option value={30}>30 / halaman</option>
                                            <option value={50}>50 / halaman</option>
                                            <option value={0}>Semua ({reelsItems.length})</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">
                                            <th className="py-3 px-4">Konten Reels</th>
                                            <th className="py-3 px-3 text-right">Tayangan (Views)</th>
                                            <th className="py-3 px-3 text-right">Waktu Tonton Total</th>
                                            <th className="py-3 px-3 text-right">Rata-rata Retensi</th>
                                            <th className="py-3 px-3 text-right">Shares</th>
                                            <th className="py-3 px-3 text-right">Saves</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]/60">
                                        {visibleReelsItems.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="py-6 text-center text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                                    Belum ada konten Reels yang dipublikasikan.
                                                </td>
                                            </tr>
                                        ) : (
                                            visibleReelsItems.map((item) => (
                                                    <tr key={item.id} className="notion-row">
                                                        <td className="py-3 px-4 font-bold text-[var(--md-sys-color-on-surface)]">
                                                            <div className="line-clamp-1">{item.title}</div>
                                                            <div className="text-[10px] text-[var(--md-sys-color-on-surface-muted)] sparc-code-id">{item.contentId}</div>
                                                        </td>
                                                        <td className="py-3 px-3 text-right sparc-code-id text-[var(--md-sys-color-on-surface)] font-bold">
                                                            {(item.views ?? 0).toLocaleString('id-ID')}
                                                        </td>
                                                        <td className="py-3 px-3 text-right sparc-code-id text-[var(--md-sys-color-on-surface-variant)]">
                                                            {item.reelsWatchTime ? `${Math.round(item.reelsWatchTime / 60)} menit` : '—'}
                                                        </td>
                                                        <td className="py-3 px-3 text-right sparc-code-id text-emerald-600 dark:text-emerald-400 font-semibold">
                                                            {item.reelsAvgWatchTime ? `${item.reelsAvgWatchTime.toFixed(1)} detik` : '—'}
                                                        </td>
                                                        <td className="py-3 px-3 text-right sparc-code-id text-[var(--md-sys-color-on-surface-variant)]">
                                                            {(item.shares ?? 0).toLocaleString('id-ID')}
                                                        </td>
                                                        <td className="py-3 px-3 text-right sparc-code-id text-[var(--md-sys-color-on-surface-variant)]">
                                                            {(item.saves ?? 0).toLocaleString('id-ID')}
                                                        </td>
                                                    </tr>
                                                ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {reelsItems.length > 0 && reelsPageSize > 0 && totalReelsPages > 1 && (
                                <div className="px-4 py-3 border-t border-[var(--md-sys-color-outline-variant)] flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <span className="text-[var(--md-sys-color-on-surface-muted)]">
                                        Halaman <strong className="sparc-code-id text-[var(--md-sys-color-on-surface)]">{safeReelsPage}</strong> dari{' '}
                                        <strong className="sparc-code-id text-[var(--md-sys-color-on-surface)]">{totalReelsPages}</strong>
                                    </span>
                                    <div className="inline-flex items-center gap-1.5">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            disabled={safeReelsPage <= 1}
                                            icon={<ChevronLeft className="w-3.5 h-3.5" />}
                                            onClick={() => setReelsPage((p) => Math.max(1, p - 1))}
                                        >
                                            Sebelumnya
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            disabled={safeReelsPage >= totalReelsPages}
                                            onClick={() => setReelsPage((p) => Math.min(totalReelsPages, p + 1))}
                                        >
                                            Berikutnya
                                            <ChevronRight className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Active 24-Hour Stories */}
                        <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] p-4 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                    <h4 className="font-bold text-sm text-[var(--md-sys-color-on-surface)] flex items-center gap-2">
                                        <History className="w-4 h-4 text-pink-500" />
                                        Story Aktif (24 Jam Terakhir)
                                    </h4>
                                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                        Metrik penonton, balasan, dan interaksi navigasi story Instagram
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        isLoading={isSyncingStories}
                                        icon={<RefreshCw className="w-3.5 h-3.5 text-pink-500" />}
                                        onClick={handleSyncStories}
                                    >
                                        Tarik Metrik Story
                                    </Button>
                                    <span className="text-xs sparc-code-id font-bold text-[var(--md-sys-color-on-surface)] px-2.5 py-1 rounded-xl bg-[var(--md-sys-color-surface-container-high)]">
                                        {igAccount?.storiesData?.length ?? 0} Story Aktif
                                    </span>
                                </div>
                            </div>

                            {(igAccount?.storiesData?.length ?? 0) === 0 ? (
                                <div className="py-6 text-center text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                    Tidak ada story aktif yang terdeteksi dalam 24 jam terakhir. Klik &ldquo;Tarik Metrik Story&rdquo; untuk memperbarui data dari Instagram Graph API.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {igAccount?.storiesData?.map((st) => {
                                        const reach = st.metrics?.reach ?? 0;
                                        const views = st.metrics?.views ?? st.metrics?.impressions ?? 0;
                                        const replies = st.metrics?.replies ?? 0;
                                        const navigation = st.metrics?.navigation ?? ((st.metrics?.taps_forward ?? 0) + (st.metrics?.taps_back ?? 0) + (st.metrics?.exits ?? 0));
                                        return (
                                            <div key={st.id} className="p-3 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] space-y-2.5 flex flex-col justify-between">
                                                <div className="flex items-start gap-2.5">
                                                    {st.thumbnail_url ? (
                                                        <img
                                                            src={st.thumbnail_url}
                                                            alt={st.caption || 'Instagram Story'}
                                                            className="w-11 h-14 object-cover rounded-lg border border-[var(--md-sys-color-outline-variant)] shrink-0 bg-black/10"
                                                        />
                                                    ) : (
                                                        <div className="w-11 h-14 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] flex items-center justify-center shrink-0 text-pink-500">
                                                            <History className="w-5 h-5" />
                                                        </div>
                                                    )}
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] line-clamp-2">
                                                            {st.caption || 'Instagram Story'}
                                                        </div>
                                                        {st.permalink && (
                                                            <a
                                                                href={st.permalink}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="inline-flex items-center gap-1 text-[10px] text-pink-600 dark:text-pink-400 font-semibold hover:underline mt-0.5"
                                                            >
                                                                Buka Story <ExternalLink className="w-2.5 h-2.5" />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-1.5 text-[11px] pt-2 border-t border-[var(--md-sys-color-outline-variant)]/60">
                                                    <div className="text-[var(--md-sys-color-on-surface-muted)]">
                                                        Penonton: <strong className="text-[var(--md-sys-color-on-surface)] sparc-code-id">{reach.toLocaleString('id-ID')}</strong>
                                                    </div>
                                                    <div className="text-[var(--md-sys-color-on-surface-muted)]">
                                                        Tayangan: <strong className="text-[var(--md-sys-color-on-surface)] sparc-code-id">{views.toLocaleString('id-ID')}</strong>
                                                    </div>
                                                    <div className="text-[var(--md-sys-color-on-surface-muted)]">
                                                        Balasan: <strong className="text-blue-600 dark:text-blue-400 sparc-code-id">{replies.toLocaleString('id-ID')}</strong>
                                                    </div>
                                                    <div className="text-[var(--md-sys-color-on-surface-muted)]">
                                                        Navigasi: <strong className="text-purple-600 dark:text-purple-400 sparc-code-id">{navigation.toLocaleString('id-ID')}</strong>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Manual Metric Input Modal (`POST /report/metrics`) */}
            <Modal
                isOpen={manualModalOpen}
                onClose={() => setManualModalOpen(false)}
                title="Input Metrik Performa Publikasi"
                description="Biarkan kolom kosong apabila kanal tidak menyediakan metrik tersebut (tersimpan sebagai NULL / '—')"
                maxWidth="md"
            >
                <form onSubmit={handleManualSubmit} className="space-y-4" noValidate>
                    <Select
                        label="Pilih Slot Publikasi"
                        value={metricForm.data.publication_id}
                        onChange={(e) => metricForm.setData('publication_id', e.target.value)}
                        error={metricForm.errors.publication_id}
                    >
                        {publications.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.contentId} ({p.platform.toUpperCase()}) — {p.title}
                            </option>
                        ))}
                    </Select>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <Input
                            type="number"
                            min={0}
                            label="Reach"
                            placeholder="Kosong = —"
                            value={metricForm.data.reach}
                            onChange={(e) => metricForm.setData('reach', e.target.value)}
                            error={metricForm.errors.reach}
                        />
                        <Input
                            type="number"
                            min={0}
                            label="Impressions"
                            placeholder="Kosong = —"
                            value={metricForm.data.impressions}
                            onChange={(e) => metricForm.setData('impressions', e.target.value)}
                        />
                        <Input
                            type="number"
                            min={0}
                            label="Views"
                            placeholder="Kosong = —"
                            value={metricForm.data.views}
                            onChange={(e) => metricForm.setData('views', e.target.value)}
                        />
                        <Input
                            type="number"
                            min={0}
                            label="Clicks"
                            placeholder="Kosong = —"
                            value={metricForm.data.clicks}
                            onChange={(e) => metricForm.setData('clicks', e.target.value)}
                        />
                        <Input
                            type="number"
                            min={0}
                            label="Likes"
                            placeholder="Kosong = —"
                            value={metricForm.data.likes}
                            onChange={(e) => metricForm.setData('likes', e.target.value)}
                        />
                        <Input
                            type="number"
                            min={0}
                            label="Comments"
                            placeholder="Kosong = —"
                            value={metricForm.data.comments}
                            onChange={(e) => metricForm.setData('comments', e.target.value)}
                        />
                        <Input
                            type="number"
                            min={0}
                            label="Shares"
                            placeholder="Kosong = —"
                            value={metricForm.data.shares}
                            onChange={(e) => metricForm.setData('shares', e.target.value)}
                        />
                        <Input
                            type="number"
                            min={0}
                            label="Saves"
                            placeholder="Kosong = —"
                            value={metricForm.data.saves}
                            onChange={(e) => metricForm.setData('saves', e.target.value)}
                        />
                    </div>

                    <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            disabled={metricForm.processing}
                            onClick={() => setManualModalOpen(false)}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            isLoading={metricForm.processing}
                            icon={<Download className="w-3.5 h-3.5" />}
                        >
                            Simpan Capaian
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Excel Batch Import Modal (`POST /report/metrics/import-excel`) */}
            <Modal
                isOpen={csvModalOpen}
                onClose={() => setCsvModalOpen(false)}
                title="Impor Excel Performa Publikasi"
                description="Perbarui metrik capaian secara massal menggunakan berkas Microsoft Excel (.xlsx) yang rapi dan mudah diisi"
                maxWidth="lg"
            >
                <form onSubmit={handleExcelSubmit} className="space-y-4" noValidate>
                    {/* Step 1: Download Pre-filled Excel Template */}
                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                1. Unduh Template Excel (.xlsx) Siap Isi
                            </div>
                            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                                Template sudah terisi daftar <strong>Kode Konten</strong> &amp; <strong>Platform</strong> aktif Anda. Cukup isi angka capaian di Excel lalu simpan.
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            icon={<Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                            onClick={handleDownloadExcelTemplate}
                            className="shrink-0"
                        >
                            Unduh Template (.xlsx)
                        </Button>
                    </div>

                    {/* Step 2: Upload Filled Excel File */}
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                            2. Unggah Berkas Excel (.xlsx) yang Telah Diisi
                        </label>
                        <label
                            htmlFor="sparc-excel-upload"
                            className={`flex flex-col items-center justify-center p-5 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                                excelForm.data.excel_file
                                    ? 'border-emerald-500/60 bg-emerald-500/5'
                                    : 'border-[var(--md-sys-color-outline-variant)] hover:border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-surface-container-low)]'
                            }`}
                        >
                            <input
                                id="sparc-excel-upload"
                                type="file"
                                accept=".xlsx,.csv,.txt"
                                className="sr-only"
                                onChange={(e) => {
                                    const file = e.target.files?.[0] ?? null;
                                    excelForm.setData('excel_file', file);
                                    excelForm.clearErrors();
                                }}
                            />
                            {excelForm.data.excel_file ? (
                                <div className="text-center space-y-1">
                                    <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400 mx-auto" />
                                    <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                                        {excelForm.data.excel_file.name}
                                    </p>
                                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                        {(excelForm.data.excel_file.size / 1024).toFixed(1)} KB • Klik untuk mengganti berkas
                                    </p>
                                </div>
                            ) : (
                                <div className="text-center space-y-1">
                                    <Upload className="w-7 h-7 text-[var(--md-sys-color-primary)] mx-auto" />
                                    <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                                        Klik untuk memilih berkas Excel (.xlsx)
                                    </p>
                                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                        Mendukung berkas Template Excel (.xlsx), Laporan Ekspor SPARC (.xlsx), maupun CSV
                                    </p>
                                </div>
                            )}
                        </label>
                        {excelForm.errors.excel_file && (
                            <p className="text-xs text-[var(--md-sys-color-error)] font-medium">
                                {excelForm.errors.excel_file}
                            </p>
                        )}
                    </div>

                    {/* Optional Paste from Excel Table */}
                    <div className="pt-1">
                        <button
                            type="button"
                            onClick={() => setShowPasteFallback((prev) => !prev)}
                            className="text-[11px] font-semibold text-[var(--md-sys-color-primary)] hover:underline cursor-pointer"
                        >
                            {showPasteFallback
                                ? 'Sembunyikan opsi tempel teks manual'
                                : 'Atau tempel (Copy-Paste) baris langsung dari tabel Excel tanpa unggah file'}
                        </button>

                        {showPasteFallback && (
                            <div className="mt-2.5 space-y-2">
                                <div className="p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] flex items-center justify-between gap-2 text-xs">
                                    <code className="sparc-code-id text-[11px] text-[var(--md-sys-color-on-surface-variant)] overflow-x-auto">
                                        content_id,platform,reach,impressions,views,likes,comments,shares,saves,clicks
                                    </code>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        icon={<Copy className="w-3.5 h-3.5" />}
                                        onClick={handleCopyTemplate}
                                    >
                                        Salin Contoh
                                    </Button>
                                </div>
                                <Textarea
                                    label="Tempel Baris Excel (Copy-Paste Sel) atau CSV"
                                    rows={4}
                                    placeholder="Salin baris dari Excel lalu tempel (Ctrl+V) di sini..."
                                    value={excelForm.data.csv_text}
                                    onChange={(e) => excelForm.setData('csv_text', e.target.value)}
                                    error={excelForm.errors.csv_text}
                                />
                            </div>
                        )}
                    </div>

                    <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            disabled={excelForm.processing}
                            onClick={() => setCsvModalOpen(false)}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            isLoading={excelForm.processing}
                            icon={<Upload className="w-3.5 h-3.5" />}
                        >
                            Proses Impor Excel
                        </Button>
                    </div>
                </form>
            </Modal>
        </AppLayout>
    );
}
