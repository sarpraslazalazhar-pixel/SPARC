import React, { useEffect, useMemo, useState } from 'react';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import {
    DndContext,
    DragOverlay,
    closestCenter,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Bookmark,
    Clock,
    ExternalLink,
    Eye,
    FileText,
    Grid3x3,
    GripHorizontal,
    Heart,
    Layers,
    Lock,
    MessageCircle,
    Plus,
    RefreshCw,
    Save,
    Trash2,
    Video,
} from 'lucide-react';
import { AppLayout, type SharedWorkspaceProps } from '@/Layouts/AppLayout';
import { Badge } from '@/Components/UI/Badge';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
import { SortableCardItem, useKanbanSensors } from '@/Components/UI/KanbanDnd';
import { Select } from '@/Components/UI/Select';
import { ContentIdBadge } from '@/Components/UI/Semantics';
import { Sheet } from '@/Components/UI/Sheet';
import { Textarea } from '@/Components/UI/Textarea';
import { useToast } from '@/Components/UI/Toast';
import { MD3_EASING, MD3_SPRING } from '@/lib/motion';
import type { SparcSystemSettings } from '@/types/sparc';

export interface PlannedGridSlot {
    slotKey: string;
    sourceType: 'content_item' | 'custom_slot';
    entityId: string;
    contentId?: string | null;
    title: string;
    format: 'single' | 'carousel' | 'reels';
    status: 'draft' | 'in_design' | 'approved';
    workflowStatus?: string;
    publishDate?: string | null;
    imageUrl?: string | null;
    canvaUrl?: string | null;
    figmaUrl?: string | null;
    notes?: string | null;
    position: number;
}

export interface LiveInstagramPostTile {
    id: string;
    contentId?: string | null;
    title: string;
    format: 'single' | 'carousel' | 'reels';
    imageUrl?: string | null;
    mediaUrl?: string | null;
    permalink?: string | null;
    publishDate?: string | null;
    reach?: number | null;
    views: number;
    likes: number;
    commentsCount: number;
    saves?: number | null;
    shares: number;
}

interface GridIndexProps {
    igProfile?: SparcSystemSettings['instagram'];
    plannedSlots?: PlannedGridSlot[];
    livePosts?: LiveInstagramPostTile[];
}

