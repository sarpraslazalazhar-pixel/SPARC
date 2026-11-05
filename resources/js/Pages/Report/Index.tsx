import React, { useMemo, useState } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    BarChart3,
    CheckCircle2,
    Clock,
    Copy,
    Download,
    Eye,
    FileSpreadsheet,
    Layers,
    Plus,
    Printer,
    RefreshCw,
    Sparkles,
    TrendingUp,
    Upload,
    Users,
} from 'lucide-react';
import { AppLayout, type SharedWorkspaceProps } from '@/Layouts/AppLayout';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
import { Modal } from '@/Components/UI/Modal';
import { Select } from '@/Components/UI/Select';
import {
    ContentIdBadge,
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

    const [activeLayer, setActiveLayer] = useState<'content' | 'operational' | 'team'>('content');
    const [platformFilter, setPlatformFilter] = useState('all');

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
    const filteredPubs = useMemo(
        () =>
            publications.filter((p) =>
                platformFilter === 'all' ? true : p.platform === platformFilter
            ),
        [publications, platformFilter]
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
        publications.forEach((p) => {
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
    }, [publications]);

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

    // CSV Import Form (`POST /report/metrics/import-csv`)
    const csvForm = useForm({
        csv_text: CSV_TEMPLATE,
    });

    const handleCsvSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        csvForm.post('/report/metrics/import-csv', {
            preserveScroll: true,
            onSuccess: () => {
                setCsvModalOpen(false);
            },
            onError: (errors) => {
                toastError(
                    'Impor CSV Belum Cocok',
                    errors.csv_text || 'Periksa kecocokan content_id dan nama platform.'
                );
            },
        });
    };

    const handleDownloadCsv = () => {
        const header = 'content_id,title,platform,scheduled_at,published_at,reach,impressions,views,likes,comments,shares,saves,clicks,er_pct';
        const rows = filteredPubs.map((p) => {
            const m = p.metrics;
            const safeTitle = `"${p.title.replace(/"/g, '""')}"`;
            return [
                p.contentId,
                safeTitle,
                p.platform,
                p.scheduledAt,
                p.publishedActualAt ?? '',
                m?.reach ?? '',
                m?.impressions ?? '',
                m?.views ?? '',
                m?.likes ?? '',
                m?.comments ?? '',
                m?.shares ?? '',
                m?.saves ?? '',
                m?.clicks ?? '',
                computeEngagementRate(p),
            ].join(',');
        });
        const csvContent = [header, ...rows].join('\n');
        try {
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sparc-performance-report-${today}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch {
            // Fallback in restricted environments
        }
        toastSuccess(
            'Berkas CSV Berhasil Diunduh',
            `Rekap performa (${filteredPubs.length} slot publikasi) telah diekspor.`
        );
    };

    const handlePrintReport = () => {
        toastSuccess(
            'Tampilan Cetak Laporan Siap',
            'Gunakan dialog cetak browser untuk menyimpan laporan sebagai PDF resmi.'
        );
    };

    const handleCopyTemplate = async () => {
        const ok = await copyToClipboard(CSV_TEMPLATE);
        if (ok) {
            toastSuccess('Template CSV Disalin', 'Format kolom CSV siap ditempelkan ke spreadsheet Anda.');
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
                        icon={<FileSpreadsheet className="w-3.5 h-3.5 text-[var(--md-sys-color-secondary)]" />}
                        onClick={handleDownloadCsv}
                    >
                        Ekspor CSV
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        icon={<Printer className="w-3.5 h-3.5" />}
                        onClick={handlePrintReport}
                    >
                        Cetak PDF
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
                                icon={<Upload className="w-3.5 h-3.5" />}
                                onClick={() => {
                                    csvForm.clearErrors();
                                    setCsvModalOpen(true);
                                }}
                            >
                                Impor CSV
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
                            { id: 'operational', label: 'Operasional Produksi' },
                            { id: 'team', label: 'Kinerja & Beban Tim' },
                        ]}
                        activeTab={activeLayer}
                        onChange={(id) => setActiveLayer(id as typeof activeLayer)}
                    />

                    {activeLayer === 'content' && (
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
                                            <th className="py-3 px-3">Kanal</th>
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
                                        {filteredPubs.map((pub) => {
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
                                                        <PlatformChip platform={pub.platform} compact />
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
                                        })}
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

            {/* CSV Batch Import Modal (`POST /report/metrics/import-csv`) */}
            <Modal
                isOpen={csvModalOpen}
                onClose={() => setCsvModalOpen(false)}
                title="Impor CSV Performa Publikasi"
                description="Cocokkan data ekspor Instagram/TikTok/YouTube menggunakan kombinasi content_id + platform"
                maxWidth="lg"
            >
                <form onSubmit={handleCsvSubmit} className="space-y-4" noValidate>
                    <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] flex items-center justify-between gap-2 text-xs">
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
                            Salin Format
                        </Button>
                    </div>

                    <Textarea
                        label="Baris Data CSV"
                        rows={5}
                        value={csvForm.data.csv_text}
                        onChange={(e) => csvForm.setData('csv_text', e.target.value)}
                        error={csvForm.errors.csv_text}
                    />

                    <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            disabled={csvForm.processing}
                            onClick={() => setCsvModalOpen(false)}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            isLoading={csvForm.processing}
                            icon={<Upload className="w-3.5 h-3.5" />}
                        >
                            Proses Impor CSV
                        </Button>
                    </div>
                </form>
            </Modal>
        </AppLayout>
    );
}
