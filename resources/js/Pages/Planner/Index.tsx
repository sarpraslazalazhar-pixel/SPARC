import React, { useEffect, useMemo, useState } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    DndContext,
    DragOverlay,
    closestCorners,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
    AlertCircle,
    ExternalLink,
    FolderKanban,
    GripVertical,
    Kanban as KanbanIcon,
    ListTodo,
    MessageSquare,
    Plus,
    RefreshCw,
    RotateCcw,
    Search,
    ShieldAlert,
    TableProperties,
    Video,
} from 'lucide-react';
import { AppLayout, type SharedWorkspaceProps } from '@/Layouts/AppLayout';
import { ContentDetailSheet } from '@/Components/ContentDetailSheet';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
import { DroppableColumn, SortableCardItem, useKanbanSensors } from '@/Components/UI/KanbanDnd';
import { Modal } from '@/Components/UI/Modal';
import { Select } from '@/Components/UI/Select';
import {
    ContentIdBadge,
    DeadlineBadge,
    normalizeWorkflowStatus,
    PillarTag,
    PlatformChip,
    PriorityBadge,
    StatusChip,
    WORKFLOW_STATUS_META,
    type CanonicalWorkflowStatus,
    type ContentPillarKey,
    type PriorityLevel,
    type SocialPlatform,
} from '@/Components/UI/Semantics';
import { Textarea } from '@/Components/UI/Textarea';
import { useToast } from '@/Components/UI/Toast';
import type { InstitutionalActivity, SparcContentItem, SparcTeamMember } from '@/types/sparc';

interface ProductionBoardPageProps {
    today?: string;
    contentItems?: SparcContentItem[];
    activities?: InstitutionalActivity[];
    team?: SparcTeamMember[];
}

const KANBAN_COLUMNS: CanonicalWorkflowStatus[] = [
    'inbox',
    'briefing',
    'in_progress',
    'review_approval',
    'ready_to_publish',
    'published',
];