export default function GridIndex({
    igProfile,
    plannedSlots: initialPlanned = [],
    livePosts = [],
}: GridIndexProps) {
    const { props } = usePage<SharedWorkspaceProps>();
    const can = props.auth?.can;
    const { info, error: toastError } = useToast();
    const sensors = useKanbanSensors();

    const [planned, setPlanned] = useState<PlannedGridSlot[]>(initialPlanned);
    useEffect(() => {
        setPlanned(initialPlanned);
    }, [initialPlanned]);

    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'feed' | 'thumbnails'>('feed');
    const [sheetOpen, setSheetOpen] = useState(false);
    const [editingSlot, setEditingSlot] = useState<PlannedGridSlot | null>(null);
    const [isReordering, setIsReordering] = useState(false);
    const [isSyncingIg, setIsSyncingIg] = useState(false);
    const [isDeletingSlot, setIsDeletingSlot] = useState(false);

    const slotForm = useForm<{
        slot_id: number | null;
        title: string;
        format: 'single' | 'carousel' | 'reels';
        status: 'draft' | 'in_design' | 'approved';
        image_url: string;
        image_file: File | null;
        canva_url: string;
        figma_url: string;
        notes: string;
    }>({
        slot_id: null,
        title: '',
        format: 'single',
        status: 'draft',
        image_url: '',
        image_file: null,
        canva_url: '',
        figma_url: '',
        notes: '',
    });

    const activeDragSlot = useMemo(
        () => (activeDragId ? planned.find((s) => s.slotKey === activeDragId) ?? null : null),
        [activeDragId, planned]
    );

    const profileUsername =
        igProfile?.username || props.instagramStatus?.username || 'humas.official';
    const profileName =
        igProfile?.name || props.instagramStatus?.name || 'Humas & Informasi Publik';
    const profileBio =
        igProfile?.biography || props.instagramStatus?.biography || '';
    const profileAvatar =
        igProfile?.profilePictureUrl || props.instagramStatus?.profilePictureUrl || '';
    const followersCount =
        igProfile?.followersCount ?? props.instagramStatus?.followersCount ?? null;
    const followsCount = igProfile?.followsCount ?? null;
    const mediaCount =
        igProfile?.mediaCount ?? props.instagramStatus?.mediaCount ?? livePosts.length;
    const bestHours =
        igProfile?.bestPostingHours ?? props.instagramStatus?.bestPostingHours ?? [];
    const isConnected = Boolean(igProfile?.connected || props.instagramStatus?.connected);

    const openNewSlotSheet = () => {
        setEditingSlot(null);
        slotForm.clearErrors();
        slotForm.setData({
            slot_id: null,
            title: `Draft Visual #${planned.length + 1}`,
            format: 'single',
            status: 'draft',
            image_url: '',
            image_file: null,
            canva_url: '',
            figma_url: '',
            notes: '',
        });
        setSheetOpen(true);
    };

    const openEditSlotSheet = (slot: PlannedGridSlot) => {
        setEditingSlot(slot);
        slotForm.clearErrors();
        slotForm.setData({
            slot_id: slot.sourceType === 'custom_slot' ? Number(slot.entityId) : null,
            title: slot.title,
            format: slot.format,
            status: slot.status,
            image_url: slot.imageUrl || '',
            image_file: null,
            canva_url: slot.canvaUrl || '',
            figma_url: slot.figmaUrl || '',
            notes: slot.notes || '',
        });
        setSheetOpen(true);
    };

    const handleSubmitSlot = (e: React.FormEvent) => {
        e.preventDefault();

        if (editingSlot && editingSlot.sourceType === 'content_item') {
            router.patch(
                `/content/${editingSlot.entityId}`,
                {
                    title: slotForm.data.title,
                    result_design_url:
                        slotForm.data.image_url ||
                        slotForm.data.canva_url ||
                        slotForm.data.figma_url ||
                        null,
                    caption: slotForm.data.notes || null,
                },
                {
                    preserveScroll: true,
                    onSuccess: () => setSheetOpen(false),
                    onError: () =>
                        toastError('Gagal Menyimpan', 'Periksa kembali tautan dan judul konten.'),
                }
            );
            return;
        }

        slotForm.post('/grid/slots', {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => setSheetOpen(false),
        });
    };

    const handleDeleteCustomSlot = () => {
        if (!editingSlot || editingSlot.sourceType !== 'custom_slot') {
            return;
        }
        setIsDeletingSlot(true);
        router.delete(`/grid/slots/${editingSlot.entityId}`, {
            preserveScroll: true,
            onSuccess: () => setSheetOpen(false),
            onFinish: () => setIsDeletingSlot(false),
        });
    };

    const persistOrder = (orderedList: PlannedGridSlot[]) => {
        if (orderedList.length === 0) {
            return;
        }
        setIsReordering(true);
        router.patch(
            '/grid/reorder',
            {
                ordered_keys: orderedList.map((s) => s.slotKey),
            },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setIsReordering(false),
            }
        );
    };

    const handleDragStart = (event: DragStartEvent) => {
        setActiveDragId(String(event.active.id));
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveDragId(null);

        if (!over || active.id === over.id) {
            return;
        }

        const oldIndex = planned.findIndex((s) => s.slotKey === String(active.id));
        const newIndex = planned.findIndex((s) => s.slotKey === String(over.id));
        if (oldIndex < 0 || newIndex < 0) {
            return;
        }

        const reordered = arrayMove(planned, oldIndex, newIndex).map((s, idx) => ({
            ...s,
            position: idx,
        }));
        setPlanned(reordered);
        info('Menyimpan Urutan Grid...', `Slot dipindahkan ke urutan #${newIndex + 1}.`);
        persistOrder(reordered);
    };

    const handleSyncLiveIg = () => {
        setIsSyncingIg(true);
        router.post(
            '/grid/sync-live-feed',
            {},
            {
                preserveScroll: true,
                onFinish: () => setIsSyncingIg(false),
            }
        );
    };

    const getPlannedBadge = (status: PlannedGridSlot['status']) => {
        switch (status) {
            case 'approved':
                return <Badge variant="success">Siap Tayang</Badge>;
            case 'in_design':
                return <Badge variant="primary">Proses Desain</Badge>;
            default:
                return <Badge variant="warning">Draft Rencana</Badge>;
        }
    };

    const renderPlannedTile = (slot: PlannedGridSlot, index: number, isOverlay = false) => (
        <div
            className={`group relative aspect-square bg-[var(--md-sys-color-surface-container)] rounded-2xl overflow-hidden border-2 border-dashed border-[var(--md-sys-color-primary)]/35 transition-all flex flex-col justify-between p-3 ${
                isOverlay
                    ? 'md-drag-overlay cursor-grabbing'
                    : 'hover:border-[var(--md-sys-color-primary)] hover:shadow-[var(--md-elevation-2)] cursor-grab active:cursor-grabbing'
            }`}
        >
            {slot.imageUrl ? (
                <img
                    src={slot.imageUrl}
                    alt={slot.title}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
            ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--md-sys-color-surface-container-low)] to-[var(--md-sys-color-surface-container-high)] flex flex-col items-center justify-center p-3 text-center">
                    <div className="w-9 h-9 rounded-full bg-[var(--md-sys-color-surface)] shadow-2xs flex items-center justify-center text-[var(--md-sys-color-primary)] mb-1.5 border border-[var(--md-sys-color-outline-variant)]">
                        {slot.format === 'reels' ? (
                            <Video className="w-4 h-4" />
                        ) : slot.format === 'carousel' ? (
                            <Layers className="w-4 h-4" />
                        ) : (
                            <FileText className="w-4 h-4" />
                        )}
                    </div>
                    <span className="text-[11px] font-bold text-[var(--md-sys-color-on-surface)] line-clamp-2">
                        {slot.title}
                    </span>
                    {slot.publishDate && (
                        <span className="sparc-code-id text-[10px] text-[var(--md-sys-color-on-surface-muted)] mt-1">
                            Target: {slot.publishDate}
                        </span>
                    )}
                </div>
            )}

            <div className="absolute inset-0 bg-slate-950/65 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3 text-white z-10">
                <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-xs font-bold bg-black/50 px-2 py-0.5 rounded-lg inline-flex items-center gap-1">
                        <GripHorizontal className="w-3 h-3" /> Rencana #{index + 1}
                    </span>
                    {getPlannedBadge(slot.status)}
                </div>

                <div>
                    {slot.contentId && (
                        <span className="font-mono text-[10px] text-purple-200 block mb-0.5">
                            {slot.contentId}
                        </span>
                    )}
                    <p className="text-xs font-bold line-clamp-2">{slot.title}</p>
                    <span className="text-[10px] text-white/80 mt-1 block">
                        Seret untuk atur urutan • Klik untuk edit visual
                    </span>
                </div>
            </div>

            <div className="relative z-0 self-end bg-black/50 backdrop-blur-xs text-white p-1 rounded-md text-[10px]">
                {slot.format === 'reels' ? (
                    <Video className="w-3.5 h-3.5" />
                ) : slot.format === 'carousel' ? (
                    <Layers className="w-3.5 h-3.5" />
                ) : (
                    <span className="font-bold px-0.5">4:5</span>
                )}
            </div>
        </div>
    );

    return (
        <AppLayout
            title="Visual Grid 3x3 Instagram"
            subtitle="Perencanaan estetika feed 3 kolom terpadu — susun rencana konten di baris atas di atas feed Instagram asli yang telah tayang"
            actions={
                <div className="flex flex-wrap items-center gap-2">
                    {can?.managePublishing && (
                        <Button
                            variant="outline"
                            size="sm"
                            isLoading={isSyncingIg}
                            icon={<RefreshCw className={`w-3.5 h-3.5 ${isSyncingIg ? 'animate-spin' : ''}`} />}
                            onClick={handleSyncLiveIg}
                        >
                            Sync Feed Asli IG
                        </Button>
                    )}
                    {(can?.editContent || can?.manageAssets) && (
                        <Button
                            variant="outline"
                            size="sm"
                            icon={<Plus className="w-3.5 h-3.5" />}
                            onClick={openNewSlotSheet}
                        >
                            Tambah Slot Draft
                        </Button>
                    )}
                    {(can?.editContent || can?.managePublishing) && planned.length > 0 && (
                        <Button
                            variant="primary"
                            size="sm"
                            isLoading={isReordering}
                            icon={<Save className="w-3.5 h-3.5" />}
                            onClick={() => persistOrder(planned)}
                        >
                            Simpan Urutan
                        </Button>
                    )}
                </div>
            }
        >
            <Head title="Visual Grid 3x3 Instagram - SPARC" />

            <div className="space-y-6">
                {/* View Mode Toggle */}
                <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-3.5 rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] flex flex-wrap items-center justify-between gap-3">
                    <div
                        role="group"
                        aria-label="Mode kanvas visual"
                        className="bg-[var(--md-sys-color-surface-container-low)] p-1 rounded-2xl flex items-center gap-1 border border-[var(--md-sys-color-outline-variant)]/70"
                    >
                        {(
                            [
                                { id: 'feed', label: 'Hybrid Feed Instagram (Grid 3xN)', icon: Grid3x3 },
                                { id: 'thumbnails', label: 'Cover Reels (9:16)', icon: Video },
                            ] as const
                        ).map((item) => {
                            const active = activeTab === item.id;
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setActiveTab(item.id)}
                                    className={`relative px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-2 ${
                                        active
                                            ? 'text-[var(--md-sys-color-on-primary)]'
                                            : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                                    }`}
                                >
                                    {active && (
                                        <motion.span
                                            layoutId="grid-canvas-tab-pill"
                                            transition={MD3_SPRING.indicator}
                                            className="absolute inset-0 rounded-xl bg-[var(--md-sys-color-primary)] shadow-2xs"
                                        />
                                    )}
                                    <span className="relative z-10 flex items-center gap-2">
                                        <Icon className="w-4 h-4" />
                                        {item.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] hidden md:block">
                        Zona atas dapat digeser bebas; zona bawah menampilkan urutan riil postingan Instagram yang telah tayang.
                    </p>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                    {activeTab === 'feed' ? (
                        <motion.div
                            key="feed-grid"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.16, ease: MD3_EASING.decelerate }}
                            className="max-w-4xl mx-auto space-y-6"
                        >
                            {/* Authentic Instagram Profile Header */}
                            <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-6 rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-6">
                                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full p-1 bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 shrink-0">
                                    <div className="w-full h-full rounded-full bg-[var(--md-sys-color-surface)] p-0.5 flex items-center justify-center overflow-hidden">
                                        {profileAvatar ? (
                                            <img
                                                src={profileAvatar}
                                                alt={profileUsername}
                                                className="w-full h-full rounded-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full rounded-full bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-extrabold flex items-center justify-center text-lg uppercase">
                                                {profileUsername.slice(0, 2)}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2 flex-1 min-w-0">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                        <h2 className="text-base font-extrabold text-[var(--md-sys-color-on-surface)]">
                                            @{profileUsername}
                                        </h2>
                                        <Badge variant={isConnected ? 'success' : 'default'}>
                                            {isConnected ? 'Live Meta Graph API' : 'Mode Pratinjau'}
                                        </Badge>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--md-sys-color-on-surface)]">
                                        <span>
                                            <strong className="sparc-code-id font-extrabold">
                                                {mediaCount.toLocaleString('id-ID')}
                                            </strong>{' '}
                                            kiriman
                                        </span>
                                        <span>
                                            <strong className="sparc-code-id font-extrabold">
                                                {followersCount !== null
                                                    ? followersCount.toLocaleString('id-ID')
                                                    : '—'}
                                            </strong>{' '}
                                            pengikut
                                        </span>
                                        {followsCount !== null && (
                                            <span>
                                                <strong className="sparc-code-id font-extrabold">
                                                    {followsCount.toLocaleString('id-ID')}
                                                </strong>{' '}
                                                mengikuti
                                            </span>
                                        )}
                                    </div>

                                    <div className="space-y-0.5">
                                        <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                                            {profileName}
                                        </p>
                                        {profileBio ? (
                                            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] whitespace-pre-line line-clamp-2">
                                                {profileBio}
                                            </p>
                                        ) : null}
                                        {igProfile?.website && (
                                            <a
                                                href={igProfile.website}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-[11px] font-bold text-[var(--md-sys-color-primary)] hover:underline inline-flex items-center gap-1"
                                            >
                                                {igProfile.website} <ExternalLink className="w-3 h-3" />
                                            </a>
                                        )}
                                    </div>

                                    {bestHours.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                                            <span className="inline-flex items-center gap-1 text-[var(--md-sys-color-on-surface-muted)] font-semibold">
                                                <Clock className="w-3 h-3 text-purple-600" /> Jam Tayang Terbaik:
                                            </span>
                                            {bestHours.map((bh) => (
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
                            </div>

                            {/* TOP ZONE: REORDERABLE PLANNED CONTENT & CUSTOM SLOTS */}
                            <div className="space-y-2.5">
                                <div className="flex items-center justify-between px-1">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-[var(--md-sys-color-primary)]" />
                                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
                                            Zona Rencana Tayang & Draft Visual ({planned.length})
                                        </h3>
                                    </div>
                                    <span className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                        Seret kartu untuk menyimulasikan urutan masuk ke feed 3x3
                                    </span>
                                </div>

                                {planned.length === 0 ? (
                                    <div className="p-8 rounded-2xl border border-dashed border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]/60 text-center space-y-2">
                                        <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                                            Belum ada antrean rencana konten Instagram atau slot draft
                                        </p>
                                        <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                                            Tambahkan konten berplatform Instagram di Content Plan atau klik{' '}
                                            <strong>Tambah Slot Draft</strong> di atas untuk mulai menyusun pratinjau warna feed.
                                        </p>
                                    </div>
                                ) : (
                                    <DndContext
                                        sensors={sensors}
                                        collisionDetection={closestCenter}
                                        onDragStart={handleDragStart}
                                        onDragEnd={handleDragEnd}
                                    >
                                        <SortableContext
                                            items={planned.map((s) => s.slotKey)}
                                            strategy={rectSortingStrategy}
                                        >
                                            <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
                                                {planned.map((slot, index) => (
                                                    <SortableCardItem
                                                        key={slot.slotKey}
                                                        id={slot.slotKey}
                                                        className="rounded-2xl"
                                                        onClick={() => openEditSlotSheet(slot)}
                                                    >
                                                        {renderPlannedTile(slot, index)}
                                                    </SortableCardItem>
                                                ))}
                                            </div>
                                        </SortableContext>

                                        <DragOverlay>
                                            {activeDragSlot
                                                ? renderPlannedTile(
                                                      activeDragSlot,
                                                      planned.findIndex(
                                                          (s) => s.slotKey === activeDragSlot.slotKey
                                                      ),
                                                      true
                                                  )
                                                : null}
                                        </DragOverlay>
                                    </DndContext>
                                )}
                            </div>

                            {/* BOTTOM ZONE: LOCKED LIVE INSTAGRAM FEED */}
                            <div className="space-y-2.5 pt-2">
                                <div className="flex items-center justify-between px-1">
                                    <div className="flex items-center gap-2">
                                        <Lock className="w-3.5 h-3.5 text-emerald-600" />
                                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
                                            Feed Instagram Aktif — Urutan Riil Tayang ({livePosts.length})
                                        </h3>
                                    </div>
                                    <span className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                        Terkunci sesuai kronologi asli akun @{profileUsername}
                                    </span>
                                </div>

                                {livePosts.length === 0 ? (
                                    <div className="p-8 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                        Belum ada postingan Instagram berstatus tayang yang tersinkronisasi. Klik{' '}
                                        <strong>Sync Feed Asli IG</strong> untuk menarik media langsung dari Meta Graph API.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
                                        {livePosts.map((post) => (
                                            <div
                                                key={post.id}
                                                className="group relative aspect-square bg-[var(--md-sys-color-surface-container)] rounded-2xl overflow-hidden border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]"
                                            >
                                                {post.imageUrl ? (
                                                    <img
                                                        src={post.imageUrl}
                                                        alt={post.title}
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-amber-500/10">
                                                        <Video className="w-6 h-6 text-purple-600 mb-1.5" />
                                                        <span className="text-[11px] font-bold text-[var(--md-sys-color-on-surface)] line-clamp-3">
                                                            {post.title}
                                                        </span>
                                                    </div>
                                                )}

                                                <div className="absolute top-2 right-2 bg-black/55 text-white p-1 rounded-md text-[10px]">
                                                    {post.format === 'reels' ? (
                                                        <Video className="w-3.5 h-3.5" />
                                                    ) : post.format === 'carousel' ? (
                                                        <Layers className="w-3.5 h-3.5" />
                                                    ) : (
                                                        <Grid3x3 className="w-3.5 h-3.5" />
                                                    )}
                                                </div>

                                                <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3 text-white">
                                                    <div className="flex items-center justify-between text-[10px]">
                                                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-200 font-bold">
                                                            Live IG
                                                        </span>
                                                        {post.publishDate && (
                                                            <span className="font-mono text-white/80">
                                                                {post.publishDate}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="space-y-2">
                                                        <p className="text-xs font-bold line-clamp-2">{post.title}</p>
                                                        <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-bold">
                                                            <span className="inline-flex items-center gap-1">
                                                                <Heart className="w-3 h-3 fill-current text-rose-400" />
                                                                {post.likes.toLocaleString('id-ID')}
                                                            </span>
                                                            <span className="inline-flex items-center gap-1">
                                                                <MessageCircle className="w-3 h-3 text-sky-300" />
                                                                {post.commentsCount.toLocaleString('id-ID')}
                                                            </span>
                                                            {post.views > 0 && (
                                                                <span className="inline-flex items-center gap-1">
                                                                    <Eye className="w-3 h-3 text-amber-300" />
                                                                    {post.views.toLocaleString('id-ID')}
                                                                </span>
                                                            )}
                                                            {post.saves !== null && post.saves !== undefined && (
                                                                <span className="inline-flex items-center gap-1">
                                                                    <Bookmark className="w-3 h-3 text-purple-300" />
                                                                    {post.saves.toLocaleString('id-ID')}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {post.permalink && (
                                                            <a
                                                                href={post.permalink}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 hover:underline"
                                                            >
                                                                Buka di Instagram <ExternalLink className="w-3 h-3" />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="thumbnails-grid"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.16, ease: MD3_EASING.decelerate }}
                            className="max-w-5xl mx-auto space-y-5"
                        >
                            <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-5 rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-4">
                                <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                    Pratinjau Cover Reels 9:16 (Rencana & Tayang)
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    {[
                                        ...planned
                                            .filter((s) => s.format === 'reels')
                                            .map((s) => ({
                                                key: s.slotKey,
                                                title: s.title,
                                                img: s.imageUrl,
                                                badge: 'Rencana Reels',
                                            })),
                                        ...livePosts
                                            .filter((p) => p.format === 'reels')
                                            .map((p) => ({
                                                key: p.id,
                                                title: p.title,
                                                img: p.imageUrl,
                                                badge: `${p.views.toLocaleString('id-ID')} views`,
                                            })),
                                    ].map((reel) => (
                                        <div
                                            key={reel.key}
                                            className="aspect-[9/16] relative rounded-2xl overflow-hidden bg-slate-900 border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] group"
                                        >
                                            {reel.img ? (
                                                <img
                                                    src={reel.img}
                                                    alt={reel.title}
                                                    className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-300"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-white/60">
                                                    <Video className="w-8 h-8" />
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent flex flex-col justify-end p-3 text-white">
                                                <Badge variant="primary" className="self-start text-[9px] mb-1">
                                                    {reel.badge}
                                                </Badge>
                                                <p className="text-xs font-bold line-clamp-2">{reel.title}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Slot Create/Edit Slide-over */}
            <Sheet
                isOpen={sheetOpen}
                onClose={() => setSheetOpen(false)}
                title={
                    editingSlot
                        ? editingSlot.sourceType === 'content_item'
                            ? `Visual Konten ${editingSlot.contentId || ''}`
                            : 'Edit Slot Draft Grid'
                        : 'Tambah Slot Draft Grid Baru'
                }
                description={editingSlot?.title || 'Simulasikan tampilan visual pada kanvas 3 kolom Instagram'}
                width="lg"
            >
                <form onSubmit={handleSubmitSlot} className="space-y-4">
                    {editingSlot?.contentId && (
                        <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                                <ContentIdBadge contentId={editingSlot.contentId} />
                                <span className="text-[var(--md-sys-color-on-surface-variant)]">
                                    Terhubung langsung ke Content Plan
                                </span>
                            </div>
                            <Link
                                href="/content"
                                className="font-bold text-[var(--md-sys-color-primary)] hover:underline"
                            >
                                Buka Content Plan →
                            </Link>
                        </div>
                    )}

                    <Input
                        label="Judul Konten / Slot Visual"
                        required
                        value={slotForm.data.title}
                        onChange={(e) => slotForm.setData('title', e.target.value)}
                        error={slotForm.errors.title}
                    />

                    {(!editingSlot || editingSlot.sourceType === 'custom_slot') && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Select
                                label="Format Visual"
                                value={slotForm.data.format}
                                onChange={(e) =>
                                    slotForm.setData(
                                        'format',
                                        e.target.value as 'single' | 'carousel' | 'reels'
                                    )
                                }
                            >
                                <option value="single">Single Feed (1:1 / 4:5)</option>
                                <option value="carousel">Carousel Multi-Slide</option>
                                <option value="reels">Reels Cover (9:16)</option>
                            </Select>

                            <Select
                                label="Status Kesiapan"
                                value={slotForm.data.status}
                                onChange={(e) =>
                                    slotForm.setData(
                                        'status',
                                        e.target.value as 'draft' | 'in_design' | 'approved'
                                    )
                                }
                            >
                                <option value="draft">Draft Rencana</option>
                                <option value="in_design">Proses Desain</option>
                                <option value="approved">Siap Tayang</option>
                            </Select>
                        </div>
                    )}

                    <Input
                        label="URL Gambar Pratinjau (HTTPS)"
                        placeholder="https://..."
                        value={slotForm.data.image_url}
                        onChange={(e) => slotForm.setData('image_url', e.target.value)}
                        error={slotForm.errors.image_url}
                    />

                    {(!editingSlot || editingSlot.sourceType === 'custom_slot') && (
                        <div className="space-y-1">
                            <label className="block text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                                Atau Unggah Gambar Pratinjau dari Komputer
                            </label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                    slotForm.setData('image_file', e.target.files?.[0] ?? null)
                                }
                                className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[var(--md-sys-color-primary)] file:text-[var(--md-sys-color-on-primary)] cursor-pointer"
                            />
                        </div>
                    )}

                    {slotForm.data.image_url && (
                        <div className="w-32 h-32 rounded-2xl overflow-hidden border border-[var(--md-sys-color-outline-variant)]">
                            <img
                                src={slotForm.data.image_url}
                                alt="Preview"
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}

                    {(!editingSlot || editingSlot.sourceType === 'custom_slot') && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Input
                                label="Tautan Canva"
                                placeholder="https://canva.com/design/..."
                                value={slotForm.data.canva_url}
                                onChange={(e) => slotForm.setData('canva_url', e.target.value)}
                            />
                            <Input
                                label="Tautan Figma"
                                placeholder="https://figma.com/file/..."
                                value={slotForm.data.figma_url}
                                onChange={(e) => slotForm.setData('figma_url', e.target.value)}
                            />
                        </div>
                    )}

                    <Textarea
                        label="Catatan Konsep Visual / Draft Caption"
                        rows={3}
                        value={slotForm.data.notes}
                        onChange={(e) => slotForm.setData('notes', e.target.value)}
                    />

                    <div className="pt-4 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-between gap-2">
                        <div>
                            {editingSlot?.sourceType === 'custom_slot' && (
                                <Button
                                    type="button"
                                    variant="danger"
                                    size="sm"
                                    isLoading={isDeletingSlot}
                                    icon={<Trash2 className="w-3.5 h-3.5" />}
                                    onClick={handleDeleteCustomSlot}
                                >
                                    Hapus Slot
                                </Button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                size="md"
                                onClick={() => setSheetOpen(false)}
                            >
                                Batal
                            </Button>
                            <Button
                                type="submit"
                                variant="primary"
                                size="md"
                                isLoading={slotForm.processing}
                            >
                                Simpan Slot Grid
                            </Button>
                        </div>
                    </div>
                </form>
            </Sheet>
        </AppLayout>
    );
}
