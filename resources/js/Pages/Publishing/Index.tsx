import React, { useEffect, useMemo, useState } from 'react';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    CalendarClock,
    CheckCircle2,
    Circle,
    Clock,
    ExternalLink,
    Image as ImageIcon,
    Layers,
    Link2,
    Plus,
    Send,
    Sparkles,
    TrendingUp,
    Upload,
    Video,
    XCircle,
} from 'lucide-react';
import { AppLayout, type SharedWorkspaceProps } from '@/Layouts/AppLayout';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
import { Modal } from '@/Components/UI/Modal';
import { Select } from '@/Components/UI/Select';
import { ContentIdBadge, PlatformChip } from '@/Components/UI/Semantics';
import { Tabs } from '@/Components/UI/Tabs';
import { Textarea } from '@/Components/UI/Textarea';
import { useToast } from '@/Components/UI/Toast';
import type {
    InstagramScheduleItem,
    SparcContentItem,
    SparcPublication,
    SparcSystemSettings,
} from '@/types/sparc';

interface PublishingPageProps {
    today?: string;
    contentItems?: SparcContentItem[];
    publications?: SparcPublication[];
    igSchedules?: InstagramScheduleItem[];
    isLocalStorage?: boolean;
    instagramSettings?: SparcSystemSettings['instagram'];
}

