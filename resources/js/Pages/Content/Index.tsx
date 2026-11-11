import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    DndContext,
    DragOverlay,
    closestCorners,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
    AlertCircle,
    Check,
    CheckSquare,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Copy,
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
    SlidersHorizontal,
    TableProperties,
    Video,
} from 'lucide-react';
import { AppLayout, type SharedWorkspaceProps } from '@/Layouts/AppLayout';
import { ContentDetailSheet } from '@/Components/ContentDetailSheet';
import { MonthNavigator } from '@/Components/MonthNavigator';
import { DroppableColumn, SortableCardItem, useKanbanSensors } from '@/Components/UI/KanbanDnd';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
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
import { cn } from '@/lib/utils';
import { runChunkedInstagramSync } from '@/lib/instagramSync';
import type { InstitutionalActivity, SparcContentItem, SparcTeamMember } from '@/types/sparc';

interface ContentPlanPageProps {
    today?: string;
    month?: string;
    currentMonth?: string;
    contentItems?: SparcContentItem[];
    activities?: InstitutionalActivity[];
    team?: SparcTeamMember[];
    filters?: {
        q?: string;
        platform?: string;
        pillar?: string;
        status?: string;
        priority?: string;
        pic?: string;
        view?: string;
    };
}

const WORKFLOW_ORDER: CanonicalWorkflowStatus[] = [
    'inbox',
    'briefing',
    'in_progress',
    'review_approval',
    'ready_to_publish',
    'published',
];

