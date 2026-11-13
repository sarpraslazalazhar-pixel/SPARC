import React, { useState } from 'react';
import { Head, router, useForm } from '@inertiajs/react';
import {
    AlertCircle,
    Check,
    CheckCircle2,
    ChevronDown,
    Clock,
    Copy,
    ExternalLink,
    Layers,
    RefreshCw,
    Save,
    Server,
    Sliders,
    Sparkles,
    Unlink,
} from 'lucide-react';
import { AppLayout } from '@/Layouts/AppLayout';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
import { PillarTag, PlatformChip } from '@/Components/UI/Semantics';
import { useToast } from '@/Components/UI/Toast';
import { copyToClipboard } from '@/lib/utils';
import type { SparcSystemSettings } from '@/types/sparc';

interface SettingsPageProps {
    settings: SparcSystemSettings;
}

export default function SettingsIndex({ settings }: SettingsPageProps) {
    const { success: toastSuccess, error: toastError } = useToast();
    const [isSyncing, setIsSyncing] = useState(false);
    const [isConnectingFb, setIsConnectingFb] = useState(false);
    const [isDisconnectingIg, setIsDisconnectingIg] = useState(false);
    const [isTestingIg, setIsTestingIg] = useState(false);
    const [selectedCandidateId, setSelectedCandidateId] = useState(settings.instagram?.accountId ?? '');
    const [copiedUri, setCopiedUri] = useState(false);
    const [showEditCreds, setShowEditCreds] = useState(!settings.instagram?.hasAppSecret);
    const [isRefreshingToken, setIsRefreshingToken] = useState(false);
    const [isSyncingProfile, setIsSyncingProfile] = useState(false);

    const defaultScopes = settings.instagram?.requestedScopes ?? [
        'instagram_basic',
        'pages_show_list',
        'pages_read_engagement',
        'instagram_manage_insights',
        'instagram_content_publish',
        'instagram_manage_comments',
        'ads_read',
    ];

    const form = useForm({
        monthly_content_target: settings.monthlyContentTarget ?? 24,
        working_hours_start: settings.workingHoursStart ?? '08:00',
        working_hours_end: settings.workingHoursEnd ?? '17:00',
        polling_interval_seconds: settings.pollingIntervalSeconds ?? 30,
    });
    const igForm = useForm({
        app_id: settings.instagram?.appId ?? '',
        app_secret: '',
        account_id: settings.instagram?.accountId ?? '',
        access_token: '',
        requested_scopes: defaultScopes,
    });
    const [isTestingHaloApu, setIsTestingHaloApu] = useState(false);
    const haloApuForm = useForm({
        base_url: settings.haloApu?.baseUrl ?? '',
        api_token: '',
        webhook_secret: '',
        auto_solve_on_publish: settings.haloApu?.autoSolveOnPublish ?? true,
    });

    const handleSaveHaloApu = (e: React.FormEvent) => {
        e.preventDefault();
        haloApuForm.patch('/settings/haloapu', {
            preserveScroll: true,
            onError: () => {
                toastError('Penyimpanan Gagal', 'Periksa URL Base HaloAPU.');
            },
        });
    };

    const handleTestHaloApu = () => {
        setIsTestingHaloApu(true);
        router.post(
            '/settings/haloapu/test',
            {},
            {
                preserveScroll: true,
                onFinish: () => setIsTestingHaloApu(false),
            }
        );
    };

    const toggleOptionalScope = (scopeKey: string) => {
        const current = igForm.data.requested_scopes;
        const next = current.includes(scopeKey)
            ? current.filter((s) => s !== scopeKey)
            : [...current, scopeKey];
        igForm.setData('requested_scopes', next);
    };

    const handleRefreshIgToken = () => {
        setIsRefreshingToken(true);
        router.post(
            '/settings/instagram/refresh-token',
            {},
            {
                preserveScroll: true,
                onFinish: () => setIsRefreshingToken(false),
            }
        );
    };

    const handleSyncIgProfile = () => {
        setIsSyncingProfile(true);
        router.post(
            '/settings/instagram/sync-profile',
            {},
            {
                preserveScroll: true,
                onFinish: () => setIsSyncingProfile(false),
            }
        );
    };

    const [isSyncingAds, setIsSyncingAds] = useState(false);
    const handleSyncAds = () => {
        setIsSyncingAds(true);
        router.post(
            '/settings/instagram/sync-ads',
            {},
            {
                preserveScroll: true,
                onFinish: () => setIsSyncingAds(false),
            }
        );
    };

    const handleCopyRedirectUri = async () => {
        const uri = settings.instagram?.redirectUri || `${window.location.origin}/settings/instagram/oauth/callback`;
        const ok = await copyToClipboard(uri);
        if (ok) {
            setCopiedUri(true);
            setTimeout(() => setCopiedUri(false), 2500);
            toastSuccess('Tautan Disalin', 'Valid OAuth Redirect URI telah disalin ke clipboard.');
        }
    };

    const handleFacebookLogin = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsConnectingFb(true);

        // Save app_id, app_secret, and selected OAuth scopes before redirecting
        igForm.patch('/settings/instagram', {
            preserveScroll: true,
            onSuccess: () => {
                window.location.href = '/settings/instagram/oauth/redirect';
            },
            onError: () => {
                setIsConnectingFb(false);
                toastError('Konfigurasi Gagal Disimpan', 'Periksa kembali Meta App ID dan App Secret Anda.');
            },
        });
    };

    const handleSaveInstagram = (e: React.FormEvent) => {
        e.preventDefault();
        igForm.patch('/settings/instagram', {
            preserveScroll: true,
            onError: () => {
                toastError('Penyimpanan Gagal', 'Gagal menyimpan kredensial Instagram Graph API.');
            },
        });
    };

    const handleTestInstagram = () => {
        setIsTestingIg(true);
        router.post(
            '/settings/instagram/test',
            {
                account_id: igForm.data.account_id,
                access_token: igForm.data.access_token,
            },
            {
                preserveScroll: true,
                onFinish: () => setIsTestingIg(false),
            }
        );
    };

    const handleDisconnectInstagram = () => {
        if (!confirm('Apakah Anda yakin ingin memutuskan integrasi akun Instagram ini dari SPARC?')) {
            return;
        }
        setIsDisconnectingIg(true);
        router.delete('/settings/instagram/disconnect', {
            preserveScroll: true,
            onFinish: () => setIsDisconnectingIg(false),
        });
    };

    const handleSelectCandidateAccount = (accId: string) => {
        setSelectedCandidateId(accId);
        router.post(
            '/settings/instagram/select-account',
            { account_id: accId },
            { preserveScroll: true }
        );
    };

    const handleSaveSettings = (e: React.FormEvent) => {
        e.preventDefault();
        form.patch('/settings', {
            preserveScroll: true,
            onError: () => {
                toastError(
                    'Validasi Konfigurasi Gagal',
                    'Periksa rentang target bulanan (1–500) dan interval polling (15–120 detik).'
                );
            },
        });
    };

    const handleSyncHaloApu = () => {
        setIsSyncing(true);
        router.post(
            '/settings/haloapu/sync',
            {},
            {
                preserveScroll: true,
                onError: () => {
                    toastError('Sinkronisasi Gagal', 'Koneksi REST API HALO APU sedang tidak merespons.');
                },
                onFinish: () => setIsSyncing(false),
            }
        );
    };

    return (
        <AppLayout
            title="System Settings"
            subtitle="Konfigurasi parameter operasional SPARC v3, standar taksonomi komunikasi, dan pemantauan integrasi REST API HALO APU"
        >
            <Head title="Settings - SPARC" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left Column: Operational Parameters & Taxonomy */}
                <div className="lg:col-span-7 space-y-5">
                    <form
                        onSubmit={handleSaveSettings}
                        className="p-5 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-4"
                        noValidate
                    >
                        <div className="flex items-center gap-2 pb-3 border-b border-[var(--md-sys-color-outline-variant)]">
                            <Sliders className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                            <div>
                                <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                    Parameter Operasional Ruang Kerja
                                </h3>
                                <p className="text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                    Berlaku bagi kalkulasi target dashboard, jam kerja tim, dan polling notifikasi cPanel
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input
                                type="number"
                                min={1}
                                max={500}
                                label="Target Publikasi Bulanan (Konten)"
                                required
                                value={form.data.monthly_content_target}
                                onChange={(e) =>
                                    form.setData('monthly_content_target', Number(e.target.value))
                                }
                                error={form.errors.monthly_content_target}
                            />

                            <Input
                                type="number"
                                min={15}
                                max={120}
                                label="Interval Short-Polling Notifikasi (Detik)"
                                required
                                value={form.data.polling_interval_seconds}
                                onChange={(e) =>
                                    form.setData('polling_interval_seconds', Number(e.target.value))
                                }
                                error={form.errors.polling_interval_seconds}
                            />

                            <Input
                                type="time"
                                label="Jam Mulai Operasional HUMAS"
                                required
                                value={form.data.working_hours_start}
                                onChange={(e) =>
                                    form.setData('working_hours_start', e.target.value)
                                }
                                error={form.errors.working_hours_start}
                            />

                            <Input
                                type="time"
                                label="Jam Selesai Operasional HUMAS"
                                required
                                value={form.data.working_hours_end}
                                onChange={(e) => form.setData('working_hours_end', e.target.value)}
                                error={form.errors.working_hours_end}
                            />
                        </div>

                        <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex justify-end">
                            <Button
                                type="submit"
                                variant="primary"
                                size="sm"
                                isLoading={form.processing}
                                icon={<Save className="w-3.5 h-3.5" />}
                            >
                                Simpan Konfigurasi
                            </Button>
                        </div>
                    </form>

                    {/* Active Taxonomy Reference */}
                    <div className="p-5 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-4">
                        <div className="flex items-center gap-2 pb-3 border-b border-[var(--md-sys-color-outline-variant)]">
                            <Layers className="w-4 h-4 text-[var(--md-sys-color-secondary)]" />
                            <div>
                                <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                    Standar Pilar Komunikasi & Kanal Resmi
                                </h3>
                                <p className="text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                    Token semantik terpisah agar status alur, prioritas, kanal, dan pilar tidak saling tertukar
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <span className="sparc-eyebrow block mb-2">Pilar Komunikasi Aktif</span>
                                <div className="flex flex-wrap gap-2">
                                    {(settings.contentPilars ?? []).map((p) => (
                                        <PillarTag key={p.key} pillar={p.key} />
                                    ))}
                                </div>
                            </div>

                            <div>
                                <span className="sparc-eyebrow block mb-2">Kanal Distribusi Resmi</span>
                                <div className="flex flex-wrap gap-2">
                                    {(settings.platforms ?? []).map((pl) => (
                                        <PlatformChip key={pl.key} platform={pl.key} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: HALO APU Integration & Sync Logs */}
                <div className="lg:col-span-5 space-y-5">
                    <div className="p-5 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-4">
                        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--md-sys-color-outline-variant)]">
                            <div className="flex items-center gap-2.5">
                                <Server className="w-4 h-4 text-[var(--md-sys-color-primary)] shrink-0" />
                                <div>
                                    <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                        Integrasi REST API HALO APU
                                    </h3>
                                    <p className="text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                        Sinkronisasi tiket permohonan publikasi unit kerja Humas
                                    </p>
                                </div>
                            </div>

                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${settings.haloApu?.isEnabled ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]' : 'bg-muted text-muted-foreground'}`}>
                                <CheckCircle2 className="w-3 h-3" /> {settings.haloApu?.isEnabled ? 'Terhubung' : 'Belum Aktif'}
                            </span>
                        </div>

                        {/* Configuration Form */}
                        <form onSubmit={handleSaveHaloApu} className="space-y-3.5">
                            <Input
                                label="Base URL HaloAPU"
                                placeholder="http://localhost:8001 atau https://haloapu.id"
                                value={haloApuForm.data.base_url}
                                onChange={(e) => haloApuForm.setData('base_url', e.target.value)}
                                error={haloApuForm.errors.base_url}
                            />

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Input
                                    type="password"
                                    label="API Bearer Token"
                                    placeholder={settings.haloApu?.isEnabled ? '•••••••• (tersimpan)' : 'Salin dari HaloAPU'}
                                    value={haloApuForm.data.api_token}
                                    onChange={(e) => haloApuForm.setData('api_token', e.target.value)}
                                    error={haloApuForm.errors.api_token}
                                />
                                <Input
                                    type="password"
                                    label="Webhook HMAC Secret"
                                    placeholder={settings.haloApu?.isEnabled ? '•••••••• (tersimpan)' : 'Salin dari HaloAPU'}
                                    value={haloApuForm.data.webhook_secret}
                                    onChange={(e) => haloApuForm.setData('webhook_secret', e.target.value)}
                                    error={haloApuForm.errors.webhook_secret}
                                />
                            </div>

                            <div className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
                                <div className="space-y-0.5">
                                    <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)] block">
                                        Auto-Solve Saat Konten Published
                                    </span>
                                    <span className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] block">
                                        Tiket HaloAPU otomatis berstatus Selesai (solve) saat tayang di medsos.
                                    </span>
                                </div>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded accent-[var(--md-sys-color-primary)] cursor-pointer"
                                    checked={haloApuForm.data.auto_solve_on_publish}
                                    onChange={(e) => haloApuForm.setData('auto_solve_on_publish', e.target.checked)}
                                />
                            </div>

                            <div className="p-3 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] space-y-1.5 text-xs">
                                <span className="sparc-eyebrow block">Endpoint Webhook SPARC (Didaftarkan di HaloAPU):</span>
                                <code className="block p-1.5 rounded bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] font-mono text-[10px] select-all">
                                    {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/haloapu` : '/api/webhooks/haloapu'}
                                </code>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-1">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    isLoading={isTestingHaloApu}
                                    onClick={handleTestHaloApu}
                                >
                                    Tes Koneksi
                                </Button>
                                <Button
                                    type="submit"
                                    variant="primary"
                                    size="sm"
                                    isLoading={haloApuForm.processing}
                                >
                                    Simpan Konfigurasi
                                </Button>
                            </div>
                        </form>

                        <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] space-y-3">
                            <div className="p-3.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] flex items-center justify-between gap-2 text-xs">
                                <span className="text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5" /> Sinkronisasi Terakhir:
                                </span>
                                <span className="sparc-code-id font-bold text-[var(--md-sys-color-on-surface)]">
                                    {settings.haloApu?.lastSyncAt || settings.lastSyncAt}
                                </span>
                            </div>

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full justify-center"
                                isLoading={isSyncing}
                                icon={<RefreshCw className="w-3.5 h-3.5" />}
                                onClick={handleSyncHaloApu}
                            >
                                Sinkronisasi Tiket HALO APU Sekarang
                            </Button>

                            <div className="space-y-2 pt-2">
                                <span className="sparc-eyebrow block">Riwayat Log Sinkronisasi</span>
                                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                                    {(settings.haloApuLogs ?? []).map((log) => (
                                        <div
                                            key={log.id}
                                            className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] space-y-1 text-xs"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="sparc-code-id font-semibold text-[var(--md-sys-color-on-surface)]">
                                                    {log.timestamp}
                                                </span>
                                                <span className="sparc-code-id text-[10px] font-bold text-[var(--md-sys-color-secondary)]">
                                                    {log.latencyMs} ms • +{log.fetched} tiket
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                                {log.note}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Instagram Graph API Integration Card */}
                    <div className="p-5 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-4">
                        {/* Header Status */}
                        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--md-sys-color-outline-variant)]">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                                    <RefreshCw className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                        Integrasi Instagram Graph API
                                    </h3>
                                    <p className="text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                        Otorisasi resmi Meta & sinkronisasi metrik performa postingan
                                    </p>
                                </div>
                            </div>

                            {settings.instagram?.connected ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> @{settings.instagram.username}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                                        isLoading={isDisconnectingIg}
                                        onClick={handleDisconnectInstagram}
                                        title="Putuskan akun Instagram"
                                    >
                                        <Unlink className="w-3 h-3" /> Putuskan
                                    </Button>
                                </div>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-muted)]">
                                    Belum Terhubung
                                </span>
                            )}
                        </div>

                        {/* Connection Metadata Pill */}
                        {settings.instagram?.connected && (
                            <div className="space-y-3">
                                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-2.5">
                                        {settings.instagram.profilePictureUrl && (
                                            <img
                                                src={settings.instagram.profilePictureUrl}
                                                alt={settings.instagram.username}
                                                className="w-9 h-9 rounded-full object-cover border border-emerald-500/30"
                                            />
                                        )}
                                        <div className="space-y-0.5">
                                            <span className="font-bold text-emerald-800 dark:text-emerald-300 block">
                                                @{settings.instagram.username}
                                                {settings.instagram.followersCount !== null && settings.instagram.followersCount !== undefined
                                                    ? ` • ${settings.instagram.followersCount.toLocaleString('id-ID')} pengikut`
                                                    : ''}
                                            </span>
                                            {settings.instagram.pageName && (
                                                <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] block">
                                                    Page: {settings.instagram.pageName}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {settings.instagram.tokenDaysRemaining !== null && settings.instagram.tokenDaysRemaining !== undefined ? (
                                            <span className="sparc-code-id text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 block">
                                                Token Aktif • {settings.instagram.tokenDaysRemaining} hari tersisa
                                            </span>
                                        ) : (
                                            <span className="sparc-code-id text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 block">
                                                Token Aktif (60 Hari)
                                            </span>
                                        )}
                                        {settings.instagram.lastSyncedAt && (
                                            <span className="text-[10px] text-[var(--md-sys-color-on-surface-muted)] block">
                                                Terakhir Sync: {settings.instagram.lastSyncedAt}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Capability Inspector Badges */}
                                <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="sparc-eyebrow">Kapabilitas Token Aktif (/me/permissions)</span>
                                        <div className="flex items-center gap-1.5">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                isLoading={isSyncingProfile}
                                                onClick={handleSyncIgProfile}
                                            >
                                                Sync Profil & Insights
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                isLoading={isSyncingAds}
                                                onClick={handleSyncAds}
                                            >
                                                Sync Ads API
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                isLoading={isRefreshingToken}
                                                onClick={handleRefreshIgToken}
                                            >
                                                Perpanjang Token
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[11px]">
                                        {[
                                            { key: 'basic', label: 'Profil & Media', ok: settings.instagram.capabilities?.basic ?? true },
                                            { key: 'insights', label: 'Insights 28h', ok: settings.instagram.capabilities?.insights ?? false },
                                            { key: 'publish', label: 'Direct Publish', ok: settings.instagram.capabilities?.publish ?? false },
                                            { key: 'comments', label: 'Moderasi Komentar', ok: settings.instagram.capabilities?.comments ?? false },
                                            { key: 'ads', label: 'Meta Ads', ok: settings.instagram.capabilities?.ads ?? false },
                                        ].map((cap) => (
                                            <div
                                                key={cap.key}
                                                className={`px-2 py-1.5 rounded-lg border flex items-center gap-1.5 font-semibold ${
                                                    cap.ok
                                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                                                        : 'bg-[var(--md-sys-color-surface)] border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-muted)]'
                                                }`}
                                            >
                                                <CheckCircle2 className={`w-3 h-3 shrink-0 ${cap.ok ? 'text-emerald-600' : 'opacity-40'}`} />
                                                <span className="truncate">{cap.label}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Rate-Limit Quota Meter */}
                                    {settings.instagram.rateLimitUsage && (
                                        <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)] space-y-1">
                                            <div className="flex items-center justify-between text-[11px]">
                                                <span className="text-[var(--md-sys-color-on-surface-muted)]">
                                                    Kuota Meta Graph API ({settings.instagram.rateLimitUsage.source || 'x-app-usage'}):
                                                </span>
                                                <span className="sparc-code-id font-bold text-[var(--md-sys-color-on-surface)]">
                                                    Call {settings.instagram.rateLimitUsage.call_pct}% • CPU {settings.instagram.rateLimitUsage.cpu_pct}% • Time {settings.instagram.rateLimitUsage.time_pct}%
                                                </span>
                                            </div>
                                            <div className="w-full h-1.5 rounded-full bg-[var(--md-sys-color-surface-container-highest)] overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${
                                                        Math.max(
                                                            settings.instagram.rateLimitUsage.call_pct,
                                                            settings.instagram.rateLimitUsage.cpu_pct,
                                                            settings.instagram.rateLimitUsage.time_pct
                                                        ) >= 80
                                                            ? 'bg-amber-500'
                                                            : 'bg-emerald-500'
                                                    }`}
                                                    style={{
                                                        width: `${Math.min(
                                                            100,
                                                            Math.max(
                                                                4,
                                                                settings.instagram.rateLimitUsage.call_pct,
                                                                settings.instagram.rateLimitUsage.cpu_pct,
                                                                settings.instagram.rateLimitUsage.time_pct
                                                            )
                                                        )}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Multi-Account Candidate Selection (if > 1 accounts found on Facebook Page) */}
                        {(settings.instagram?.candidateAccounts?.length ?? 0) > 1 && (
                            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                                        Pilih Akun Instagram yang Digunakan:
                                    </span>
                                    <span className="text-[10px] text-amber-700 dark:text-amber-300">
                                        {settings.instagram?.candidateAccounts?.length} akun ditemukan
                                    </span>
                                </div>
                                <div className="space-y-1.5">
                                    {settings.instagram?.candidateAccounts?.map((acc) => (
                                        <div
                                            key={acc.accountId}
                                            className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 text-xs transition-colors ${
                                                acc.accountId === settings.instagram?.accountId
                                                    ? 'bg-amber-500/20 border-amber-500/50 font-bold'
                                                    : 'bg-[var(--md-sys-color-surface)] border-[var(--md-sys-color-outline-variant)]'
                                            }`}
                                        >
                                            <div>
                                                <span className="text-[var(--md-sys-color-on-surface)]">
                                                    @{acc.username}
                                                </span>
                                                {acc.pageName && (
                                                    <span className="text-[10px] text-[var(--md-sys-color-on-surface-muted)] block">
                                                        Page: {acc.pageName}
                                                    </span>
                                                )}
                                            </div>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={acc.accountId === settings.instagram?.accountId ? 'primary' : 'outline'}
                                                disabled={acc.accountId === settings.instagram?.accountId}
                                                onClick={() => handleSelectCandidateAccount(acc.accountId)}
                                            >
                                                {acc.accountId === settings.instagram?.accountId ? 'Sedang Digunakan' : 'Gunakan Akun Ini'}
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Main OAuth Section: Facebook Login */}
                        <div className="space-y-3.5">
                            {/* Pre-requisite Guide if not connected */}
                            {!settings.instagram?.connected && (
                                <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs space-y-2">
                                    <div className="flex items-center gap-2 font-bold text-blue-900 dark:text-blue-300">
                                        <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                        <span>3 Syarat Menghubungkan Instagram:</span>
                                    </div>
                                    <ol className="list-decimal list-inside space-y-1 text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
                                        <li>Akun Instagram wajib bertipe <strong>Profesional / Bisnis</strong> (Gratis via HP).</li>
                                        <li>Instagram ditautkan ke <strong>Halaman Facebook (Page)</strong> via <em>Edit Profil &rarr; Halaman</em>.</li>
                                        <li>Login menggunakan akun Facebook yang menjadi <strong>Admin</strong> Halaman tersebut.</li>
                                    </ol>
                                </div>
                            )}

                            {/* Meta Developer Setup Helper Box */}
                            <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                                        Valid OAuth Redirect URI:
                                    </span>
                                    <button
                                        type="button"
                                        onClick={handleCopyRedirectUri}
                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--md-sys-color-primary)] hover:underline cursor-pointer"
                                    >
                                        {copiedUri ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                        {copiedUri ? 'Disalin!' : 'Salin URI'}
                                    </button>
                                </div>
                                <div className="p-2 rounded-lg bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] text-[11px] font-mono break-all text-[var(--md-sys-color-on-surface-variant)] select-all">
                                    {settings.instagram?.redirectUri || (typeof window !== 'undefined' ? `${window.location.origin}/settings/instagram/oauth/callback` : '/settings/instagram/oauth/callback')}
                                </div>
                                <div className="flex items-start gap-1.5 pt-1 text-[10.5px] text-[var(--md-sys-color-on-surface-muted)] leading-normal">
                                    <AlertCircle className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                                    <span>
                                        Pastikan di Meta Developers (<em>Pengaturan &rarr; Dasar</em>) terisi <strong>Domain:</strong> <code>localhost</code> dan platform <strong>Situs Web:</strong> <code>http://localhost:8000/</code>.
                                    </span>
                                </div>
                            </div>

                            {/* Credentials summary or edit form */}
                            {settings.instagram?.hasAppSecret && !showEditCreds ? (
                                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between gap-3 text-xs">
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                            <span>Kredensial Meta App Terkonfigurasi</span>
                                        </div>
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                            App ID: {settings.instagram.appId} • Secret: Tersimpan (Terenkripsi)
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowEditCreds(true)}
                                        className="text-[11px] font-bold text-[var(--md-sys-color-primary)] hover:underline cursor-pointer"
                                    >
                                        Ubah Kredensial
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                                            Kredensial Meta App:
                                        </span>
                                        {settings.instagram?.hasAppSecret && (
                                            <button
                                                type="button"
                                                onClick={() => setShowEditCreds(false)}
                                                className="text-[11px] font-bold text-slate-500 hover:underline cursor-pointer"
                                            >
                                                Batal Ubah
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <Input
                                            label="Meta App ID"
                                            placeholder="Contoh: 123456789012345"
                                            value={igForm.data.app_id}
                                            onChange={(e) => igForm.setData('app_id', e.target.value)}
                                        />
                                        <Input
                                            type="password"
                                            label="Meta App Secret"
                                            placeholder={settings.instagram?.hasAppSecret ? 'Tersimpan (terenkripsi) — isi untuk mengganti' : 'Contoh: a1b2c3d4e5f6...'}
                                            value={igForm.data.app_secret}
                                            onChange={(e) => igForm.setData('app_secret', e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Smart OAuth Scope Selection */}
                            <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] space-y-2">
                                <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] block">
                                    Cakupan Izin OAuth Meta (Smart Scopes):
                                </span>
                                <div className="space-y-1.5 text-[11px]">
                                    {[
                                        {
                                            key: 'instagram_manage_insights',
                                            label: 'Analitik Mendalam (Reach, Views, Saves, Shares & Jam Aktif Audiens)',
                                        },
                                        {
                                            key: 'instagram_content_publish',
                                            label: 'Direct Publishing & Penjadwalan Otomatis (Feed, Carousel, Reels)',
                                        },
                                        {
                                            key: 'instagram_manage_comments',
                                            label: 'Kotak Masuk & Moderasi Komentar Publik (Balas, Sembunyikan, Hapus)',
                                        },
                                        {
                                            key: 'business_management',
                                            label: 'Akses Business Portfolio / Business Manager (Aktifkan jika Halaman ada di Meta Business Suite)',
                                        },
                                        {
                                            key: 'ads_read',
                                            label: 'Meta Marketing API (Monitoring Iklan, Kampanye, Spend & Clicks)',
                                        },
                                    ].map((sc) => (
                                        <label
                                            key={sc.key}
                                            className="flex items-start gap-2 cursor-pointer text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]"
                                        >
                                            <input
                                                type="checkbox"
                                                className="mt-0.5 rounded border-[var(--md-sys-color-outline)]"
                                                checked={igForm.data.requested_scopes.includes(sc.key)}
                                                onChange={() => toggleOptionalScope(sc.key)}
                                            />
                                            <span>{sc.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Prominent Action Button */}
                            <button
                                type="button"
                                 onClick={handleFacebookLogin}
                                 disabled={isConnectingFb}
                                className="w-full h-11 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 bg-[#1877F2] hover:bg-[#166FE5] text-white shadow-xs hover:shadow-md active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60"
                             >
                                <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24">
                                     <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                 </svg>
                                <span>
                                    {isConnectingFb
                                        ? 'Menghubungkan ke Meta...'
                                        : settings.instagram?.connected
                                        ? 'Perbarui Otorisasi Meta (Ganti Akun)'
                                        : 'Hubungkan via Facebook Login'}
                                </span>
                             </button>
                         </div>

                        {/* Collapsible Advanced: Manual Token Fallback */}
                        <details className="group pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                            <summary className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] cursor-pointer flex items-center justify-between select-none py-1 hover:text-[var(--md-sys-color-on-surface)]">
                                <span>Mode Lanjutan: Input Token Manual (Cadangan)</span>
                                <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
                            </summary>
                            <form onSubmit={handleSaveInstagram} className="space-y-3 pt-3" noValidate>
                                <Input
                                    label="Instagram Business Account ID / Page ID"
                                    placeholder="Contoh: 17841400000000000"
                                    value={igForm.data.account_id}
                                    onChange={(e) => igForm.setData('account_id', e.target.value)}
                                />

                                <Input
                                    type="password"
                                    label="Meta User / Page Access Token"
                                    placeholder={settings.instagram?.hasAccessToken ? 'Tersimpan (terenkripsi) — isi untuk mengganti' : 'EAA...'}
                                    value={igForm.data.access_token}
                                    onChange={(e) => igForm.setData('access_token', e.target.value)}
                                />

                                <div className="pt-2 flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="flex-1 justify-center"
                                        disabled={(!igForm.data.account_id && !settings.instagram?.accountId) || isTestingIg}
                                        isLoading={isTestingIg}
                                        icon={<RefreshCw className="w-3.5 h-3.5" />}
                                        onClick={handleTestInstagram}
                                    >
                                        Uji Koneksi Meta
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        size="sm"
                                        className="flex-1 justify-center"
                                        disabled={igForm.processing}
                                        isLoading={igForm.processing}
                                        icon={<Save className="w-3.5 h-3.5" />}
                                    >
                                        Simpan Manual
                                    </Button>
                                </div>
                            </form>
                        </details>

                        {/* Graph API Sync Telemetry Logs */}
                        {(settings.instagram?.syncLogs?.length ?? 0) > 0 && (
                            <details className="group pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                                <summary className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] cursor-pointer flex items-center justify-between select-none py-1 hover:text-[var(--md-sys-color-on-surface)]">
                                    <span>Riwayat Log Meta Graph API ({settings.instagram?.syncLogs?.length})</span>
                                    <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
                                </summary>
                                <div className="space-y-1.5 pt-2 max-h-[220px] overflow-y-auto pr-1">
                                    {settings.instagram?.syncLogs?.map((log) => (
                                        <div
                                            key={log.id}
                                            className="p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] text-[11px] space-y-0.5"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="sparc-code-id font-bold text-[var(--md-sys-color-on-surface)]">
                                                    {log.operation}
                                                </span>
                                                <span
                                                    className={`sparc-code-id text-[10px] font-bold ${
                                                        log.status === 'success'
                                                            ? 'text-emerald-600 dark:text-emerald-400'
                                                            : 'text-red-600 dark:text-red-400'
                                                    }`}
                                                >
                                                    {log.latencyMs} ms • {log.timestamp}
                                                </span>
                                            </div>
                                            <p className="text-[var(--md-sys-color-on-surface-muted)]">{log.note}</p>
                                        </div>
                                    ))}
                                </div>
                            </details>
                        )}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