export default function PublishingIndex({
    today = '2026-10-27',
    contentItems = [],
    publications = [],
    igSchedules = [],
    isLocalStorage = false,
    instagramSettings,
}: PublishingPageProps) {
    const { props } = usePage<SharedWorkspaceProps>();
    const can = props.auth?.can;
    const { error: toastError } = useToast();

    const [pubs, setPubs] = useState<SparcPublication[]>(publications);
    useEffect(() => {
        setPubs(publications);
    }, [publications]);

    const [activeTab, setActiveTab] = useState<'queue' | 'published'>('queue');
    const [platformFilter, setPlatformFilter] = useState('all');
    const [urlInputs, setUrlInputs] = useState<Record<string, string>>({});
    const [publishingId, setPublishingId] = useState<string | null>(null);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [igModalPub, setIgModalPub] = useState<SparcPublication | null>(null);
    const [cancellingScheduleId, setCancellingScheduleId] = useState<string | null>(null);

    const bestPostingHours =
        instagramSettings?.bestPostingHours ?? props.instagramStatus?.bestPostingHours ?? [];

    const igPublishForm = useForm<{
        publication_id: string;
        content_item_id: string;
        media_type: 'IMAGE' | 'CAROUSEL' | 'REELS';
        publish_mode: 'immediate' | 'scheduled';
        scheduled_at: string;
        caption: string;
        cover_url: string;
        share_to_feed: boolean;
        media_urls: string;
        media_files: File[];
    }>({
        publication_id: '',
        content_item_id: '',
        media_type: 'IMAGE',
        publish_mode: 'immediate',
        scheduled_at: `${today}T19:00`,
        caption: '',
        cover_url: '',
        share_to_feed: true,
        media_urls: '',
        media_files: [],
    });

    const openIgPublishModal = (pub: SparcPublication) => {
        const linkedItem = contentItems.find(
            (ci) => ci.id === pub.contentItemId || ci.contentId === pub.contentId
        );
        const rawFormat = (pub.format || linkedItem?.format || '').toLowerCase();
        const inferredMediaType: 'IMAGE' | 'CAROUSEL' | 'REELS' =
            rawFormat.includes('reel') || rawFormat.includes('video')
                ? 'REELS'
                : rawFormat.includes('carousel')
                  ? 'CAROUSEL'
                  : 'IMAGE';

        const defaultSched = pub.scheduledAt
            ? pub.scheduledAt.replace(' ', 'T').slice(0, 16)
            : `${today}T19:00`;

        const candidateDesignUrl = pub.mediaPreviewUrl || linkedItem?.resultDesignUrl || '';
        const prefillMediaUrl =
            candidateDesignUrl.startsWith('https://') &&
            !candidateDesignUrl.includes('canva.com') &&
            !candidateDesignUrl.includes('figma.com') &&
            !candidateDesignUrl.includes('drive.google.com')
                ? candidateDesignUrl
                : '';

        igPublishForm.clearErrors();
        igPublishForm.setData({
            publication_id: pub.id,
            content_item_id: pub.contentItemId || linkedItem?.id || '',
            media_type: inferredMediaType,
            publish_mode: 'immediate',
            scheduled_at: defaultSched,
            caption: pub.caption || linkedItem?.caption || pub.title,
            cover_url: '',
            share_to_feed: true,
            media_urls: prefillMediaUrl,
            media_files: [],
        });
        setIgModalPub(pub);
    };

    const handleSubmitIgPublish = (e: React.FormEvent) => {
        e.preventDefault();
        igPublishForm.post('/publishing/instagram/publish', {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                setIgModalPub(null);
            },
            onError: (errs) => {
                const firstErr = Object.values(errs)[0];
                if (firstErr) {
                    toastError('Validasi Publikasi Instagram', firstErr);
                }
            },
        });
    };

    const handleCancelIgSchedule = (scheduleId: string) => {
        setCancellingScheduleId(scheduleId);
        router.delete(`/publishing/instagram/schedules/${scheduleId}`, {
            preserveScroll: true,
            onFinish: () => setCancellingScheduleId(null),
        });
    };

    const pendingPubs = useMemo(
        () =>
            pubs.filter(
                (p) =>
                    !p.publishedActualAt &&
                    (platformFilter === 'all' || p.platform === platformFilter)
            ),
        [pubs, platformFilter]
    );

    const completedPubs = useMemo(
        () =>
            pubs.filter(
                (p) =>
                    Boolean(p.publishedActualAt) &&
                    (platformFilter === 'all' || p.platform === platformFilter)
            ),
        [pubs, platformFilter]
    );

    const dueTodayCount = useMemo(
        () =>
            pubs.filter(
                (p) => !p.publishedActualAt && p.scheduledAt.slice(0, 10) <= today
            ).length,
        [pubs, today]
    );

    const createSlotForm = useForm({
        content_item_id: contentItems[0]?.id ?? '',
        platform: 'instagram',
        scheduled_at: `${today}T16:30`,
    });

    const handleToggleChecklist = (pubId: string, itemKey: string, currentChecked: boolean) => {
        if (!can?.managePublishing) {
            return;
        }
        const nextChecked = !currentChecked;
        const previousSnapshot = pubs;

        setPubs((curr) =>
            curr.map((p) => {
                if (p.id !== pubId) {
                    return p;
                }
                return {
                    ...p,
                    checklist: p.checklist.map((c) =>
                        c.key === itemKey ? { ...c, checked: nextChecked } : c
                    ),
                };
            })
        );

        router.patch(
            `/publications/${pubId}/checklist`,
            { key: itemKey, checked: nextChecked },
            {
                preserveScroll: true,
                preserveState: true,
                onError: () => {
                    setPubs(previousSnapshot);
                    toastError(
                        'Gagal Memperbarui Checklist',
                        'Perubahan status pra-publikasi belum tersimpan.'
                    );
                },
            }
        );
    };

    const handleMarkPublished = (e: React.FormEvent, pub: SparcPublication) => {
        e.preventDefault();
        const url = (urlInputs[pub.id] ?? '').trim();
        if (!url) {
            toastError('URL Bukti Tayang Wajib Diisi', 'Masukkan tautan postingan resmi (https://...).');
            return;
        }
        setPublishingId(pub.id);
        router.post(
            `/publications/${pub.id}/publish`,
            { published_url: url },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setUrlInputs((prev) => ({ ...prev, [pub.id]: '' }));
                },
                onError: (errors) => {
                    toastError(
                        'Publikasi Belum Dapat Diselesaikan',
                        errors.published_url || 'Pastikan seluruh checklist kanal telah dicentang.'
                    );
                },
                onFinish: () => setPublishingId(null),
            }
        );
    };

    const handleCreateSlot = (e: React.FormEvent) => {
        e.preventDefault();
        createSlotForm.post('/publications', {
            preserveScroll: true,
            onSuccess: () => {
                setCreateModalOpen(false);
            },
            onError: () => {
                toastError('Gagal Membuat Slot', 'Pilih konten dan waktu penayangan yang valid.');
            },
        });
    };

    return (
        <AppLayout
            title="Publishing & Optimization"
            subtitle="Kontrol kualitas pra-publikasi per kanal, verifikasi tautan tayang resmi, dan serah-terima ke pelaporan performa"
            actions={
                can?.managePublishing ? (
                    <Button
                        variant="primary"
                        size="sm"
                        icon={<Plus className="w-3.5 h-3.5" />}
                        onClick={() => {
                            createSlotForm.clearErrors();
                            setCreateModalOpen(true);
                        }}
                    >
                        Slot Publikasi Baru
                    </Button>
                ) : undefined
            }
        >
            <Head title="Publishing & Optimization - SPARC" />

            <div className="space-y-5">
                {/* Summary KPI Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                        <span className="sparc-eyebrow block">Antrean Menunggu Tayang</span>
                        <span className="sparc-code-id text-2xl font-black text-[var(--md-sys-color-on-surface)] mt-1 block">
                            {pubs.filter((p) => !p.publishedActualAt).length}
                        </span>
                    </div>
                    <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                        <span className="sparc-eyebrow block">Jadwal Hari Ini / Terlewat</span>
                        <span
                            className={`sparc-code-id text-2xl font-black mt-1 block ${
                                dueTodayCount > 0
                                    ? 'text-[var(--md-sys-color-tertiary)]'
                                    : 'text-[var(--md-sys-color-on-surface)]'
                            }`}
                        >
                            {dueTodayCount}
                        </span>
                    </div>
                    <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                        <span className="sparc-eyebrow block">Telah Resmi Tayang</span>
                        <span className="sparc-code-id text-2xl font-black text-[var(--md-sys-color-secondary)] mt-1 block">
                            {pubs.filter((p) => Boolean(p.publishedActualAt)).length}
                        </span>
                    </div>
                </div>

                {/* Tabs & Platform Filter */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <Tabs
                        tabs={[
                            {
                                id: 'queue',
                                label: `Antrean Pra-Publikasi (${pendingPubs.length})`,
                            },
                            {
                                id: 'published',
                                label: `Riwayat Tayang (${completedPubs.length})`,
                            },
                        ]}
                        activeTab={activeTab}
                        onChange={(id) => setActiveTab(id as 'queue' | 'published')}
                    />

                    <select
                        aria-label="Filter kanal publikasi"
                        value={platformFilter}
                        onChange={(e) => setPlatformFilter(e.target.value)}
                        className="h-9 text-xs bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 text-[var(--md-sys-color-on-surface)] font-medium cursor-pointer"
                    >
                        <option value="all">Semua Kanal Distribusi</option>
                        <option value="instagram">Instagram</option>
                        <option value="tiktok">TikTok</option>
                        <option value="youtube">YouTube</option>
                        <option value="website">Website Resmi</option>
                        <option value="whatsapp">WhatsApp Broadcast</option>
                    </select>
                </div>

                {/* TAB 1: PENDING PRE-PUBLISH CHECKLIST QUEUE */}
                {activeTab === 'queue' && (
                    <div className="space-y-4">
                        {pendingPubs.length === 0 ? (
                            <div className="p-12 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] text-center space-y-2">
                                <CheckCircle2 className="w-9 h-9 text-[var(--md-sys-color-secondary)] mx-auto" />
                                <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                    Seluruh antrean publikasi kanal terpilih telah tuntas
                                </p>
                                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                    Konten yang disetujui ke tahap Siap Tayang akan otomatis muncul di sini beserta checklist kanalnya.
                                </p>
                            </div>
                        ) : (
                            pendingPubs.map((pub) => {
                                const checkedCount = pub.checklist.filter((c) => c.checked).length;
                                const totalCount = pub.checklist.length;
                                const allReady = totalCount > 0 && checkedCount === totalCount;
                                const schedDate = pub.scheduledAt.slice(0, 10);
                                const isOverdue = schedDate < today;
                                const isToday = schedDate === today;

                                return (
                                    <div
                                        key={pub.id}
                                        className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] p-5 space-y-4"
                                    >
                                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 pb-3.5 border-b border-[var(--md-sys-color-outline-variant)]/70">
                                            <div className="space-y-1.5 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <ContentIdBadge contentId={pub.contentId} />
                                                    <PlatformChip platform={pub.platform} />
                                                    {isOverdue && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]">
                                                            <AlertTriangle className="w-3 h-3" /> Melewati Jadwal ({pub.scheduledAt})
                                                        </span>
                                                    )}
                                                    {isToday && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]">
                                                            <Clock className="w-3 h-3" /> Tayang Hari Ini • {pub.scheduledAt.slice(11, 16)} WIB
                                                        </span>
                                                    )}
                                                    {!isOverdue && !isToday && (
                                                        <span className="sparc-code-id text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                                            Jadwal: {pub.scheduledAt} WIB
                                                        </span>
                                                    )}
                                                </div>

                                                <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                                    {pub.title}
                                                </h3>
                                                <p className="text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                                    Publisher PIC: {pub.picName}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                <span
                                                    className={`sparc-code-id px-2.5 py-1 rounded-full text-xs font-bold border ${
                                                        allReady
                                                            ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] border-[var(--md-sys-color-secondary)]/30'
                                                            : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] border-[var(--md-sys-color-outline-variant)]'
                                                    }`}
                                                >
                                                    Checklist {checkedCount}/{totalCount}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Channel Pre-Publish Optimization Checklist */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {pub.checklist.map((item) => (
                                                <button
                                                    key={item.key}
                                                    type="button"
                                                    disabled={!can?.managePublishing}
                                                    onClick={() =>
                                                        handleToggleChecklist(
                                                            pub.id,
                                                            item.key,
                                                            item.checked
                                                        )
                                                    }
                                                    className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 text-xs transition-colors cursor-pointer disabled:cursor-default ${
                                                        item.checked
                                                            ? 'bg-[var(--md-sys-color-secondary-container)]/35 border-[var(--md-sys-color-secondary)]/35 text-[var(--md-sys-color-on-surface)]'
                                                            : 'bg-[var(--md-sys-color-surface-container-low)] border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:border-[var(--md-sys-color-primary)]/40'
                                                    }`}
                                                >
                                                    {item.checked ? (
                                                        <CheckCircle2 className="w-4 h-4 text-[var(--md-sys-color-secondary)] shrink-0 mt-0.5" />
                                                    ) : (
                                                        <Circle className="w-4 h-4 text-[var(--md-sys-color-on-surface-muted)] shrink-0 mt-0.5" />
                                                    )}
                                                    <span className="font-medium leading-snug">
                                                        {item.label}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>

                                        {/* Active Instagram Schedule Status Banner */}
                                        {pub.platform === 'instagram' && (() => {
                                            const activeSched = igSchedules.find(
                                                (s) =>
                                                    (s.publicationSlotId === pub.id ||
                                                        (pub.contentItemId &&
                                                            s.contentItemId ===
                                                                pub.contentItemId.replace(/^ci-/, ''))) &&
                                                    ['queued', 'processing', 'failed'].includes(s.status)
                                            );
                                            if (!activeSched) {
                                                return null;
                                            }
                                            return (
                                                <div
                                                    className={`p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
                                                        activeSched.status === 'failed'
                                                            ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
                                                            : 'bg-purple-500/10 border-purple-500/30 text-purple-800 dark:text-purple-200'
                                                    }`}
                                                >
                                                    <div className="space-y-0.5 min-w-0">
                                                        <div className="flex items-center gap-1.5 font-bold">
                                                            <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                                                            <span>
                                                                {activeSched.status === 'queued'
                                                                    ? `Auto-Publish Terjadwal (${activeSched.mediaType}) • ${activeSched.scheduledAt} WIB`
                                                                    : activeSched.status === 'processing'
                                                                      ? `Sedang Diproses Meta Graph API (${activeSched.mediaType})...`
                                                                      : `Eksekusi Auto-Publish Gagal (${activeSched.mediaType})`}
                                                            </span>
                                                        </div>
                                                        {activeSched.errorMessage && (
                                                            <p className="text-[11px] opacity-90">
                                                                {activeSched.errorMessage}
                                                            </p>
                                                        )}
                                                    </div>
                                                    {can?.managePublishing && (
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            isLoading={cancellingScheduleId === activeSched.id}
                                                            icon={<XCircle className="w-3.5 h-3.5" />}
                                                            onClick={() => handleCancelIgSchedule(activeSched.id)}
                                                        >
                                                            Batalkan Jadwal
                                                        </Button>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {/* Mark as Live Form & Direct IG Publish Trigger */}
                                        {can?.managePublishing && (
                                            <form
                                                onSubmit={(e) => handleMarkPublished(e, pub)}
                                                className="pt-3 border-t border-[var(--md-sys-color-outline-variant)]/60 flex flex-col lg:flex-row lg:items-center gap-2.5"
                                                noValidate
                                            >
                                                <div className="relative flex-1">
                                                    <Link2 className="w-4 h-4 absolute left-3 top-2.5 text-[var(--md-sys-color-on-surface-muted)] pointer-events-none" />
                                                    <input
                                                        type="url"
                                                        aria-label={`URL bukti tayang ${pub.contentId}`}
                                                        placeholder={
                                                            allReady
                                                                ? 'Tempel URL postingan tayang resmi (https://...) atau gunakan Direct Publish IG...'
                                                                : 'Lengkapi seluruh checklist kanal di atas sebelum menandai tayang'
                                                        }
                                                        disabled={!allReady}
                                                        value={urlInputs[pub.id] ?? ''}
                                                        onChange={(e) =>
                                                            setUrlInputs((prev) => ({
                                                                ...prev,
                                                                [pub.id]: e.target.value,
                                                            }))
                                                        }
                                                        className="w-full h-9 pl-9 pr-3 text-xs rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25"
                                                    />
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                                    {pub.platform === 'instagram' && (
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            size="sm"
                                                            disabled={!allReady}
                                                            title={
                                                                allReady
                                                                    ? 'Publikasikan langsung atau jadwalkan otomatis via Meta Graph API'
                                                                    : 'Centang 100% checklist pra-publikasi terlebih dahulu'
                                                            }
                                                            className={
                                                                allReady
                                                                    ? 'bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white border-0 hover:opacity-95'
                                                                    : ''
                                                            }
                                                            icon={<Sparkles className="w-3.5 h-3.5" />}
                                                            onClick={() => openIgPublishModal(pub)}
                                                        >
                                                            Publish / Jadwalkan ke IG
                                                        </Button>
                                                    )}
                                                    <Button
                                                        type="submit"
                                                        variant="primary"
                                                        size="sm"
                                                        disabled={!allReady}
                                                        isLoading={publishingId === pub.id}
                                                        icon={<Send className="w-3.5 h-3.5" />}
                                                    >
                                                        Tandai Resmi Tayang
                                                    </Button>
                                                </div>
                                            </form>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {/* TAB 2: PUBLISHED HISTORY */}
                {activeTab === 'published' && (
                    <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">
                                        <th className="py-3 px-4">Kode & Judul</th>
                                        <th className="py-3 px-3">Kanal</th>
                                        <th className="py-3 px-3">Waktu Tayang Aktual</th>
                                        <th className="py-3 px-3">Publisher</th>
                                        <th className="py-3 px-3">Status Metrik</th>
                                        <th className="py-3 px-4 text-right">Tautan</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]/60">
                                    {completedPubs.map((pub) => (
                                        <tr key={pub.id} className="notion-row">
                                            <td className="py-3.5 px-4">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <ContentIdBadge contentId={pub.contentId} />
                                                </div>
                                                <span className="font-bold text-[var(--md-sys-color-on-surface)]">
                                                    {pub.title}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-3 whitespace-nowrap">
                                                <PlatformChip platform={pub.platform} />
                                            </td>
                                            <td className="py-3.5 px-3 sparc-code-id text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">
                                                {pub.publishedActualAt} WIB
                                            </td>
                                            <td className="py-3.5 px-3 text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">
                                                {pub.picName}
                                            </td>
                                            <td className="py-3.5 px-3 whitespace-nowrap">
                                                {pub.metrics && pub.metrics.reach !== null ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]">
                                                        <CheckCircle2 className="w-3 h-3" /> Tercatat ({pub.metrics.source})
                                                    </span>
                                                ) : (
                                                    <Link
                                                        href="/report"
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] hover:underline"
                                                    >
                                                        <TrendingUp className="w-3 h-3" /> Input Metrik H+3
                                                    </Link>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                                {pub.publishedUrl ? (
                                                    <a
                                                        href={pub.publishedUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-1 font-bold text-[var(--md-sys-color-primary)] hover:underline"
                                                    >
                                                        Buka Postingan <ExternalLink className="w-3.5 h-3.5" />
                                                    </a>
                                                ) : (
                                                    <span className="text-[var(--md-sys-color-on-surface-muted)]">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Create Publication Slot Modal */}
            <Modal
                isOpen={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
                title="Tambah Slot Publikasi Kanal"
                description="Siapkan checklist optimasi pra-publikasi untuk kanal distribusi tambahan"
                maxWidth="md"
            >
                <form onSubmit={handleCreateSlot} className="space-y-4" noValidate>
                    <Select
                        label="Pilih Rencana Konten"
                        value={createSlotForm.data.content_item_id}
                        onChange={(e) => createSlotForm.setData('content_item_id', e.target.value)}
                        error={createSlotForm.errors.content_item_id}
                    >
                        {contentItems.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.contentId} — {item.title}
                            </option>
                        ))}
                    </Select>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Select
                            label="Kanal Distribusi"
                            value={createSlotForm.data.platform}
                            onChange={(e) => createSlotForm.setData('platform', e.target.value)}
                            error={createSlotForm.errors.platform}
                        >
                            <option value="instagram">Instagram</option>
                            <option value="tiktok">TikTok</option>
                            <option value="youtube">YouTube</option>
                            <option value="website">Website Resmi</option>
                            <option value="whatsapp">WhatsApp Broadcast</option>
                        </Select>

                        <Input
                            type="datetime-local"
                            label="Jadwal Publikasi"
                            required
                            value={createSlotForm.data.scheduled_at}
                            onChange={(e) => createSlotForm.setData('scheduled_at', e.target.value)}
                            error={createSlotForm.errors.scheduled_at}
                        />
                    </div>

                    <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            disabled={createSlotForm.processing}
                            onClick={() => setCreateModalOpen(false)}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            isLoading={createSlotForm.processing}
                        >
                            Buat Checklist Kanal
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Direct Publish & Auto-Schedule Instagram Modal */}
            <Modal
                isOpen={Boolean(igModalPub)}
                onClose={() => setIgModalPub(null)}
                title="Direct Publish & Auto-Schedule Instagram"
                description={
                    igModalPub
                        ? `${igModalPub.contentId} — ${igModalPub.title}`
                        : 'Publikasi langsung atau penjadwalan otomatis via Meta Graph API'
                }
                maxWidth="xl"
            >
                <form onSubmit={handleSubmitIgPublish} className="space-y-4" noValidate>
                    {!instagramSettings?.connected && !props.instagramStatus?.connected && (
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
                            <span>
                                Akun Instagram Bisnis belum terhubung untuk Direct Publish. Anda tetap dapat mengaktifkan Auto-Publish Terjadwal, namun pastikan akun dihubungkan sebelum jam tayang tiba.
                            </span>
                            {can?.manageSettings && (
                                <Link href="/settings" className="font-bold underline shrink-0">
                                    Pengaturan
                                </Link>
                            )}
                        </div>
                    )}

                    {/* Format Selector */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                            Format Publikasi Instagram
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {(
                                [
                                    { id: 'IMAGE', label: 'Feed Foto', sub: '1 Gambar (1:1 / 4:5)', icon: ImageIcon },
                                    { id: 'CAROUSEL', label: 'Carousel', sub: '2–10 Slide', icon: Layers },
                                    { id: 'REELS', label: 'Reels Video', sub: '9:16 + Resumable', icon: Video },
                                ] as const
                            ).map((fmt) => {
                                const Icon = fmt.icon;
                                const active = igPublishForm.data.media_type === fmt.id;
                                return (
                                    <button
                                        key={fmt.id}
                                        type="button"
                                        onClick={() => igPublishForm.setData('media_type', fmt.id)}
                                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                                            active
                                                ? 'bg-[var(--md-sys-color-primary-container)]/40 border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-surface)]'
                                                : 'bg-[var(--md-sys-color-surface-container-low)] border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]'
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 text-xs font-bold">
                                            <Icon className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" />
                                            <span>{fmt.label}</span>
                                        </div>
                                        <span className="text-[10px] opacity-80 block mt-0.5">{fmt.sub}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Execution Mode Selector */}
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                            Mode Eksekusi Penayangan
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => igPublishForm.setData('publish_mode', 'immediate')}
                                className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                                    igPublishForm.data.publish_mode === 'immediate'
                                        ? 'bg-emerald-500/10 border-emerald-500/50 text-[var(--md-sys-color-on-surface)]'
                                        : 'bg-[var(--md-sys-color-surface-container-low)] border-[var(--md-sys-color-outline-variant)]'
                                }`}
                            >
                                <div className="text-xs font-bold flex items-center gap-1.5">
                                    <Send className="w-3.5 h-3.5 text-emerald-600" />
                                    Publish Sekarang ke IG
                                </div>
                                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                                    Tayangkan detik ini juga dan simpan permalink otomatis ke laporan.
                                </p>
                            </button>

                            <button
                                type="button"
                                onClick={() => igPublishForm.setData('publish_mode', 'scheduled')}
                                className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                                    igPublishForm.data.publish_mode === 'scheduled'
                                        ? 'bg-purple-500/10 border-purple-500/50 text-[var(--md-sys-color-on-surface)]'
                                        : 'bg-[var(--md-sys-color-surface-container-low)] border-[var(--md-sys-color-outline-variant)]'
                                }`}
                            >
                                <div className="text-xs font-bold flex items-center gap-1.5">
                                    <CalendarClock className="w-3.5 h-3.5 text-purple-600" />
                                    Aktifkan Auto-Publish Terjadwal
                                </div>
                                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                                    Dieksekusi otomatis oleh sistem SPARC tepat pada jadwal tayang.
                                </p>
                            </button>
                        </div>

                        {igPublishForm.data.publish_mode === 'scheduled' && (
                            <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] space-y-2">
                                <Input
                                    type="datetime-local"
                                    label="Waktu Tayang Otomatis (WIB)"
                                    required
                                    value={igPublishForm.data.scheduled_at}
                                    onChange={(e) => igPublishForm.setData('scheduled_at', e.target.value)}
                                    error={igPublishForm.errors.scheduled_at}
                                />
                                {bestPostingHours.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                        <span className="text-[var(--md-sys-color-on-surface-muted)] font-semibold">
                                            Jam Audiens Aktif (WIB):
                                        </span>
                                        {bestPostingHours.map((bh) => (
                                            <button
                                                key={bh}
                                                type="button"
                                                onClick={() => {
                                                    const datePrefix =
                                                        igPublishForm.data.scheduled_at.slice(0, 10) || today;
                                                    igPublishForm.setData(
                                                        'scheduled_at',
                                                        `${datePrefix}T${bh.slice(0, 5)}`
                                                    );
                                                }}
                                                className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300 font-bold hover:bg-purple-500/25 cursor-pointer"
                                            >
                                                {bh}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Hybrid Media Source */}
                    <div className="p-3.5 rounded-2xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)] flex items-center gap-1.5">
                                <Upload className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" />
                                Sumber Media (Hybrid: Upload File Lokal / URL Publik HTTPS)
                            </span>
                            {igPublishForm.data.media_type === 'REELS' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                    Resumable Binary Upload Aktif
                                </span>
                            )}
                        </div>

                        {isLocalStorage && igPublishForm.data.media_type !== 'REELS' && (
                            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-200">
                                <strong>Catatan Localhost:</strong> Server Anda berjalan di domain lokal. Meta Graph API mewajibkan URL HTTPS publik untuk <strong>Foto / Carousel</strong> (unggah file lokal langsung ke server Meta hanya didukung untuk <strong>Reels</strong>). Tempel tautan gambar HTTPS publik di bawah.
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="block text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                                {igPublishForm.data.media_type === 'REELS'
                                    ? 'Unggah File Video MP4/MOV dari Komputer (Bekerja di Localhost & Server Publik)'
                                    : 'Unggah File Gambar/Video (Server berdomain publik HTTPS)'}
                            </label>
                            <input
                                type="file"
                                multiple={igPublishForm.data.media_type === 'CAROUSEL'}
                                accept={
                                    igPublishForm.data.media_type === 'REELS'
                                        ? 'video/mp4,video/quicktime'
                                        : 'image/jpeg,image/png,video/mp4'
                                }
                                onChange={(e) => {
                                    const files = e.target.files ? Array.from(e.target.files) : [];
                                    igPublishForm.setData('media_files', files);
                                }}
                                className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[var(--md-sys-color-primary)] file:text-[var(--md-sys-color-on-primary)] hover:file:opacity-90 cursor-pointer"
                            />
                            {igPublishForm.data.media_files.length > 0 && (
                                <p className="text-[11px] text-emerald-600 font-semibold">
                                    {igPublishForm.data.media_files.length} berkas dipilih:{' '}
                                    {igPublishForm.data.media_files.map((f) => f.name).join(', ')}
                                </p>
                            )}
                            {igPublishForm.progress && (
                                <div className="w-full h-2 rounded-full bg-[var(--md-sys-color-surface-container-highest)] overflow-hidden mt-1">
                                    <div
                                        className="h-full bg-[var(--md-sys-color-primary)] transition-all"
                                        style={{ width: `${igPublishForm.progress.percentage ?? 0}%` }}
                                    />
                                </div>
                            )}
                        </div>

                        <Textarea
                            label={
                                igPublishForm.data.media_type === 'CAROUSEL'
                                    ? 'Atau Tempel Tautan Media HTTPS Publik (1 URL per baris, 2–10 slide)'
                                    : 'Atau Tempel Tautan Media HTTPS Publik (Langsung ke file .jpg / .mp4)'
                            }
                            rows={igPublishForm.data.media_type === 'CAROUSEL' ? 3 : 2}
                            placeholder={
                                igPublishForm.data.media_type === 'CAROUSEL'
                                    ? 'https://cdn.instansi.go.id/slide-1.jpg\nhttps://cdn.instansi.go.id/slide-2.jpg'
                                    : 'https://cdn.instansi.go.id/materi-resmi.jpg'
                            }
                            value={igPublishForm.data.media_urls}
                            onChange={(e) => igPublishForm.setData('media_urls', e.target.value)}
                            error={igPublishForm.errors.media_urls}
                        />

                        {igPublishForm.data.media_type === 'REELS' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                <Input
                                    label="URL Cover Reels (Opsional, HTTPS)"
                                    placeholder="https://cdn.instansi.go.id/cover-9x16.jpg"
                                    value={igPublishForm.data.cover_url}
                                    onChange={(e) => igPublishForm.setData('cover_url', e.target.value)}
                                />
                                <label className="flex items-center gap-2 text-xs font-semibold text-[var(--md-sys-color-on-surface)] pt-5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={igPublishForm.data.share_to_feed}
                                        onChange={(e) =>
                                            igPublishForm.setData('share_to_feed', e.target.checked)
                                        }
                                        className="rounded border-[var(--md-sys-color-outline)]"
                                    />
                                    Tampilkan juga di Grid Profil Utama
                                </label>
                            </div>
                        )}
                    </div>

                    <Textarea
                        label="Caption Resmi & Hashtag (Maks. 2.200 Karakter)"
                        rows={4}
                        value={igPublishForm.data.caption}
                        onChange={(e) => igPublishForm.setData('caption', e.target.value)}
                        error={igPublishForm.errors.caption}
                    />

                    <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            disabled={igPublishForm.processing}
                            onClick={() => setIgModalPub(null)}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            isLoading={igPublishForm.processing}
                            icon={
                                igPublishForm.data.publish_mode === 'scheduled' ? (
                                    <CalendarClock className="w-4 h-4" />
                                ) : (
                                    <Send className="w-4 h-4" />
                                )
                            }
                        >
                            {igPublishForm.data.publish_mode === 'scheduled'
                                ? 'Simpan Jadwal Auto-Publish'
                                : 'Publish Sekarang ke Instagram'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </AppLayout>
    );
}