export default function PlannerIndex({
    today = '2026-10-27',
    contentItems = [],
    activities = [],
    team = [],
}: ProductionBoardPageProps) {
    const { props } = usePage<SharedWorkspaceProps>();
    const can = props.auth?.can;
    const currentRole = props.auth?.user?.role ?? 'admin';
    const { error: toastError } = useToast();
    const sensors = useKanbanSensors();

    const [items, setItems] = useState<SparcContentItem[]>(contentItems);
    useEffect(() => {
        setItems(contentItems);
    }, [contentItems]);

    const [searchQuery, setSearchQuery] = useState('');
    const [platformFilter, setPlatformFilter] = useState('all');
    const [pillarFilter, setPillarFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');

    const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [activeDetailId, setActiveDetailId] = useState<string | null>(null);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [isSyncingAll, setIsSyncingAll] = useState(false);

    const handleSyncAllInstagram = () => {
        setIsSyncingAll(true);
        router.post(
            '/content/instagram/sync-all',
            {},
            {
                preserveScroll: true,
                onFinish: () => setIsSyncingAll(false),
            }
        );
    };

    const activeDetailItem = useMemo(
        () => (activeDetailId ? items.find((i) => i.id === activeDetailId) ?? null : null),
        [activeDetailId, items]
    );

    const activeDragItem = useMemo(
        () => (activeDragId ? items.find((i) => i.id === activeDragId) ?? null : null),
        [activeDragId, items]
    );

    const picOptions = useMemo(() => {
        const names = new Set<string>();
        team.forEach((m) => names.add(m.name));
        items.forEach((i) => {
            if (i.picName) {
                names.add(i.picName);
            }
        });
        return Array.from(names);
    }, [team, items]);

    const filteredItems = useMemo(() => {
        return items.filter((item) => {
            if (platformFilter !== 'all' && item.platform !== platformFilter) {
                return false;
            }
            if (pillarFilter !== 'all' && item.pillar !== pillarFilter) {
                return false;
            }
            if (priorityFilter !== 'all' && item.priority !== priorityFilter) {
                return false;
            }
            if (searchQuery.trim() !== '') {
                const q = searchQuery.toLowerCase();
                const inTitle = item.title.toLowerCase().includes(q);
                const inCode = item.contentId.toLowerCase().includes(q);
                const inPic = item.picName.toLowerCase().includes(q);
                const inTicket = item.ticketId?.toLowerCase().includes(q) ?? false;
                if (!inTitle && !inCode && !inPic && !inTicket) {
                    return false;
                }
            }
            return true;
        });
    }, [items, platformFilter, pillarFilter, priorityFilter, searchQuery]);

    const hasActiveFilters =
        searchQuery.trim() !== '' ||
        platformFilter !== 'all' ||
        pillarFilter !== 'all' ||
        priorityFilter !== 'all';

    const resetFilters = () => {
        setSearchQuery('');
        setPlatformFilter('all');
        setPillarFilter('all');
        setPriorityFilter('all');
    };

    const createForm = useForm({
        title: '',
        platform: 'instagram' as SocialPlatform,
        format: 'reels_shorts',
        pillar: 'edukasi' as ContentPillarKey,
        priority: 'normal' as PriorityLevel,
        pic_name: team[2]?.name ?? 'Nadia Putri',
        production_deadline: '2026-10-30',
        publish_date: '2026-11-02',
        publish_time: '10:00',
        activity_title: '',
        brief: '',
        ref_design_url: '',
        caption: '',
        status: 'briefing' as CanonicalWorkflowStatus,
    });

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createForm.post('/content', {
            preserveScroll: true,
            onSuccess: () => {
                setCreateModalOpen(false);
                createForm.reset();
            },
            onError: () => {
                toastError('Validasi Konten Gagal', 'Periksa kembali judul serta tenggat produksi dan tayang.');
            },
        });
    };

    const resolveTargetColumn = (overId: string): CanonicalWorkflowStatus | null => {
        if (overId.startsWith('planner-col-')) {
            return overId.replace('planner-col-', '') as CanonicalWorkflowStatus;
        }
        const overCard = items.find((i) => i.id === overId);
        return overCard ? normalizeWorkflowStatus(overCard.status) : null;
    };

    const handleMoveCardStatus = (cardId: string, nextStatus: CanonicalWorkflowStatus) => {
        const card = items.find((i) => i.id === cardId);
        if (!card) {
            return;
        }
        const currentCanonical = normalizeWorkflowStatus(card.status);
        if (currentCanonical === nextStatus) {
            return;
        }

        const previousSnapshot = items;

        // Optimistic move so drag release feels instantaneous
        setItems((prev) =>
            prev.map((item) => (item.id === cardId ? { ...item, status: nextStatus } : item))
        );

        router.patch(
            `/content/${cardId}/status`,
            { status: nextStatus },
            {
                preserveScroll: true,
                preserveState: true,
                onError: (errors) => {
                    // Graceful authorization/validation rollback to exact previous column
                    setItems(previousSnapshot);
                    toastError(
                        'Perpindahan Tahap Ditolak',
                        errors.status || 'Peran Anda tidak diizinkan memindahkan kartu ke tahap tersebut.'
                    );
                },
            }
        );
    };

    const handleDragStart = (event: DragStartEvent) => {
        setActiveDragId(String(event.active.id));
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveDragId(null);

        if (!over) {
            return;
        }
        const targetCol = resolveTargetColumn(String(over.id));
        if (targetCol) {
            handleMoveCardStatus(String(active.id), targetCol);
        }
    };

    const renderKanbanCard = (item: SparcContentItem, isOverlay = false) => {
        const canonical = normalizeWorkflowStatus(item.status);
        const isDone = canonical === 'published';
        const doneTasks = item.tasks?.filter((t) => t.status === 'done').length ?? 0;
        const totalTasks = item.tasks?.length ?? 0;
        const revisionCount = item.comments?.filter((c) => c.isRevisionNote).length ?? 0;

        return (
            <div
                className={`bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] p-3.5 space-y-2.5 transition-shadow duration-150 ${
                    isOverlay
                        ? 'md-drag-overlay cursor-grabbing'
                        : 'shadow-[var(--md-elevation-1)] hover:shadow-[var(--md-elevation-2)] hover:border-[var(--md-sys-color-primary)]/50 cursor-grab active:cursor-grabbing'
                }`}
            >
                {/* Row 1: Content ID + Priority + Drag Handle */}
                <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <ContentIdBadge contentId={item.contentId} />
                        {item.ticketId && (
                            <span className="sparc-code-id text-[10px] font-semibold text-[var(--md-sys-color-primary)] truncate">
                                {item.ticketId}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <PriorityBadge priority={item.priority} compact />
                        <GripVertical className="w-3.5 h-3.5 text-[var(--md-sys-color-on-surface-muted)]" />
                    </div>
                </div>

                {/* Row 2: Editorial Title */}
                <div className="space-y-1">
                    <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] leading-snug line-clamp-2">
                        {item.title}
                    </h4>
                    {item.activityTitle && (
                        <p className="text-[10px] text-[var(--md-sys-color-on-surface-muted)] truncate">
                            Agenda: {item.activityTitle}
                        </p>
                    )}
                </div>

                {/* Row 3: Distinct Platform vs Pillar Chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                    <PlatformChip platform={item.platform} format={item.format} compact />
                    <PillarTag pillar={item.pillar} />
                </div>
                {/* Row 3.5: Video Review Link & Revision Indicators */}
                {(item.resultDesignUrl || item.revisionNote) && (
                    <div className="space-y-1.5 pt-0.5">
                        {item.resultDesignUrl && (
                            <div className="flex items-center">
                                <a
                                    href={item.resultDesignUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 transition-colors"
                                    title={`Tonton & review materi: ${item.resultDesignUrl}`}
                                >
                                    <Video className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                                    Review Video / Desain ↗
                                </a>
                            </div>
                        )}
                        {item.revisionNote && (
                            <div
                                title={item.revisionNote}
                                className="px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[10px] text-amber-900 dark:text-amber-200 flex items-center gap-1 line-clamp-1"
                            >
                                <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                                <span className="truncate">Revisi: {item.revisionNote}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Row 4: Quiet Operational Footer (Subtasks, Deadline, PIC) */}
                <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)]/70 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <DeadlineBadge
                            date={
                                canonical === 'ready_to_publish' || canonical === 'published'
                                    ? item.publishDate
                                    : item.productionDeadline
                            }
                            kind={
                                canonical === 'ready_to_publish' || canonical === 'published'
                                    ? 'publish'
                                    : 'production'
                            }
                            isDone={isDone}
                            todayStr={today}
                        />
                        {totalTasks > 0 && (
                            <span
                                title="Progres sub-tugas produksi"
                                className="sparc-code-id inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--md-sys-color-on-surface-muted)]"
                            >
                                <ListTodo className="w-3 h-3" />
                                {doneTasks}/{totalTasks}
                            </span>
                        )}
                        {revisionCount > 0 && (
                            <span
                                title={`${revisionCount} catatan revisi`}
                                className="sparc-code-id inline-flex items-center gap-0.5 text-[10px] font-semibold text-[var(--md-sys-color-tertiary)]"
                            >
                                <MessageSquare className="w-3 h-3" />
                                {revisionCount}
                            </span>
                        )}
                    </div>

                    <div
                        title={`PIC: ${item.picName}`}
                        className="inline-flex items-center gap-1.5 shrink-0"
                    >
                        <span className="text-[10px] font-medium text-[var(--md-sys-color-on-surface-variant)] max-w-[68px] truncate">
                            {item.picName.split(' ')[0]}
                        </span>
                        <img
                            src={item.picAvatar}
                            alt={item.picName}
                            className="w-5 h-5 rounded-full object-cover border border-[var(--md-sys-color-outline-variant)]"
                        />
                    </div>
                </div>

                {/* Mobile Quick Move: native select avoids hard long-press drag between columns */}
                {!isOverlay && currentRole !== 'viewer' && (
                    <div className="md:hidden pt-2 border-t border-[var(--md-sys-color-outline-variant)]/70">
                        <label className="flex items-center justify-between gap-2 text-[10px] font-semibold text-[var(--md-sys-color-on-surface-muted)]">
                            <span>Pindah tahap</span>
                            <select
                                aria-label={`Pindah tahap kartu ${item.contentId}`}
                                value={canonical}
                                onChange={(e) =>
                                    handleMoveCardStatus(
                                        item.id,
                                        e.target.value as CanonicalWorkflowStatus
                                    )
                                }
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                className="h-8 text-xs font-semibold bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-lg px-2 text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 cursor-pointer"
                            >
                                {KANBAN_COLUMNS.map((statusKey) => (
                                    <option
                                        key={statusKey}
                                        value={statusKey}
                                        disabled={
                                            (statusKey === 'ready_to_publish' &&
                                                !can?.approveContent) ||
                                            (statusKey === 'published' &&
                                                !['admin', 'manager', 'publisher'].includes(currentRole))
                                        }
                                    >
                                        {WORKFLOW_STATUS_META[statusKey].label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                )}
            </div>
        );
    };

    return (
        <AppLayout
            title="Production Board"
            subtitle="Papan alur produksi 6 tahap HUMAS — seret kartu antar kolom atau buka rincian tugas & catatan revisi"
            actions={
                <div className="flex flex-wrap items-center gap-2">
                    <div
                        role="navigation"
                        aria-label="Alih tampilan alur konten"
                        className="bg-[var(--md-sys-color-surface-container)] p-1 rounded-xl inline-flex items-center border border-[var(--md-sys-color-outline-variant)]"
                    >
                        <button
                            type="button"
                            onClick={() => setViewMode('table')}
                            className={`px-2.5 py-1 rounded-lg text-xs inline-flex items-center gap-1.5 transition-colors ${
                                viewMode === 'table'
                                    ? 'font-bold bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] shadow-2xs'
                                    : 'font-semibold text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                            }`}
                        >
                            <TableProperties className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" />
                            Content Plan
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('kanban')}
                            className={`px-2.5 py-1 rounded-lg text-xs inline-flex items-center gap-1.5 transition-colors ${
                                viewMode === 'kanban'
                                    ? 'font-bold bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] shadow-2xs'
                                    : 'font-semibold text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                            }`}
                        >
                            <KanbanIcon className="w-3.5 h-3.5" />
                            Production Board
                        </button>
                    </div>

                    {can?.editContent && (
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                isLoading={isSyncingAll}
                                icon={<RefreshCw className={`w-3.5 h-3.5 text-purple-600 dark:text-purple-400 ${isSyncingAll ? 'animate-spin' : ''}`} />}
                                onClick={handleSyncAllInstagram}
                                title="Tarik pembaruan metrik dari Instagram untuk semua konten yang sudah tayang"
                            >
                                Sync Metrik IG
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                icon={<Plus className="w-3.5 h-3.5" />}
                                onClick={() => {
                                    createForm.clearErrors();
                                    setCreateModalOpen(true);
                                }}
                            >
                                Tambah Konten
                            </Button>
                        </>
                    )}
                </div>
            }
        >
            <Head title="Production Board - SPARC" />

            <div className="space-y-4">
                {/* Role Authorization Hint Banner when non-approver views board */}
                {!can?.approveContent && (
                    <div className="px-3.5 py-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] flex items-center gap-2.5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                        <ShieldAlert className="w-4 h-4 text-[var(--md-sys-color-primary)] shrink-0" />
                        <span>
                            {currentRole === 'viewer'
                                ? 'Mode Viewer Pimpinan: papan produksi dalam akses baca saja.'
                                : 'Aturan Alur Kerja: Persetujuan ke kolom "Siap Tayang" membutuhkan otorisasi Kepala HUMAS atau Administrator.'}
                        </span>
                    </div>
                )}

                {/* Compact Search & Filter Bar */}
                <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-3.5 rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="relative w-full sm:w-64">
                            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--md-sys-color-on-surface-muted)] pointer-events-none" />
                            <input
                                type="search"
                                aria-label="Cari kode SPARC, judul, atau PIC"
                                placeholder="Cari SPARC-2026-XXXX, judul, PIC..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-9 pl-9 pr-3 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 focus:border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-muted)]"
                            />
                        </div>

                        <select
                            aria-label="Filter berdasarkan kanal"
                            value={platformFilter}
                            onChange={(e) => setPlatformFilter(e.target.value)}
                            className="h-9 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 text-[var(--md-sys-color-on-surface)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 cursor-pointer"
                        >
                            <option value="all">Kanal: Semua</option>
                            <option value="instagram">Instagram</option>
                            <option value="tiktok">TikTok</option>
                            <option value="youtube">YouTube</option>
                            <option value="website">Website</option>
                            <option value="whatsapp">WhatsApp</option>
                            <option value="facebook">Facebook</option>
                        </select>

                        <select
                            aria-label="Filter berdasarkan pilar"
                            value={pillarFilter}
                            onChange={(e) => setPillarFilter(e.target.value)}
                            className="h-9 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 text-[var(--md-sys-color-on-surface)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 cursor-pointer"
                        >
                            <option value="all">Pilar: Semua</option>
                            <option value="edukasi">Edukasi</option>
                            <option value="program">Program</option>
                            <option value="kelembagaan">Kelembagaan</option>
                            <option value="inspirasi">Inspirasi</option>
                            <option value="fundraising">Fundraising</option>
                            <option value="event">Event & Liputan</option>
                            <option value="pengumuman">Pengumuman</option>
                        </select>

                        <select
                            aria-label="Filter berdasarkan prioritas"
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value)}
                            className="h-9 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 text-[var(--md-sys-color-on-surface)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 cursor-pointer"
                        >
                            <option value="all">Prioritas: Semua</option>
                            <option value="critical">Kritis</option>
                            <option value="tinggi">Tinggi</option>
                            <option value="normal">Normal</option>
                            <option value="rendah">Rendah</option>
                        </select>

                        {hasActiveFilters && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                icon={<RotateCcw className="w-3.5 h-3.5" />}
                                onClick={resetFilters}
                            >
                                Reset
                            </Button>
                        )}
                    </div>

                    <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                        Menampilkan{' '}
                        <strong className="sparc-code-id text-[var(--md-sys-color-on-surface)]">
                            {filteredItems.length}
                        </strong>{' '}
                        dari {items.length} kartu
                    </div>
                </div>

                {/* 6-Column Kanban Board */}
                {viewMode === 'kanban' ? (
                    filteredItems.length === 0 ? (
                        <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] p-12 text-center space-y-3 shadow-[var(--md-elevation-1)]">
                            <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                Tidak ada kartu konten yang sesuai filter
                            </p>
                            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] max-w-md mx-auto">
                                Reset filter kanal, pilar, atau prioritas untuk menampilkan seluruh alur kerja produksi.
                            </p>
                            <div className="pt-1">
                                <Button variant="secondary" size="sm" onClick={resetFilters}>
                                    Tampilkan Semua Kartu
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCorners}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                        >
                            <div className="flex gap-3.5 overflow-x-auto pb-3 snap-x snap-mandatory overscroll-x-contain min-w-[300px] items-start md:grid md:grid-cols-3 xl:grid-cols-6 md:gap-3.5 md:snap-none md:overscroll-x-auto xl:min-w-[1220px]">
                                {KANBAN_COLUMNS.map((statusKey) => {
                                    const meta = WORKFLOW_STATUS_META[statusKey];
                                    const StatusIcon = meta.icon;
                                    const colItems = filteredItems.filter(
                                        (item) => normalizeWorkflowStatus(item.status) === statusKey
                                    );

                                    return (
                                        <DroppableColumn
                                            key={statusKey}
                                            id={`planner-col-${statusKey}`}
                                            className="w-full shrink-0 snap-start basis-full md:w-auto md:basis-auto bg-[var(--md-sys-color-surface-container-low)] dark:bg-[var(--md-sys-color-surface-container-lowest)]/85 p-3 rounded-2xl border border-[var(--md-sys-color-outline-variant)]/85 space-y-2.5"
                                        >
                                            {/* Column Header */}
                                            <div className="flex items-center justify-between gap-2 px-1 py-0.5">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <span
                                                        style={meta.styleVars}
                                                        className="w-5 h-5 rounded-md border inline-flex items-center justify-center shrink-0"
                                                    >
                                                        <StatusIcon className="w-3 h-3" />
                                                    </span>
                                                    <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate">
                                                        {meta.label}
                                                    </h3>
                                                </div>
                                                <span
                                                    style={meta.styleVars}
                                                    className="sparc-code-id px-1.5 py-0.5 rounded-full border text-[10px] font-bold shrink-0"
                                                >
                                                    {colItems.length}
                                                </span>
                                            </div>

                                            {/* Cards List */}
                                            <SortableContext
                                                items={colItems.map((i) => i.id)}
                                                strategy={verticalListSortingStrategy}
                                            >
                                                <div className="space-y-2.5 min-h-[340px]">
                                                    {colItems.map((item) => (
                                                        <SortableCardItem
                                                            key={item.id}
                                                            id={item.id}
                                                            className="rounded-2xl"
                                                            onClick={() => setActiveDetailId(item.id)}
                                                        >
                                                            {renderKanbanCard(item)}
                                                        </SortableCardItem>
                                                    ))}

                                                    {colItems.length === 0 && (
                                                        <div className="h-24 flex items-center justify-center border border-dashed border-[var(--md-sys-color-outline-variant)] rounded-xl text-[var(--md-sys-color-on-surface-muted)] text-[11px]">
                                                            Tarik kartu ke tahap ini
                                                        </div>
                                                    )}
                                                </div>
                                            </SortableContext>
                                        </DroppableColumn>
                                    );
                                })}
                            </div>

                            <DragOverlay>
                                {activeDragItem ? renderKanbanCard(activeDragItem, true) : null}
                            </DragOverlay>
                        </DndContext>
                    )
                ) : (
                    filteredItems.length === 0 ? (
                        <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] p-12 text-center space-y-3 shadow-[var(--md-elevation-1)]">
                            <FolderKanban className="w-9 h-9 text-[var(--md-sys-color-on-surface-muted)] mx-auto" />
                            <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                Tidak ada rencana konten yang sesuai filter
                            </p>
                            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] max-w-md mx-auto">
                                Sesuaikan kata kunci pencarian atau atur ulang filter status, kanal, dan pilar untuk melihat seluruh daftar rencana publikasi.
                            </p>
                            <div className="pt-1 flex items-center justify-center gap-2">
                                {hasActiveFilters && (
                                    <Button variant="secondary" size="sm" onClick={resetFilters}>
                                        Reset Filter
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">
                                            <th className="py-3 px-3.5">Kode & Judul Konten</th>
                                            <th className="py-3 px-3">Status Alur</th>
                                            <th className="py-3 px-3">Prioritas</th>
                                            <th className="py-3 px-3">Kanal & Format</th>
                                            <th className="py-3 px-3">Pilar</th>
                                            <th className="py-3 px-3">PIC</th>
                                            <th className="py-3 px-3">Tenggat Produksi</th>
                                            <th className="py-3 px-3">Jadwal Tayang</th>
                                            <th className="py-3 px-3">Hasil Video / Review</th>
                                            <th className="py-3 px-3">Revisi</th>
                                            <th className="py-3 px-3">Link Socmed</th>
                                            <th className="py-3 pl-3 pr-4 text-right">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]/60">
                                        {filteredItems.map((item) => {
                                            const isDone = normalizeWorkflowStatus(item.status) === 'published';
                                            return (
                                                <tr
                                                    key={item.id}
                                                    onClick={() => setActiveDetailId(item.id)}
                                                    className="notion-row cursor-pointer group"
                                                >
                                                    <td className="py-3 px-3.5 max-w-xs">
                                                        <div className="space-y-0.5">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <ContentIdBadge contentId={item.contentId} />
                                                                {item.ticketId && (
                                                                     <span className="sparc-code-id text-[10px] font-semibold text-[var(--md-sys-color-primary)]">
                                                                        {item.ticketId}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="font-semibold text-[var(--md-sys-color-on-surface)] line-clamp-1">
                                                                {item.title}
                                                            </p>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-3 whitespace-nowrap">
                                                        <StatusChip status={item.status} />
                                                    </td>
                                                    <td className="py-3 px-3 whitespace-nowrap">
                                                        <PriorityBadge priority={item.priority} />
                                                    </td>
                                                    <td className="py-3 px-3 whitespace-nowrap">
                                                        <PlatformChip platform={item.platform} format={item.format} />
                                                    </td>
                                                    <td className="py-3 px-3 whitespace-nowrap">
                                                        <PillarTag pillar={item.pillar} />
                                                    </td>
                                                    <td className="py-3 px-3 whitespace-nowrap">
                                                        <div className="flex items-center gap-2">
                                                            <img
                                                                src={item.picAvatar}
                                                                alt={item.picName}
                                                                className="w-5 h-5 rounded-full object-cover border border-[var(--md-sys-color-outline-variant)]"
                                                            />
                                                            <span className="text-xs text-[var(--md-sys-color-on-surface)] font-medium">
                                                                {item.picName}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-3 whitespace-nowrap">
                                                        <DeadlineBadge
                                                            date={item.productionDeadline}
                                                            kind="production"
                                                            isDone={isDone}
                                                            todayStr={today}
                                                        />
                                                    </td>
                                                    <td className="py-3 px-3 whitespace-nowrap">
                                                        <DeadlineBadge
                                                            date={item.publishDate}
                                                            kind="publish"
                                                            isDone={isDone}
                                                            todayStr={today}
                                                        />
                                                    </td>
                                                    <td className="py-3 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                        {item.resultDesignUrl ? (
                                                            <a
                                                                href={item.resultDesignUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 transition-colors"
                                                                title={`Review materi: ${item.resultDesignUrl}`}
                                                            >
                                                                <Video className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                                                                Lihat Video ↗
                                                            </a>
                                                        ) : (
                                                            <span className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">—</span>
                                                        )}
                                                    </td>

                                                    <td className="py-3 px-3 max-w-[160px]">
                                                        {item.revisionNote ? (
                                                            <span
                                                                title={item.revisionNote}
                                                                className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-md border border-amber-500/30 max-w-full"
                                                            >
                                                                <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                                                                <span className="truncate">{item.revisionNote}</span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">—</span>
                                                        )}
                                                    </td>

                                                    <td className="py-3 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                        {item.publishedUrl ? (
                                                            <a
                                                                href={item.publishedUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                                                                title={item.publishedUrl}
                                                            >
                                                                <ExternalLink className="w-3 h-3" />
                                                                Postingan ↗
                                                            </a>
                                                        ) : (
                                                            <span className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">—</span>
                                                        )}
                                                    </td>
                                                    <td
                                                        className="py-3 pl-3 pr-4 text-right whitespace-nowrap"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setActiveDetailId(item.id)}
                                                        >
                                                            Rincian
                                                        </Button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )
                )}
            </div>

            {/* Shared Slide-Over Detail Sheet */}
            <ContentDetailSheet
                item={activeDetailItem}
                today={today}
                team={team}
                onClose={() => setActiveDetailId(null)}
            />

            {/* Create Content Modal */}
            <Modal
                isOpen={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
                title="Tambah Konten ke Production Board"
                description="Rencana konten otomatis tersinkronisasi dengan tabel Content Plan dan Kalender Operasional"
                maxWidth="lg"
            >
                <form onSubmit={handleCreateSubmit} className="space-y-4" noValidate>
                    <Input
                        label="Judul Konten"
                        required
                        placeholder="Contoh: Reels Panduan Pengaduan Layanan Masyarakat"
                        value={createForm.data.title}
                        onChange={(e) => createForm.setData('title', e.target.value)}
                        error={createForm.errors.title}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Select
                            label="Kanal Utama"
                            value={createForm.data.platform}
                            onChange={(e) =>
                                createForm.setData('platform', e.target.value as SocialPlatform)
                            }
                        >
                            <option value="instagram">Instagram</option>
                            <option value="tiktok">TikTok</option>
                            <option value="youtube">YouTube</option>
                            <option value="website">Website Resmi</option>
                            <option value="whatsapp">WhatsApp</option>
                            <option value="facebook">Facebook</option>
                        </Select>

                        <Select
                            label="Format Visual"
                            value={createForm.data.format}
                            onChange={(e) => createForm.setData('format', e.target.value)}
                        >
                            <option value="reels_shorts">Reels / Short Video</option>
                            <option value="carousel">Carousel</option>
                            <option value="single_image">Single Image</option>
                            <option value="video_long">Video Panjang</option>
                            <option value="artikel">Artikel Website</option>
                        </Select>

                        <Select
                            label="Pilar Komunikasi"
                            value={createForm.data.pillar}
                            onChange={(e) =>
                                createForm.setData('pillar', e.target.value as ContentPillarKey)
                            }
                        >
                            <option value="edukasi">Edukasi</option>
                            <option value="program">Program</option>
                            <option value="kelembagaan">Kelembagaan</option>
                            <option value="inspirasi">Inspirasi</option>
                            <option value="fundraising">Fundraising</option>
                        </Select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Select
                            label="Prioritas"
                            value={createForm.data.priority}
                            onChange={(e) =>
                                createForm.setData('priority', e.target.value as PriorityLevel)
                            }
                        >
                            <option value="critical">Kritis</option>
                            <option value="tinggi">Tinggi</option>
                            <option value="normal">Normal</option>
                            <option value="rendah">Rendah</option>
                        </Select>

                        <Select
                            label="Penanggung Jawab (PIC)"
                            value={createForm.data.pic_name}
                            onChange={(e) => createForm.setData('pic_name', e.target.value)}
                        >
                            {picOptions.map((pic) => (
                                <option key={pic} value={pic}>
                                    {pic}
                                </option>
                            ))}
                        </Select>

                        <Select
                            label="Kolom Awal"
                            value={createForm.data.status}
                            onChange={(e) =>
                                createForm.setData('status', e.target.value as CanonicalWorkflowStatus)
                            }
                        >
                            <option value="inbox">Inbox Request</option>
                            <option value="briefing">Briefing & Ideasi</option>
                            <option value="in_progress">Produksi</option>
                        </Select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Input
                            type="date"
                            label="Tenggat Produksi"
                            required
                            value={createForm.data.production_deadline}
                            onChange={(e) => createForm.setData('production_deadline', e.target.value)}
                            error={createForm.errors.production_deadline}
                        />
                        <Input
                            type="date"
                            label="Rencana Tanggal Tayang"
                            required
                            value={createForm.data.publish_date}
                            onChange={(e) => createForm.setData('publish_date', e.target.value)}
                            error={createForm.errors.publish_date}
                        />
                    </div>

                    {activities.length > 0 && (
                        <Select
                            label="Tautkan ke Agenda Lembaga (Opsional)"
                            value={createForm.data.activity_title}
                            onChange={(e) => createForm.setData('activity_title', e.target.value)}
                        >
                            <option value="">— Tanpa tautan agenda —</option>
                            {activities.map((act) => (
                                <option key={act.id} value={act.title}>
                                    {act.activityDate} • {act.title}
                                </option>
                            ))}
                        </Select>
                    )}

                    <Textarea
                        label="Brief Kreatif"
                        rows={3}
                        placeholder="Ringkasan pesan utama dan referensi visual..."
                        value={createForm.data.brief}
                        onChange={(e) => createForm.setData('brief', e.target.value)}
                    />
                    <Input
                        label="Link Referensi Desain (Opsional)"
                        placeholder="Canva, Pinterest, Google Drive..."
                        value={createForm.data.ref_design_url}
                        onChange={(e) => createForm.setData('ref_design_url', e.target.value)}
                    />
                    <Textarea
                        label="Caption / Copywriting"
                        rows={3}
                        placeholder="Draft caption untuk postingan..."
                        value={createForm.data.caption}
                        onChange={(e) => createForm.setData('caption', e.target.value)}
                    />

                    <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            disabled={createForm.processing}
                            onClick={() => setCreateModalOpen(false)}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            isLoading={createForm.processing}
                            icon={<Plus className="w-4 h-4" />}
                        >
                            Simpan Kartu
                        </Button>
                    </div>
                </form>
            </Modal>
        </AppLayout>
    );
}