function resolvePicAvatar(item: SparcContentItem, team: SparcTeamMember[] = []): string {
    if (item.picAvatar) {
        return item.picAvatar;
    }
    const matched = team.find(
        (m) => m.name.toLowerCase() === (item.picName || '').toLowerCase()
    );
    if (matched?.avatar) {
        return matched.avatar;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(item.picName || 'PIC')}&background=0F172A&color=fff&size=96&bold=true`;
}

export default function ContentPlanIndex({
    today = '2026-10-27',
    month: monthProp,
    currentMonth: currentMonthProp,
    contentItems = [],
    activities = [],
    team = [],
    filters = {},
}: ContentPlanPageProps) {
    const { props } = usePage<SharedWorkspaceProps>();
    const month = monthProp ?? today.slice(0, 7);
    const currentMonth = currentMonthProp ?? today.slice(0, 7);
    const can = props.auth?.can;
    const currentRole = props.auth?.user?.role ?? 'admin';
    const { success: toastSuccess, error: toastError } = useToast();

    const [items, setItems] = useState<SparcContentItem[]>(contentItems);
    useEffect(() => {
        setItems(contentItems);
    }, [contentItems]);

    // Filter state initialized from query params
    const [searchQuery, setSearchQuery] = useState(filters.q ?? '');
    const [platformFilter, setPlatformFilter] = useState(filters.platform ?? 'all');
    const [pillarFilter, setPillarFilter] = useState(filters.pillar ?? 'all');
    const [statusFilter, setStatusFilter] = useState(filters.status ?? 'all');
    const [priorityFilter, setPriorityFilter] = useState(filters.priority ?? 'all');
    const [picFilter, setPicFilter] = useState(filters.pic ?? 'all');

    // Selection for Manager/Admin Bulk Actions
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [bulkStatus, setBulkStatus] = useState('');
    const [bulkPriority, setBulkPriority] = useState('');
    const [bulkPic, setBulkPic] = useState('');
    const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

    // Detail Sheet & Create Modal
    const [activeDetailId, setActiveDetailId] = useState<string | null>(null);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [isSyncingAll, setIsSyncingAll] = useState(false);
    const [syncProgressCount, setSyncProgressCount] = useState(0);

    const handleSyncAllInstagram = async () => {
        setIsSyncingAll(true);
        setSyncProgressCount(0);
        const res = await runChunkedInstagramSync({
            onProgress: (p) => setSyncProgressCount(p.fetchedCount),
        });
        setIsSyncingAll(false);
        if (!res.success) {
            toastError('Sinkronisasi Massal Gagal', res.error || 'Terjadi kesalahan saat menyinkronkan Instagram.');

            return;
        }
        toastSuccess(
            'Sinkronisasi Massal Selesai',
            `${res.syncedCount.toLocaleString('id-ID')} konten Instagram diperbarui (${res.importedCount.toLocaleString('id-ID')} postingan baru diimpor).`
        );
        router.reload();
    };
    const [viewMode, setViewMode] = useState<'table' | 'kanban'>(
        filters.view === 'table' ? 'table' : 'kanban'
    );

    useEffect(() => {
        if (filters.view === 'kanban' || filters.view === 'table') {
            setViewMode(filters.view);
        }
    }, [filters.view]);

    const handleSwitchView = (nextView: 'table' | 'kanban') => {
        setViewMode(nextView);
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            if (nextView === 'kanban') {
                url.searchParams.set('view', 'kanban');
            } else {
                url.searchParams.delete('view');
            }
            window.history.replaceState({}, '', url.toString());
        }
    };
    const sensors = useKanbanSensors();
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const activeDragItem = useMemo(
        () => (activeDragId ? items.find((i) => i.id === activeDragId) ?? null : null),
        [activeDragId, items]
    );
    const boardScrollRef = useRef<HTMLDivElement | null>(null);
    const [boardOverflowing, setBoardOverflowing] = useState(false);
    const scrollBoardBy = (dx: number) => {
        boardScrollRef.current?.scrollBy({ left: dx, behavior: 'smooth' });
    };

    const scrollToColumn = (statusKey: CanonicalWorkflowStatus) => {
        const col = document.getElementById(`content-col-${statusKey}`);
        col?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    };

    const activeDetailItem = useMemo(
        () => (activeDetailId ? items.find((i) => i.id === activeDetailId) ?? null : null),
        [activeDetailId, items]
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
            const canonicalStatus = normalizeWorkflowStatus(item.status);
            if (platformFilter !== 'all' && item.platform !== platformFilter) {
                return false;
            }
            if (pillarFilter !== 'all' && item.pillar !== pillarFilter) {
                return false;
            }
            if (statusFilter !== 'all' && canonicalStatus !== statusFilter) {
                return false;
            }
            if (priorityFilter !== 'all' && item.priority !== priorityFilter) {
                return false;
            }
            if (picFilter !== 'all' && item.picName !== picFilter) {
                return false;
            }
            if (searchQuery.trim() !== '') {
                const q = searchQuery.toLowerCase();
                const inTitle = item.title.toLowerCase().includes(q);
                const inCode = item.contentId.toLowerCase().includes(q);
                const inPic = item.picName.toLowerCase().includes(q);
                const inRequester = item.requesterName?.toLowerCase().includes(q) ?? false;
                const inRequesterUnit = item.requesterUnit?.toLowerCase().includes(q) ?? false;
                const inTicket = item.ticketId?.toLowerCase().includes(q) ?? false;
                const inActivity = item.activityTitle?.toLowerCase().includes(q) ?? false;
                if (!inTitle && !inCode && !inPic && !inRequester && !inRequesterUnit && !inTicket && !inActivity) {
                    return false;
                }
            }
            return true;
        });
    }, [items, platformFilter, pillarFilter, statusFilter, priorityFilter, picFilter, searchQuery]);

    useEffect(() => {
        const el = boardScrollRef.current;
        if (!el || viewMode !== 'kanban') {
            setBoardOverflowing(false);
            return;
        }
        const checkOverflow = () => {
            setBoardOverflowing(el.scrollWidth > el.clientWidth + 4);
        };
        checkOverflow();
        const ro = new ResizeObserver(checkOverflow);
        ro.observe(el);
        window.addEventListener('resize', checkOverflow);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', checkOverflow);
        };
    }, [viewMode, filteredItems.length]);

    const hasActiveFilters =
        searchQuery.trim() !== '' ||
        platformFilter !== 'all' ||
        pillarFilter !== 'all' ||
        statusFilter !== 'all' ||
        priorityFilter !== 'all' ||
        picFilter !== 'all';

    const resetFilters = () => {
        setSearchQuery('');
        setPlatformFilter('all');
        setPillarFilter('all');
        setStatusFilter('all');
        setPriorityFilter('all');
        setPicFilter('all');
    };

    // Quick summary counters for editorial context bar
    const summaryCounts = useMemo(() => {
        const overdue = items.filter(
            (i) =>
                normalizeWorkflowStatus(i.status) !== 'published' &&
                Boolean(i.productionDeadline) &&
                i.productionDeadline < today
        ).length;
        const waitingApproval = items.filter(
            (i) => normalizeWorkflowStatus(i.status) === 'review_approval'
        ).length;
        const readyToPublish = items.filter(
            (i) => normalizeWorkflowStatus(i.status) === 'ready_to_publish'
        ).length;
        return { overdue, waitingApproval, readyToPublish };
    }, [items, today]);

    // Create Content Form (`POST /content`)
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
                toastError('Validasi Rencana Gagal', 'Periksa kembali judul serta tanggal produksi dan tayang.');
            },
        });
    };

    // Inline Status Update with Optimistic State & RBAC Rollback
    const handleInlineStatusChange = (item: SparcContentItem, nextStatus: CanonicalWorkflowStatus) => {
        const prevSnapshot = items;
        if (normalizeWorkflowStatus(item.status) === nextStatus) {
            return;
        }

        setItems((curr) =>
            curr.map((row) => (row.id === item.id ? { ...row, status: nextStatus } : row))
        );

        router.patch(
            `/content/${item.id}/status`,
            { status: nextStatus },
            {
                preserveScroll: true,
                preserveState: true,
                onError: (errors) => {
                    setItems(prevSnapshot);
                    toastError(
                        'Perubahan Status Ditolak',
                        errors.status || 'Peran Anda tidak memiliki izin untuk transisi alur kerja ini.'
                    );
                },
            }
        );
    };

    const handleQuickDuplicate = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        router.post(
            `/content/${id}/duplicate`,
            {},
            {
                preserveScroll: true,
                onError: () => toastError('Gagal Menduplikasi', 'Konten tidak dapat diduplikasi saat ini.'),
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
        const overId = String(over.id);
        const targetStatus = overId.startsWith('content-col-')
            ? (overId.replace('content-col-', '') as CanonicalWorkflowStatus)
            : normalizeWorkflowStatus(items.find((i) => i.id === overId)?.status ?? '');
        const card = items.find((i) => i.id === String(active.id));
        if (card && targetStatus && normalizeWorkflowStatus(card.status) !== targetStatus) {
            handleInlineStatusChange(card, targetStatus);
        }
    };

    const allFilteredSelected =
        filteredItems.length > 0 && filteredItems.every((i) => selectedIds.includes(i.id));

    const toggleSelectAll = () => {
        if (allFilteredSelected) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredItems.map((i) => i.id));
        }
    };

    const toggleSelectRow = (id: string) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    const handleApplyBulk = () => {
        if (selectedIds.length === 0 || (!bulkStatus && !bulkPriority && !bulkPic)) {
            toastError('Pilih Aksi Massal', 'Tentukan minimal satu perubahan (Status, Prioritas, atau PIC).');
            return;
        }
        setIsBulkSubmitting(true);
        router.post(
            '/content/bulk',
            {
                ids: selectedIds,
                status: bulkStatus || null,
                priority: bulkPriority || null,
                pic_name: bulkPic || null,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setSelectedIds([]);
                    setBulkStatus('');
                    setBulkPriority('');
                    setBulkPic('');
                },
                onError: () => {
                    toastError('Aksi Massal Ditolak', 'Hanya Kepala HUMAS atau Administrator yang diizinkan.');
                },
                onFinish: () => setIsBulkSubmitting(false),
            }
        );
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
                        {item.isCarryOver && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 whitespace-nowrap">
                                Bulan lalu
                            </span>
                        )}
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

                {/* Row 3.75: Pemohon HaloAPU & Yang Dipertugaskan (PIC) */}
                {(item.requesterName || item.haloapuTicketId || item.ticketId) && (
                    <div className="rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]/70 px-2.5 py-2 space-y-1.5 text-[10px]">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                            <span className="text-[var(--md-sys-color-on-surface-muted)] font-medium shrink-0">
                                Diajukan:
                            </span>
                            <div className="inline-flex items-center gap-1.5 min-w-0">
                                {item.requesterAvatar && (
                                    <img
                                        src={item.requesterAvatar}
                                        alt={item.requesterName || 'Pemohon'}
                                        className="w-4 h-4 rounded-full object-cover border border-[var(--md-sys-color-outline-variant)] shrink-0"
                                    />
                                )}
                                <span
                                    title={
                                        item.requesterName
                                            ? `${item.requesterName}${item.requesterUnit ? ` (${item.requesterUnit})` : ''}`
                                            : 'Pemohon HaloAPU'
                                    }
                                    className="font-semibold text-[var(--md-sys-color-on-surface)] truncate"
                                >
                                    {item.requesterName || 'Pemohon HaloAPU'}
                                    {item.requesterUnit ? ` • ${item.requesterUnit}` : ''}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 min-w-0 pt-1 border-t border-[var(--md-sys-color-outline-variant)]/50">
                            <span className="text-[var(--md-sys-color-on-surface-muted)] font-medium shrink-0">
                                Dipertugaskan:
                            </span>
                            {item.picName && item.picName !== 'Belum Ditugaskan' ? (
                                <div
                                    title={`Dipertugaskan ke: ${item.picName}`}
                                    className="inline-flex items-center gap-1.5 min-w-0"
                                >
                                    <span className="font-bold text-[var(--md-sys-color-primary)] truncate">
                                        {item.picName}
                                    </span>
                                    <img
                                        src={resolvePicAvatar(item, team)}
                                        alt={item.picName}
                                        className="w-4 h-4 rounded-full object-cover border border-[var(--md-sys-color-outline-variant)] shrink-0"
                                    />
                                </div>
                            ) : (
                                <span className="font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded text-[9px]">
                                    Belum ditugaskan
                                </span>
                            )}
                        </div>
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

                    {!(item.requesterName || item.haloapuTicketId || item.ticketId) && (
                        <div
                            title={`Dipertugaskan (PIC): ${item.picName}`}
                            className="inline-flex items-center gap-1.5 shrink-0"
                        >
                            {item.picName && item.picName !== 'Belum Ditugaskan' ? (
                                <>
                                    <span className="text-[10px] font-medium text-[var(--md-sys-color-on-surface-variant)] max-w-[68px] truncate">
                                        {item.picName.split(' ')[0]}
                                    </span>
                                    <img
                                        src={resolvePicAvatar(item, team)}
                                        alt={item.picName}
                                        className="w-5 h-5 rounded-full object-cover border border-[var(--md-sys-color-outline-variant)]"
                                    />
                                </>
                            ) : (
                                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                    Belum ada PIC
                                </span>
                            )}
                        </div>
                    )}
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
                                    handleInlineStatusChange(
                                        item,
                                        e.target.value as CanonicalWorkflowStatus
                                    )
                                }
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                className="h-8 text-xs font-semibold bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-lg px-2 text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 cursor-pointer"
                            >
                                {WORKFLOW_ORDER.map((statusKey) => (
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
            title="Content Planner"
            subtitle="Satu meja kerja terpadu perencanaan naskah, alur produksi visual, persetujuan, dan evaluasi performa konten HUMAS"
            actions={
                <div className="flex flex-wrap items-center gap-2">
                    <div
                        role="navigation"
                        aria-label="Alih tampilan alur konten"
                        className="bg-[var(--md-sys-color-surface-container)] p-1 rounded-xl inline-flex items-center border border-[var(--md-sys-color-outline-variant)]"
                    >
                        <button
                            type="button"
                            onClick={() => handleSwitchView('kanban')}
                            className={`px-2.5 py-1 rounded-lg text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                                viewMode === 'kanban'
                                    ? 'font-bold bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] shadow-2xs'
                                    : 'font-semibold text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                            }`}
                        >
                            <KanbanIcon className="w-3.5 h-3.5" />
                            Papan Kanban
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSwitchView('table')}
                            className={`px-2.5 py-1 rounded-lg text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                                viewMode === 'table'
                                    ? 'font-bold bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] shadow-2xs'
                                    : 'font-semibold text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                            }`}
                        >
                            <TableProperties className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" />
                            Tabel Spreadsheet
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
                                {isSyncingAll && syncProgressCount > 0 ? `Menarik IG (${syncProgressCount})...` : 'Sync Metrik IG'}
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
                                Buat Rencana
                            </Button>
                        </>
                    )}
                </div>
            }
        >
            <Head title="Content Planner — SPARC" />

            <div className="space-y-5 min-w-0">
                <MonthNavigator
                    month={month}
                    currentMonth={currentMonth}
                    basePath="/content"
                    extraQuery={{ view: viewMode }}
                    carryOverCount={items.filter((i) => i.isCarryOver).length}
                />

                {/* Operational Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <button
                        type="button"
                        onClick={() => setStatusFilter('all')}
                        className={`text-left p-3.5 rounded-2xl border transition-colors cursor-pointer ${
                            statusFilter === 'all'
                                ? 'bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border-[var(--md-sys-color-primary)]/50 shadow-[var(--md-elevation-1)]'
                                : 'bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border-[var(--md-sys-color-outline-variant)] hover:border-[var(--md-sys-color-outline)]'
                        }`}
                    >
                        <span className="sparc-eyebrow block">Total Rencana Aktif</span>
                        <span className="sparc-code-id text-xl font-black text-[var(--md-sys-color-on-surface)] mt-1 block">
                            {items.length}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() =>
                            setStatusFilter(statusFilter === 'review_approval' ? 'all' : 'review_approval')
                        }
                        className={`text-left p-3.5 rounded-2xl border transition-colors cursor-pointer ${
                            statusFilter === 'review_approval'
                                ? 'bg-[var(--md-sys-color-tertiary-container)]/45 border-[var(--md-sys-color-tertiary)]'
                                : 'bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border-[var(--md-sys-color-outline-variant)] hover:border-[var(--md-sys-color-outline)]'
                        }`}
                    >
                        <span className="sparc-eyebrow block">Menunggu Approval</span>
                        <span className="sparc-code-id text-xl font-black text-[var(--md-sys-color-tertiary)] mt-1 block">
                            {summaryCounts.waitingApproval}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() =>
                            setStatusFilter(statusFilter === 'ready_to_publish' ? 'all' : 'ready_to_publish')
                        }
                        className={`text-left p-3.5 rounded-2xl border transition-colors cursor-pointer ${
                            statusFilter === 'ready_to_publish'
                                ? 'bg-[var(--md-sys-color-primary-container)]/40 border-[var(--md-sys-color-primary)]'
                                : 'bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border-[var(--md-sys-color-outline-variant)] hover:border-[var(--md-sys-color-outline)]'
                        }`}
                    >
                        <span className="sparc-eyebrow block">Siap Tayang</span>
                        <span className="sparc-code-id text-xl font-black text-[var(--md-sys-color-primary)] mt-1 block">
                            {summaryCounts.readyToPublish}
                        </span>
                    </button>

                    <div className="p-3.5 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)]">
                        <span className="sparc-eyebrow block">Melewati Tenggat Produksi</span>
                        <span
                            className={`sparc-code-id text-xl font-black mt-1 block ${
                                summaryCounts.overdue > 0
                                    ? 'text-[var(--md-sys-color-error)]'
                                    : 'text-[var(--md-sys-color-secondary)]'
                            }`}
                        >
                            {summaryCounts.overdue}
                        </span>
                    </div>
                </div>

                {/* Search & Multi-Facet Filter Bar */}
                <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-3.5 rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="relative flex-1 min-w-[220px] max-w-md">
                            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--md-sys-color-on-surface-muted)] pointer-events-none" />
                            <input
                                type="search"
                                aria-label="Cari ID SPARC, judul konten, kampanye, atau PIC"
                                placeholder="Cari SPARC-2026-XXXX, judul, agenda, atau PIC..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-9 pl-9 pr-3 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 focus:border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-muted)]"
                            />
                        </div>

                        <div className="flex items-center gap-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                            <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--md-sys-color-on-surface-muted)]" />
                            <span>
                                Menampilkan{' '}
                                <strong className="text-[var(--md-sys-color-on-surface)] sparc-code-id">
                                    {filteredItems.length}
                                </strong>{' '}
                                dari {items.length} konten
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            aria-label="Filter status alur kerja"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="h-8 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-lg px-2.5 text-[var(--md-sys-color-on-surface)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 cursor-pointer"
                        >
                            <option value="all">Status: Semua Tahap</option>
                            {WORKFLOW_ORDER.map((st) => (
                                <option key={st} value={st}>
                                    {WORKFLOW_STATUS_META[st].label}
                                </option>
                            ))}
                        </select>

                        <select
                            aria-label="Filter tingkat prioritas"
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value)}
                            className="h-8 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-lg px-2.5 text-[var(--md-sys-color-on-surface)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 cursor-pointer"
                        >
                            <option value="all">Prioritas: Semua</option>
                            <option value="critical">Kritis</option>
                            <option value="tinggi">Tinggi</option>
                            <option value="normal">Normal</option>
                            <option value="rendah">Rendah</option>
                        </select>

                        <select
                            aria-label="Filter kanal distribusi"
                            value={platformFilter}
                            onChange={(e) => setPlatformFilter(e.target.value)}
                            className="h-8 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-lg px-2.5 text-[var(--md-sys-color-on-surface)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 cursor-pointer"
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
                            aria-label="Filter pilar komunikasi"
                            value={pillarFilter}
                            onChange={(e) => setPillarFilter(e.target.value)}
                            className="h-8 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-lg px-2.5 text-[var(--md-sys-color-on-surface)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 cursor-pointer"
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
                            aria-label="Filter penanggung jawab"
                            value={picFilter}
                            onChange={(e) => setPicFilter(e.target.value)}
                            className="h-8 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-lg px-2.5 text-[var(--md-sys-color-on-surface)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 cursor-pointer"
                        >
                            <option value="all">PIC: Semua Anggota</option>
                            {picOptions.map((pic) => (
                                <option key={pic} value={pic}>
                                    {pic}
                                </option>
                            ))}
                        </select>

                        {hasActiveFilters && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                icon={<RotateCcw className="w-3.5 h-3.5" />}
                                onClick={resetFilters}
                            >
                                Reset Filter
                            </Button>
                        )}
                    </div>
                </div>

                {/* Contextual Bulk Action Bar (Manager & Admin) */}
                {can?.bulkEditContent && selectedIds.length > 0 && (
                    <div className="p-3.5 rounded-2xl bg-[var(--md-sys-color-primary-container)]/55 border border-[var(--md-sys-color-primary)]/40 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-[var(--md-sys-color-on-primary-container)]">
                            <CheckSquare className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                            <span>{selectedIds.length} rencana konten dipilih</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                aria-label="Ubah status massal"
                                value={bulkStatus}
                                onChange={(e) => setBulkStatus(e.target.value)}
                                className="h-8 text-xs bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-lg px-2.5 text-[var(--md-sys-color-on-surface)]"
                            >
                                <option value="">Ubah Status...</option>
                                <option value="inbox">Inbox Request</option>
                                <option value="briefing">Briefing & Ideasi</option>
                                <option value="in_progress">Produksi</option>
                                <option value="review_approval">Review</option>
                                <option value="ready_to_publish">Siap Tayang</option>
                            </select>

                            <select
                                aria-label="Ubah prioritas massal"
                                value={bulkPriority}
                                onChange={(e) => setBulkPriority(e.target.value)}
                                className="h-8 text-xs bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-lg px-2.5 text-[var(--md-sys-color-on-surface)]"
                            >
                                <option value="">Ubah Prioritas...</option>
                                <option value="critical">Kritis</option>
                                <option value="tinggi">Tinggi</option>
                                <option value="normal">Normal</option>
                                <option value="rendah">Rendah</option>
                            </select>

                            <select
                                aria-label="Ubah PIC massal"
                                value={bulkPic}
                                onChange={(e) => setBulkPic(e.target.value)}
                                className="h-8 text-xs bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-lg px-2.5 text-[var(--md-sys-color-on-surface)]"
                            >
                                <option value="">Tetapkan PIC...</option>
                                {picOptions.map((pic) => (
                                    <option key={pic} value={pic}>
                                        {pic}
                                    </option>
                                ))}
                            </select>

                            <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                isLoading={isBulkSubmitting}
                                onClick={handleApplyBulk}
                            >
                                Terapkan Massal
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedIds([])}
                            >
                                Batal
                            </Button>
                        </div>
                    </div>
                )}

                {/* Main Operational Table */}
                {viewMode === 'table' ? (
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
                            {can?.editContent && (
                                <Button
                                    variant="primary"
                                    size="sm"
                                    icon={<Plus className="w-3.5 h-3.5" />}
                                    onClick={() => setCreateModalOpen(true)}
                                >
                                    Buat Rencana Konten
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
                                        {can?.bulkEditContent && (
                                            <th className="py-3 pl-4 pr-2 w-9">
                                                <input
                                                    type="checkbox"
                                                    aria-label="Pilih semua konten pada tabel"
                                                    checked={allFilteredSelected}
                                                    onChange={toggleSelectAll}
                                                    className="rounded border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-primary)] cursor-pointer"
                                                />
                                            </th>
                                        )}
                                        <th className="py-3 px-3.5">Kode & Judul Konten</th>
                                        <th className="py-3 px-3">Status Alur</th>
                                        <th className="py-3 px-3">Prioritas</th>
                                        <th className="py-3 px-3">Kanal & Format</th>
                                        <th className="py-3 px-3">Pilar</th>
                                        <th className="py-3 px-3">Dipertugaskan / Pemohon</th>
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
                                        const doneTasks = item.tasks?.filter((t) => t.status === 'done').length ?? 0;
                                        const totalTasks = item.tasks?.length ?? 0;
                                        const isSelected = selectedIds.includes(item.id);

                                        return (
                                            <tr
                                                key={item.id}
                                                onClick={() => setActiveDetailId(item.id)}
                                                className={`notion-row cursor-pointer group ${
                                                    isSelected
                                                        ? 'bg-[var(--md-sys-color-primary-container)]/20'
                                                        : ''
                                                }`}
                                            >
                                                {can?.bulkEditContent && (
                                                    <td
                                                        className="py-3 pl-4 pr-2"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            aria-label={`Pilih ${item.contentId}`}
                                                            checked={isSelected}
                                                            onChange={() => toggleSelectRow(item.id)}
                                                            className="rounded border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-primary)] cursor-pointer"
                                                        />
                                                    </td>
                                                )}

                                                <td className="py-3 px-3.5 min-w-[260px] max-w-sm">
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <ContentIdBadge contentId={item.contentId} />
                                                        {item.isCarryOver && (
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 whitespace-nowrap">
                                                                Bulan lalu
                                                            </span>
                                                        )}
                                                        {item.ticketId && (
                                                            <span className="sparc-code-id text-[10px] font-semibold text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]/50 px-1.5 py-0.5 rounded">
                                                                {item.ticketId}
                                                            </span>
                                                        )}
                                                        {totalTasks > 0 && (
                                                            <span className="sparc-code-id inline-flex items-center gap-1 text-[10px] text-[var(--md-sys-color-on-surface-muted)]">
                                                                <ListTodo className="w-3 h-3" />
                                                                {doneTasks}/{totalTasks}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)] transition-colors line-clamp-1">
                                                        {item.title}
                                                    </div>
                                                    {(item.activityTitle || item.campaignTitle) && (
                                                        <div className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] truncate mt-0.5">
                                                            {item.activityTitle || item.campaignTitle}
                                                        </div>
                                                    )}
                                                </td>

                                                <td
                                                    className="py-3 px-3 whitespace-nowrap"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {currentRole !== 'viewer' ? (
                                                        <DropdownMenu.Root>
                                                            <DropdownMenu.Trigger asChild>
                                                                <button
                                                                    type="button"
                                                                    aria-label={`Ubah status ${item.contentId}`}
                                                                    title="Klik untuk ubah status alur kerja"
                                                                    className="group/status inline-flex items-center gap-1.5 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] rounded-full transition-transform hover:scale-[1.03]"
                                                                >
                                                                    <StatusChip status={item.status} compact />
                                                                    <ChevronDown className="w-3 h-3 text-[var(--md-sys-color-on-surface-muted)] opacity-60 group-hover/status:opacity-100 transition-opacity shrink-0" />
                                                                </button>
                                                            </DropdownMenu.Trigger>
                                                            <DropdownMenu.Portal>
                                                                <DropdownMenu.Content
                                                                    align="start"
                                                                    sideOffset={6}
                                                                    className="z-50 min-w-44 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] p-1.5 shadow-[var(--md-elevation-3)]"
                                                                >
                                                                    <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-muted)]">
                                                                        Ubah Status
                                                                    </div>
                                                                    {WORKFLOW_ORDER.map((st) => {
                                                                        const meta = WORKFLOW_STATUS_META[st];
                                                                        const Icon = meta.icon;
                                                                        const isCurrent = normalizeWorkflowStatus(item.status) === st;
                                                                        return (
                                                                            <DropdownMenu.Item
                                                                                key={st}
                                                                                onSelect={() =>
                                                                                    handleInlineStatusChange(
                                                                                        item,
                                                                                        st
                                                                                    )
                                                                                }
                                                                                className={cn(
                                                                                    'flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-xl text-xs cursor-pointer outline-none transition-colors',
                                                                                    isCurrent
                                                                                        ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] font-bold'
                                                                                        : 'text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)]'
                                                                                )}
                                                                            >
                                                                                <span className="flex items-center gap-2 min-w-0">
                                                                                    <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" />
                                                                                    <span className="truncate">{meta.label}</span>
                                                                                </span>
                                                                                {isCurrent && <Check className="w-3.5 h-3.5 shrink-0" />}
                                                                            </DropdownMenu.Item>
                                                                        );
                                                                    })}
                                                                </DropdownMenu.Content>
                                                            </DropdownMenu.Portal>
                                                        </DropdownMenu.Root>
                                                    ) : (
                                                        <StatusChip status={item.status} compact />
                                                    )}
                                                </td>

                                                <td className="py-3 px-3 whitespace-nowrap">
                                                    <PriorityBadge priority={item.priority} compact />
                                                </td>

                                                <td className="py-3 px-3 whitespace-nowrap">
                                                    <PlatformChip platform={item.platform} format={item.format} />
                                                </td>

                                                <td className="py-3 px-3 whitespace-nowrap">
                                                    <PillarTag pillar={item.pillar} />
                                                </td>

                                                <td className="py-3 px-3 whitespace-nowrap">
                                                    <div className="space-y-1">
                                                        <div className="inline-flex items-center gap-2">
                                                            {item.picName && item.picName !== 'Belum Ditugaskan' ? (
                                                                <>
                                                                    <img
                                                                        src={resolvePicAvatar(item, team)}
                                                                        alt={item.picName}
                                                                        className="w-5 h-5 rounded-full object-cover border border-[var(--md-sys-color-outline-variant)]"
                                                                    />
                                                                    <span className="font-medium text-[var(--md-sys-color-on-surface)]">
                                                                        {item.picName}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                                                    Belum ditugaskan
                                                                </span>
                                                            )}
                                                        </div>
                                                        {(item.requesterName || item.haloapuTicketId || item.ticketId) && (
                                                            <div className="flex items-center gap-1.5 text-[10px] text-[var(--md-sys-color-on-surface-muted)]">
                                                                {item.requesterAvatar && (
                                                                    <img
                                                                        src={item.requesterAvatar}
                                                                        alt={item.requesterName || 'Pemohon'}
                                                                        className="w-3.5 h-3.5 rounded-full object-cover border border-[var(--md-sys-color-outline-variant)]"
                                                                    />
                                                                )}
                                                                <span className="truncate max-w-[160px]">
                                                                    Ajukan: {item.requesterName || 'HaloAPU'}
                                                                    {item.requesterUnit ? ` (${item.requesterUnit})` : ''}
                                                                </span>
                                                            </div>
                                                        )}
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
                                                    <div className="inline-flex items-center gap-1">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setActiveDetailId(item.id)}
                                                        >
                                                            Rincian
                                                        </Button>
                                                        {can?.editContent && (
                                                            <button
                                                                type="button"
                                                                title="Duplikasi rencana konten"
                                                                aria-label={`Duplikasi ${item.contentId}`}
                                                                onClick={(e) => handleQuickDuplicate(e, item.id)}
                                                                className="p-1.5 rounded-lg text-[var(--md-sys-color-on-surface-muted)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors cursor-pointer"
                                                            >
                                                                <Copy className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    )
                ) : (
                    <div className="space-y-2.5 min-w-0">
                        {/* Trello-style Stage Quick-Jump & Horizontal Scroll Bar (for mobile & smaller windows) */}
                        {boardOverflowing && (
                            <div className="flex items-center justify-between gap-2 bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] px-2.5 py-2 rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 flex-1 py-0.5">
                                    {WORKFLOW_ORDER.map((statusKey) => {
                                        const meta = WORKFLOW_STATUS_META[statusKey];
                                        const count = filteredItems.filter(
                                            (item) => normalizeWorkflowStatus(item.status) === statusKey
                                        ).length;
                                        return (
                                            <button
                                                key={statusKey}
                                                type="button"
                                                onClick={() => scrollToColumn(statusKey)}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-[var(--md-sys-color-surface-container-low)] hover:bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)]/80 text-[var(--md-sys-color-on-surface)] shrink-0 cursor-pointer transition-colors"
                                            >
                                                <span className="truncate max-w-[120px]">{meta.label}</span>
                                                <span
                                                    style={meta.styleVars}
                                                    className="sparc-code-id px-1.5 py-0.5 leading-none rounded-full border text-[10px] font-bold"
                                                >
                                                    {count}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="hidden sm:flex items-center gap-1 shrink-0 pl-1 border-l border-[var(--md-sys-color-outline-variant)]">
                                    <button
                                        type="button"
                                        onClick={() => scrollBoardBy(-300)}
                                        aria-label="Geser papan ke kiri"
                                        title="Geser ke kiri"
                                        className="p-1.5 rounded-lg text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] cursor-pointer transition-colors"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => scrollBoardBy(300)}
                                        aria-label="Geser papan ke kanan"
                                        title="Geser ke kanan"
                                        className="p-1.5 rounded-lg text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] cursor-pointer transition-colors"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}

                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCorners}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                        >
                            <div
                                ref={boardScrollRef}
                                className="sparc-kanban-scroll flex flex-nowrap gap-3.5 overflow-x-auto pb-4 items-start snap-x snap-proximity md:snap-none overscroll-x-contain"
                            >
                                {WORKFLOW_ORDER.map((statusKey) => {
                                    const meta = WORKFLOW_STATUS_META[statusKey];
                                    const StatusIcon = meta.icon;
                                    const colItems = filteredItems.filter(
                                        (item) => normalizeWorkflowStatus(item.status) === statusKey
                                    );
                                    return (
                                        <DroppableColumn
                                            key={statusKey}
                                            id={`content-col-${statusKey}`}
                                            className="w-[272px] sm:w-[288px] shrink-0 snap-start 2xl:w-auto 2xl:flex-1 2xl:min-w-[228px] bg-[var(--md-sys-color-surface-container-low)] dark:bg-[var(--md-sys-color-surface-container-lowest)]/85 p-3 rounded-2xl border border-[var(--md-sys-color-outline-variant)]/85 space-y-2.5"
                                        >
                                            <div className="flex items-center justify-between gap-2 px-1">
                                                <div className="inline-flex items-center gap-1.5 min-w-0">
                                                    <StatusIcon className="w-3.5 h-3.5 text-[var(--md-sys-color-on-surface-variant)] shrink-0" />
                                                    <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate">
                                                        {meta.label}
                                                    </span>
                                                </div>
                                                <span className="sparc-code-id text-[10px] font-semibold text-[var(--md-sys-color-on-surface-muted)]">
                                                    {colItems.length}
                                                </span>
                                            </div>
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
                            <DragOverlay dropAnimation={null}>
                                {activeDragItem ? renderKanbanCard(activeDragItem, true) : null}
                            </DragOverlay>
                        </DndContext>
                    </div>
                )}
            </div>

            {/* Shared Slide-Over Detail Sheet */}
            <ContentDetailSheet
                item={activeDetailItem}
                today={today}
                team={team}
                onClose={() => setActiveDetailId(null)}
            />

            {/* Create New Content Plan Modal */}
            <Modal
                isOpen={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
                title="Buat Rencana Konten Baru"
                description="Kode SPARC-2026-XXXX akan diterbitkan otomatis dan terhubung ke kalender produksi"
                maxWidth="lg"
            >
                <form onSubmit={handleCreateSubmit} className="space-y-4" noValidate>
                    <Input
                        label="Judul Konten"
                        required
                        placeholder="Contoh: Infografis Layanan Informasi Publik Terpadu Q4"
                        value={createForm.data.title}
                        onChange={(e) => createForm.setData('title', e.target.value)}
                        error={createForm.errors.title}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Select
                            label="Kanal Distribusi"
                            value={createForm.data.platform}
                            onChange={(e) =>
                                createForm.setData('platform', e.target.value as SocialPlatform)
                            }
                            error={createForm.errors.platform}
                        >
                            <option value="instagram">Instagram</option>
                            <option value="tiktok">TikTok</option>
                            <option value="youtube">YouTube</option>
                            <option value="website">Website Resmi</option>
                            <option value="whatsapp">WhatsApp Broadcast</option>
                            <option value="facebook">Facebook</option>
                        </Select>

                        <Select
                            label="Format Visual"
                            value={createForm.data.format}
                            onChange={(e) => createForm.setData('format', e.target.value)}
                        >
                            <option value="reels_shorts">Reels / Short Video</option>
                            <option value="carousel">Carousel Multi-Slide</option>
                            <option value="single_image">Single Feed / Poster</option>
                            <option value="video_long">Video Liputan / Dokumenter</option>
                            <option value="artikel">Artikel / Rilis Pers</option>
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
                            label="Tingkat Prioritas"
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
                            label="Tahap Awal"
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

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                        <Input
                            type="time"
                            label="Jam Tayang (WIB)"
                            value={createForm.data.publish_time}
                            onChange={(e) => createForm.setData('publish_time', e.target.value)}
                        />
                    </div>
                    {createForm.data.platform === 'instagram' && (props.instagramStatus?.bestPostingHours?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="text-[var(--md-sys-color-on-surface-muted)] font-semibold">
                                Rekomendasi Jam Tayang IG (WIB):
                            </span>
                            {props.instagramStatus?.bestPostingHours?.map((bh) => (
                                <button
                                    key={bh}
                                    type="button"
                                    onClick={() => createForm.setData('publish_time', bh.slice(0, 5))}
                                    className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300 font-bold hover:bg-purple-500/25 cursor-pointer"
                                >
                                    {bh}
                                </button>
                            ))}
                        </div>
                    )}

                    {activities.length > 0 && (
                        <Select
                            label="Tautkan ke Agenda / Momentum Lembaga (Opsional)"
                            value={createForm.data.activity_title}
                            onChange={(e) => createForm.setData('activity_title', e.target.value)}
                        >
                            <option value="">— Tidak ditautkan ke agenda spesifik —</option>
                            {activities.map((act) => (
                                <option key={act.id} value={act.title}>
                                    {act.activityDate} • {act.title}
                                </option>
                            ))}
                        </Select>
                    )}

                    <Textarea
                        label="Brief Kreatif & Pesan Utama"
                        rows={3}
                        placeholder="Tuliskan pesan kunci, target audiens, atau rujukan data..."
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
                            Simpan Rencana Konten
                        </Button>
                    </div>
                </form>
            </Modal>
        </AppLayout>
    );
}
