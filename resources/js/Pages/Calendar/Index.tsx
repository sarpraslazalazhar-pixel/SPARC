import React, { useMemo, useState } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    Calendar as CalendarIcon,
    CalendarRange,
    ChevronLeft,
    ChevronRight,
    Clock,
    ExternalLink,
    Flag,
    LayoutGrid,
    List,
    Plus,
    Send,
    Wrench,
} from 'lucide-react';
import { AppLayout, type SharedWorkspaceProps } from '@/Layouts/AppLayout';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
import { Modal } from '@/Components/UI/Modal';
import { Select } from '@/Components/UI/Select';
import {
    ContentIdBadge,
    normalizeWorkflowStatus,
    PlatformChip,
    PriorityBadge,
    StatusChip,
} from '@/Components/UI/Semantics';
import { Sheet } from '@/Components/UI/Sheet';
import { Textarea } from '@/Components/UI/Textarea';
import { useToast } from '@/Components/UI/Toast';
import { cn } from '@/lib/utils';
import type {
    InstitutionalActivity,
    SparcContentItem,
    SparcPublication,
} from '@/types/sparc';

interface LegacySessionCalendarEvent {
    id: string;
    day: number;
    time: string;
    title: string;
    platform: string;
    format: string;
    status: string;
    picName: string;
    caption?: string;
    publishedUrl?: string;
}

interface CalendarPageProps {
    today?: string;
    contentItems?: SparcContentItem[];
    activities?: InstitutionalActivity[];
    publications?: SparcPublication[];
    sessionEvents?: LegacySessionCalendarEvent[];
}

type CalendarLayer = 'activity' | 'production' | 'publish';

interface UnifiedCalendarEntry {
    uid: string;
    entityId: string;
    layer: CalendarLayer;
    date: string; // YYYY-MM-DD
    time?: string;
    title: string;
    contentId?: string;
    platform?: string;
    status?: string;
    priority?: string;
    picName?: string;
    activityType?: string;
    description?: string;
    publishedUrl?: string;
    isAtRisk: boolean;
    riskReason?: string;
    canReschedule: boolean;
}

const INDONESIAN_MONTHS = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
];

function pad2(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
}

export default function CalendarIndex({
    today = '2026-10-27',
    contentItems = [],
    activities = [],
    publications = [],
    sessionEvents = [],
}: CalendarPageProps) {
    const { props } = usePage<SharedWorkspaceProps>();
    const can = props.auth?.can;
    const { error: toastError } = useToast();

    const initialDate = useMemo(() => {
        const parts = today.split('-');
        if (parts.length === 3) {
            return {
                year: parseInt(parts[0], 10),
                month: parseInt(parts[1], 10),
            };
        }
        const now = new Date();
        return {
            year: now.getFullYear(),
            month: now.getMonth() + 1,
        };
    }, [today]);

    const [activeYear, setActiveYear] = useState(initialDate.year);
    const [activeMonthNum, setActiveMonthNum] = useState(initialDate.month);
    const [viewMode, setViewMode] = useState<'month' | 'week' | 'agenda'>('month');
    const [layerFilter, setLayerFilter] = useState<'all' | CalendarLayer | 'risk'>('all');
    const [platformFilter, setPlatformFilter] = useState('all');

    const [selectedEntry, setSelectedEntry] = useState<UnifiedCalendarEntry | null>(null);
    const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
    const [targetRescheduleDate, setTargetRescheduleDate] = useState(today);
    const [isRescheduling, setIsRescheduling] = useState(false);

    const [activityModalOpen, setActivityModalOpen] = useState(false);
    const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

    const activeMonth = useMemo(() => {
        const d = new Date(activeYear, activeMonthNum - 1, 1);
        const days = new Date(activeYear, activeMonthNum, 0).getDate();
        const leadingOffset = d.getDay(); // 0 is Minggu
        return {
            key: `${activeYear}-${pad2(activeMonthNum)}`,
            year: activeYear,
            month: activeMonthNum,
            label: `${INDONESIAN_MONTHS[activeMonthNum - 1]} ${activeYear}`,
            days,
            leadingOffset,
        };
    }, [activeYear, activeMonthNum]);

    const handlePrevMonth = () => {
        if (activeMonthNum === 1) {
            setActiveMonthNum(12);
            setActiveYear((y) => y - 1);
        } else {
            setActiveMonthNum((m) => m - 1);
        }
    };

    const handleNextMonth = () => {
        if (activeMonthNum === 12) {
            setActiveMonthNum(1);
            setActiveYear((y) => y + 1);
        } else {
            setActiveMonthNum((m) => m + 1);
        }
    };

    const handleResetToday = () => {
        setActiveYear(initialDate.year);
        setActiveMonthNum(initialDate.month);
    };

    const todayLabel = useMemo(() => {
        const parts = today.split('-');
        if (parts.length === 3) {
            const d = parseInt(parts[2], 10);
            const m = parseInt(parts[1], 10);
            return `${d} ${INDONESIAN_MONTHS[m - 1].slice(0, 3)}`;
        }
        return 'Hari Ini';
    }, [today]);

    // Build unified multi-layer operational calendar entries
    const allEntries = useMemo<UnifiedCalendarEntry[]>(() => {
        const list: UnifiedCalendarEntry[] = [];

        // Layer 1: Institutional Activities (`activities`)
        activities.forEach((act) => {
            list.push({
                uid: `act-${act.id}`,
                entityId: act.id,
                layer: 'activity',
                date: act.activityDate.slice(0, 10),
                time: '08:00',
                title: act.title,
                activityType: act.type,
                description: act.description,
                isAtRisk: false,
                canReschedule: true,
            });
        });

        // Layer 2 & 3: Production Deadlines & Publication Schedules from `contentItems`
        contentItems.forEach((item) => {
            const canonical = normalizeWorkflowStatus(item.status);
            const isPublished = canonical === 'published';
            const prodDate = item.productionDeadline?.slice(0, 10);
            const pubDate = item.publishDate?.slice(0, 10);
            const scheduleConflict = Boolean(prodDate && pubDate && prodDate > pubDate);

            if (prodDate) {
                const overdueProd = !isPublished && prodDate < today;
                list.push({
                    uid: `prod-${item.id}`,
                    entityId: item.id,
                    layer: 'production',
                    date: prodDate,
                    time: '16:00',
                    title: item.title,
                    contentId: item.contentId,
                    platform: item.platform,
                    status: canonical,
                    priority: item.priority,
                    picName: item.picName,
                    description: item.brief,
                    publishedUrl: item.publishedUrl,
                    isAtRisk: overdueProd || scheduleConflict,
                    riskReason: overdueProd
                        ? `Tenggat produksi terlewat (${prodDate}) sementara status masih ${canonical}.`
                        : scheduleConflict
                          ? 'Tenggat produksi melampaui tanggal rencana tayang.'
                          : undefined,
                    canReschedule: !isPublished,
                });
            }

            if (pubDate) {
                const overduePub = !isPublished && pubDate < today;
                const notReadyNearPub =
                    !isPublished &&
                    canonical !== 'ready_to_publish' &&
                    pubDate >= today &&
                    Date.parse(`${pubDate}T00:00:00`) - Date.parse(`${today}T00:00:00`) <= 86400000;

                list.push({
                    uid: `pub-${item.id}`,
                    entityId: item.id,
                    layer: 'publish',
                    date: pubDate,
                    time: item.publishTime || '10:00',
                    title: item.title,
                    contentId: item.contentId,
                    platform: item.platform,
                    status: canonical,
                    priority: item.priority,
                    picName: item.picName,
                    description: item.caption || item.brief,
                    publishedUrl: item.publishedUrl,
                    isAtRisk: overduePub || notReadyNearPub || scheduleConflict,
                    riskReason: overduePub
                        ? `Jadwal tayang (${pubDate}) terlewat dan konten belum dipublikasikan.`
                        : notReadyNearPub
                          ? 'Jadwal tayang H-1/Hari ini namun konten belum berstatus Siap Tayang.'
                          : scheduleConflict
                            ? 'Tanggal tayang lebih awal daripada tenggat produksi.'
                            : undefined,
                    canReschedule: !isPublished,
                });
            }
        });

        // Include standalone publication slots if not already represented on the same date
        publications.forEach((pub) => {
            const pubDate = pub.scheduledAt.slice(0, 10);
            const pubTime = pub.scheduledAt.slice(11, 16) || '10:00';
            const exists = list.some(
                (e) =>
                    e.layer === 'publish' &&
                    e.contentId === pub.contentId &&
                    e.date === pubDate &&
                    e.platform === pub.platform
            );
            if (!exists) {
                const isLive = Boolean(pub.publishedActualAt);
                list.push({
                    uid: `slot-${pub.id}`,
                    entityId: pub.contentItemId,
                    layer: 'publish',
                    date: pubDate,
                    time: pubTime,
                    title: pub.title,
                    contentId: pub.contentId,
                    platform: pub.platform,
                    status: isLive ? 'published' : 'ready_to_publish',
                    picName: pub.picName,
                    publishedUrl: pub.publishedUrl ?? undefined,
                    isAtRisk: !isLive && pubDate < today,
                    riskReason:
                        !isLive && pubDate < today
                            ? 'Slot publikasi kanal telah melewati jam jadwal tayang.'
                            : undefined,
                    canReschedule: false,
                });
            }
        });

        // Legacy quick-schedule events (`POST /calendar/events`) mapped into November 2026
        sessionEvents.forEach((ev) => {
            const safeDay = Math.max(1, Math.min(30, Number(ev.day) || 1));
            list.push({
                uid: `legacy-${ev.id}`,
                entityId: ev.id,
                layer: 'publish',
                date: `2026-11-${pad2(safeDay)}`,
                time: ev.time || '10:00',
                title: ev.title,
                platform: ev.platform,
                status: ev.status === 'published' ? 'published' : 'ready_to_publish',
                picName: ev.picName,
                description: ev.caption,
                publishedUrl: ev.publishedUrl,
                isAtRisk: false,
                canReschedule: false,
            });
        });

        return list.sort((a, b) =>
            a.date !== b.date ? a.date.localeCompare(b.date) : (a.time ?? '').localeCompare(b.time ?? '')
        );
    }, [activities, contentItems, publications, sessionEvents, today]);

    const filteredEntries = useMemo(() => {
        return allEntries.filter((entry) => {
            if (layerFilter === 'risk' && !entry.isAtRisk) {
                return false;
            }
            if (
                layerFilter !== 'all' &&
                layerFilter !== 'risk' &&
                entry.layer !== layerFilter
            ) {
                return false;
            }
            if (platformFilter !== 'all') {
                if (entry.layer === 'activity') {
                    return false;
                }
                if (entry.platform !== platformFilter) {
                    return false;
                }
            }
            return true;
        });
    }, [allEntries, layerFilter, platformFilter]);

    const monthEntries = useMemo(
        () => filteredEntries.filter((e) => e.date.startsWith(activeMonth.key)),
        [filteredEntries, activeMonth.key]
    );

    const riskCount = useMemo(
        () => allEntries.filter((e) => e.isAtRisk).length,
        [allEntries]
    );

    // Operational Week Dates (Oct 25 - Oct 31, 2026 when on October, else days 1-7 of active month)
    const weekDates = useMemo(() => {
        let anchor = new Date(`${activeMonth.key}-01T00:00:00`);
        if (today.startsWith(activeMonth.key)) {
            anchor = new Date(`${today}T00:00:00`);
        }
        const dayOfWeek = anchor.getDay();
        const sunday = new Date(anchor);
        sunday.setDate(anchor.getDate() - dayOfWeek);

        const days = [];
        const weekdays = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
        for (let i = 0; i < 7; i++) {
            const current = new Date(sunday);
            current.setDate(sunday.getDate() + i);
            const y = current.getFullYear();
            const m = pad2(current.getMonth() + 1);
            const d = pad2(current.getDate());
            days.push({
                day: current.getDate(),
                dateStr: `${y}-${m}-${d}`,
                weekday: weekdays[i],
            });
        }
        return days;
    }, [activeMonth, today]);

    // Forms
    const activityForm = useForm({
        title: '',
        activity_date: today,
        type: 'agenda' as 'agenda' | 'event' | 'hari_besar' | 'kampanye' | 'momentum',
        description: '',
    });

    const scheduleForm = useForm({
        title: '',
        platform: 'instagram',
        format: 'reels',
        day: 8,
        time: '10:00',
        caption: '',
    });

    const handleCreateActivity = (e: React.FormEvent) => {
        e.preventDefault();
        activityForm.post('/calendar/activities', {
            preserveScroll: true,
            onSuccess: () => {
                setActivityModalOpen(false);
                activityForm.reset();
            },
            onError: () => {
                toastError('Validasi Agenda Gagal', 'Nama dan tanggal kegiatan lembaga wajib diisi.');
            },
        });
    };

    const handleCreateSchedule = (e: React.FormEvent) => {
        e.preventDefault();
        scheduleForm.post('/calendar/events', {
            preserveScroll: true,
            onSuccess: () => {
                setScheduleModalOpen(false);
                scheduleForm.reset();
                handleResetToday();
            },
            onError: () => {
                toastError('Validasi Jadwal Gagal', 'Periksa kembali judul dan jam tayang.');
            },
        });
    };

    const openRescheduleDialog = (entry: UnifiedCalendarEntry) => {
        setTargetRescheduleDate(entry.date);
        setRescheduleModalOpen(true);
    };

    const handleConfirmReschedule = () => {
        if (!selectedEntry) {
            return;
        }
        setIsRescheduling(true);
        router.patch(
            '/calendar/reschedule',
            {
                entity_type: selectedEntry.layer,
                entity_id: selectedEntry.entityId,
                date: targetRescheduleDate,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setIsRescheduling(false);
                    setRescheduleModalOpen(false);
                    setSelectedEntry(null);
                },
                onError: (errors) => {
                    setIsRescheduling(false);
                    toastError(
                        'Penjadwalan Ulang Ditolak',
                        errors.date || 'Peran Anda tidak diizinkan mengubah jadwal operasional.'
                    );
                },
            }
        );
    };

    const renderEntryPill = (entry: UnifiedCalendarEntry) => {
        if (entry.isAtRisk) {
            return (
                <button
                    type="button"
                    key={entry.uid}
                    onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEntry(entry);
                    }}
                    className="w-full text-left px-2 py-1 rounded-lg border border-[var(--md-sys-color-error)]/40 bg-[var(--md-sys-color-error-container)]/75 text-[var(--md-sys-color-on-error-container)] text-[11px] font-semibold flex items-center gap-1.5 truncate hover:brightness-95 transition cursor-pointer"
                >
                    <AlertTriangle className="w-3 h-3 shrink-0 text-[var(--md-sys-color-error)]" />
                    <span className="truncate">{entry.title}</span>
                </button>
            );
        }

        if (entry.layer === 'activity') {
            return (
                <button
                    type="button"
                    key={entry.uid}
                    onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEntry(entry);
                    }}
                    className="w-full text-left px-2 py-1 rounded-lg border-l-3 border border-[var(--md-sys-color-tertiary)]/35 border-l-[var(--md-sys-color-tertiary)] bg-[var(--md-sys-color-tertiary-container)]/55 text-[var(--md-sys-color-on-tertiary-container)] text-[11px] font-semibold flex items-center gap-1.5 truncate hover:brightness-95 transition cursor-pointer"
                >
                    <Flag className="w-3 h-3 shrink-0" />
                    <span className="truncate">{entry.title}</span>
                </button>
            );
        }

        if (entry.layer === 'production') {
            return (
                <button
                    type="button"
                    key={entry.uid}
                    onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEntry(entry);
                    }}
                    className="w-full text-left px-2 py-1 rounded-lg border border-dashed border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] text-[11px] font-medium flex items-center gap-1.5 truncate hover:border-[var(--md-sys-color-primary)] transition cursor-pointer"
                >
                    <Wrench className="w-3 h-3 shrink-0 text-[var(--md-sys-color-on-surface-muted)]" />
                    <span className="truncate">{entry.title}</span>
                </button>
            );
        }

        return (
            <button
                type="button"
                key={entry.uid}
                onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEntry(entry);
                }}
                className="w-full text-left px-2 py-1 rounded-lg border border-[var(--md-sys-color-primary)]/30 bg-[var(--md-sys-color-primary-container)]/55 text-[var(--md-sys-color-on-primary-container)] text-[11px] font-semibold flex items-center gap-1.5 truncate hover:brightness-95 transition cursor-pointer"
            >
                <Send className="w-3 h-3 shrink-0 text-[var(--md-sys-color-primary)]" />
                <span className="sparc-code-id text-[10px] opacity-80 shrink-0">{entry.time}</span>
                <span className="truncate">{entry.title}</span>
            </button>
        );
    };

    const layerPills: Array<{
        id: 'all' | CalendarLayer | 'risk';
        label: string;
        icon?: React.ComponentType<{ className?: string }>;
        badge?: number;
    }> = [
        { id: 'all', label: 'Semua Layer' },
        { id: 'activity', label: 'Kegiatan Lembaga', icon: Flag },
        { id: 'production', label: 'Tenggat Produksi', icon: Wrench },
        { id: 'publish', label: 'Jadwal Publikasi', icon: Send },
        { id: 'risk', label: 'Risiko / Terlambat', icon: AlertTriangle, badge: riskCount },
    ];

    return (
        <AppLayout
            title="Operational Calendar"
            subtitle="Kalender 4-lapis HUMAS — agenda kelembagaan, tenggat produksi, jadwal tayang, dan risiko"
            headerCenter={
                <div
                    role="group"
                    aria-label="Mode tampilan kalender"
                    className="bg-[var(--md-sys-color-surface-container)] p-1 rounded-xl inline-flex items-center border border-[var(--md-sys-color-outline-variant)] shadow-2xs"
                >
                    {(
                        [
                            { id: 'month', label: 'Bulan', icon: LayoutGrid },
                            { id: 'week', label: 'Minggu', icon: CalendarRange },
                            { id: 'agenda', label: 'Agenda', icon: List },
                        ] as const
                    ).map((m) => {
                        const Icon = m.icon;
                        const active = viewMode === m.id;
                        return (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => setViewMode(m.id)}
                                className={cn(
                                    'px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer',
                                    active
                                        ? 'bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] font-bold shadow-2xs'
                                        : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                                )}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                <span>{m.label}</span>
                            </button>
                        );
                    })}
                </div>
            }
            actions={
                <div className="flex items-center gap-2 shrink-0">
                    {can?.manageActivities && (
                        <Button
                            variant="outline"
                            size="sm"
                            icon={<Flag className="w-3.5 h-3.5" />}
                            onClick={() => {
                                activityForm.clearErrors();
                                setActivityModalOpen(true);
                            }}
                        >
                            Agenda Lembaga
                        </Button>
                    )}

                    {can?.editContent && (
                        <Button
                            variant="primary"
                            size="sm"
                            icon={<Plus className="w-3.5 h-3.5" />}
                            onClick={() => {
                                scheduleForm.clearErrors();
                                setScheduleModalOpen(true);
                            }}
                        >
                            Jadwal Konten
                        </Button>
                    )}
                </div>
            }
        >
            <Head title="Operational Calendar - SPARC" />

            <div className="space-y-4">
                {/* Period Navigation + Layer Semantics Legend/Filter */}
                <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-3.5 rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                aria-label="Bulan sebelumnya"
                                onClick={handlePrevMonth}
                                className="p-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] cursor-pointer transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="font-bold text-sm text-[var(--md-sys-color-on-surface)] px-2 min-w-[9rem] text-center select-none">
                                {activeMonth.label}
                            </span>
                            <button
                                type="button"
                                aria-label="Bulan berikutnya"
                                onClick={handleNextMonth}
                                className="p-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] cursor-pointer transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>

                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleResetToday}
                            >
                                Hari Ini ({todayLabel})
                            </Button>
                        </div>

                        <div className="flex items-center gap-2.5">
                            <span className="text-xs text-[var(--md-sys-color-on-surface-muted)] hidden md:inline">
                                <strong className="sparc-code-id text-[var(--md-sys-color-on-surface)]">
                                    {monthEntries.length}
                                </strong>{' '}
                                jadwal aktif
                            </span>
                            <select
                                aria-label="Filter kanal pada kalender"
                                value={platformFilter}
                                onChange={(e) => setPlatformFilter(e.target.value)}
                                className="h-8 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-lg px-2.5 text-[var(--md-sys-color-on-surface)] font-medium cursor-pointer"
                            >
                                <option value="all">Kanal: Semua</option>
                                <option value="instagram">Instagram</option>
                                <option value="tiktok">TikTok</option>
                                <option value="youtube">YouTube</option>
                                <option value="website">Website</option>
                                <option value="whatsapp">WhatsApp</option>
                                <option value="facebook">Facebook</option>
                            </select>
                        </div>
                    </div>

                    {/* Non-color-only Layer Filter Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[var(--md-sys-color-outline-variant)]/60">
                        {layerPills.map((pill) => {
                            const Icon = pill.icon;
                            const active = layerFilter === pill.id;
                            return (
                                <button
                                    key={pill.id}
                                    type="button"
                                    onClick={() => setLayerFilter(pill.id)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
                                        active
                                            ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border-[var(--md-sys-color-primary)]/40'
                                            : 'bg-[var(--md-sys-color-surface-container-low)] text-[var(--md-sys-color-on-surface-variant)] border-[var(--md-sys-color-outline-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                                    }`}
                                >
                                    {Icon && <Icon className="w-3 h-3 shrink-0" />}
                                    <span>{pill.label}</span>
                                    {typeof pill.badge === 'number' && pill.badge > 0 && (
                                        <span className="sparc-code-id px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]">
                                            {pill.badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* VIEW 1: MONTH GRID */}
                {viewMode === 'month' && (
                    <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] overflow-hidden">
                        <div className="overflow-x-auto">
                            <div className="min-w-[740px]">
                                <div className="grid grid-cols-7 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] text-center py-2.5 text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">
                                    <span>Min</span>
                                    <span>Sen</span>
                                    <span>Sel</span>
                                    <span>Rab</span>
                                    <span>Kam</span>
                                    <span>Jum</span>
                                    <span>Sab</span>
                                </div>

                                <div className="grid grid-cols-7 divide-x divide-y divide-[var(--md-sys-color-outline-variant)]/60 text-xs">
                                    {Array.from({ length: activeMonth.leadingOffset }, (_, idx) => (
                                        <div
                                            key={`blank-${idx}`}
                                            className="p-2 min-h-[120px] bg-[var(--md-sys-color-surface-container-low)]/35"
                                        />
                                    ))}

                                    {Array.from({ length: activeMonth.days }, (_, idx) => {
                                        const day = idx + 1;
                                        const dateStr = `${activeMonth.key}-${pad2(day)}`;
                                        const dayItems = monthEntries.filter((e) => e.date === dateStr);
                                        const isToday = dateStr === today;

                                        return (
                                            <div
                                                key={dateStr}
                                                className={`p-2 min-h-[120px] flex flex-col justify-between transition-colors ${
                                                    isToday
                                                        ? 'bg-[var(--md-sys-color-primary-container)]/20'
                                                        : 'hover:bg-[var(--md-sys-color-surface-container-low)]/60'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span
                                                        className={`sparc-code-id w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                                            isToday
                                                                ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
                                                                : 'text-[var(--md-sys-color-on-surface)]'
                                                        }`}
                                                    >
                                                        {day}
                                                    </span>
                                                    {dayItems.length > 0 && (
                                                        <span className="sparc-code-id text-[10px] font-semibold text-[var(--md-sys-color-on-surface-muted)]">
                                                            {dayItems.length} item
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="space-y-1 mt-1.5 flex-1">
                                                    {dayItems.slice(0, 3).map((entry) =>
                                                        renderEntryPill(entry)
                                                    )}
                                                    {dayItems.length > 3 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setViewMode('agenda')}
                                                            className="text-[10px] font-bold text-[var(--md-sys-color-primary)] hover:underline px-1 cursor-pointer"
                                                        >
                                                            +{dayItems.length - 3} lainnya
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* VIEW 2: RESPONSIVE WEEK BOARD */}
                {viewMode === 'week' && (
                    <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                        {weekDates.map((wd) => {
                            const dayItems = monthEntries.filter((e) => e.date === wd.dateStr);
                            const isToday = wd.dateStr === today;

                            return (
                                <div
                                    key={wd.dateStr}
                                    className={`rounded-2xl border p-3 space-y-2.5 min-h-[240px] ${
                                        isToday
                                            ? 'bg-[var(--md-sys-color-primary-container)]/20 border-[var(--md-sys-color-primary)]/50'
                                            : 'bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border-[var(--md-sys-color-outline-variant)]'
                                    }`}
                                >
                                    <div className="flex items-center justify-between pb-2 border-b border-[var(--md-sys-color-outline-variant)]/70">
                                        <div>
                                            <span className="sparc-eyebrow block">{wd.weekday}</span>
                                            <span className="sparc-code-id text-base font-black text-[var(--md-sys-color-on-surface)]">
                                                {wd.day}
                                            </span>
                                        </div>
                                        {isToday && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]">
                                                Hari Ini
                                            </span>
                                        )}
                                    </div>

                                    {dayItems.length === 0 ? (
                                        <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] pt-2">
                                            Kosong
                                        </p>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {dayItems.map((entry) => renderEntryPill(entry))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* VIEW 3: EDITORIAL AGENDA LIST */}
                {viewMode === 'agenda' && (
                    <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] divide-y divide-[var(--md-sys-color-outline-variant)]/60 overflow-hidden">
                        {monthEntries.length === 0 ? (
                            <div className="p-12 text-center space-y-2">
                                <CalendarIcon className="w-8 h-8 text-[var(--md-sys-color-on-surface-muted)] mx-auto" />
                                <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                    Belum ada jadwal pada bulan {activeMonth.label}
                                </p>
                                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                    Ubah filter layer atau navigasikan ke bulan lainnya.
                                </p>
                            </div>
                        ) : (
                            monthEntries.map((entry) => (
                                <div
                                    key={entry.uid}
                                    onClick={() => setSelectedEntry(entry)}
                                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 notion-row cursor-pointer"
                                >
                                    <div className="flex items-start gap-3.5 min-w-0">
                                        <div className="sparc-code-id w-14 py-1.5 rounded-xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] text-center shrink-0">
                                            <span className="text-[10px] font-bold uppercase text-[var(--md-sys-color-on-surface-muted)] block">
                                                {activeMonth.label.slice(0, 3)}
                                            </span>
                                            <span className="text-sm font-black text-[var(--md-sys-color-on-surface)]">
                                                {entry.date.slice(8, 10)}
                                            </span>
                                        </div>

                                        <div className="space-y-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {entry.layer === 'activity' && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]">
                                                        <Flag className="w-3 h-3" /> Kegiatan Lembaga
                                                    </span>
                                                )}
                                                {entry.layer === 'production' && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)]">
                                                        <Wrench className="w-3 h-3" /> Tenggat Produksi
                                                    </span>
                                                )}
                                                {entry.layer === 'publish' && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]">
                                                        <Send className="w-3 h-3" /> Jadwal Publikasi ({entry.time} WIB)
                                                    </span>
                                                )}
                                                {entry.contentId && (
                                                    <ContentIdBadge contentId={entry.contentId} />
                                                )}
                                                {entry.platform && (
                                                    <PlatformChip platform={entry.platform} compact />
                                                )}
                                                {entry.isAtRisk && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]">
                                                        <AlertTriangle className="w-3 h-3" /> Berisiko
                                                    </span>
                                                )}
                                            </div>

                                            <h4 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] truncate">
                                                {entry.title}
                                            </h4>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {entry.status && <StatusChip status={entry.status} compact />}
                                        {entry.picName && (
                                            <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                                {entry.picName}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Event Detail Slide-Over Sheet */}
            <Sheet
                isOpen={Boolean(selectedEntry)}
                onClose={() => setSelectedEntry(null)}
                title={selectedEntry?.title || 'Detail Jadwal'}
                description={
                    selectedEntry
                        ? `Tanggal: ${selectedEntry.date}${selectedEntry.time ? ` • ${selectedEntry.time} WIB` : ''}`
                        : ''
                }
                width="md"
            >
                {selectedEntry && (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b border-[var(--md-sys-color-outline-variant)]">
                            {selectedEntry.contentId && (
                                <ContentIdBadge contentId={selectedEntry.contentId} />
                            )}
                            {selectedEntry.status && <StatusChip status={selectedEntry.status} />}
                            {selectedEntry.priority && (
                                <PriorityBadge priority={selectedEntry.priority} />
                            )}
                            {selectedEntry.platform && (
                                <PlatformChip platform={selectedEntry.platform} />
                            )}
                        </div>

                        {selectedEntry.isAtRisk && selectedEntry.riskReason && (
                            <div className="p-3.5 rounded-xl bg-[var(--md-sys-color-error-container)]/75 border border-[var(--md-sys-color-error)]/40 flex items-start gap-2.5 text-xs text-[var(--md-sys-color-on-error-container)]">
                                <AlertTriangle className="w-4 h-4 text-[var(--md-sys-color-error)] shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold">Peringatan Jadwal Operasional</p>
                                    <p className="mt-0.5">{selectedEntry.riskReason}</p>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]">
                                <span className="sparc-eyebrow flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Tanggal & Jam
                                </span>
                                <p className="sparc-code-id font-bold text-[var(--md-sys-color-on-surface)] mt-1">
                                    {selectedEntry.date} {selectedEntry.time ? `(${selectedEntry.time})` : ''}
                                </p>
                            </div>
                            <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]">
                                <span className="sparc-eyebrow block">Jenis Layer</span>
                                <p className="font-bold text-[var(--md-sys-color-on-surface)] mt-1">
                                    {selectedEntry.layer === 'activity'
                                        ? 'Kegiatan Lembaga'
                                        : selectedEntry.layer === 'production'
                                          ? 'Tenggat Produksi'
                                          : 'Jadwal Publikasi'}
                                </p>
                            </div>
                        </div>

                        {selectedEntry.description && (
                            <div className="p-3.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] leading-relaxed">
                                {selectedEntry.description}
                            </div>
                        )}

                        {selectedEntry.publishedUrl && (
                            <a
                                href={selectedEntry.publishedUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--md-sys-color-primary)] hover:underline"
                            >
                                Buka Bukti Publikasi <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                        )}

                        <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-between gap-2">
                            {selectedEntry.canReschedule && can?.editContent ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    icon={<CalendarRange className="w-3.5 h-3.5" />}
                                    onClick={() => openRescheduleDialog(selectedEntry)}
                                >
                                    Jadwal Ulang...
                                </Button>
                            ) : (
                                <span />
                            )}
                            <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                onClick={() => setSelectedEntry(null)}
                            >
                                Tutup
                            </Button>
                        </div>
                    </div>
                )}
            </Sheet>

            {/* Reschedule Confirmation Modal */}
            <Modal
                isOpen={rescheduleModalOpen}
                onClose={() => setRescheduleModalOpen(false)}
                title="Konfirmasi Penjadwalan Ulang"
                description={
                    selectedEntry
                        ? `Pindahkan tanggal "${selectedEntry.title}" dan perbarui kalender tim.`
                        : ''
                }
                maxWidth="sm"
            >
                <div className="space-y-4">
                    <Input
                        type="date"
                        label="Tanggal Baru"
                        value={targetRescheduleDate}
                        onChange={(e) => setTargetRescheduleDate(e.target.value)}
                    />
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={isRescheduling}
                            onClick={() => setRescheduleModalOpen(false)}
                        >
                            Batal
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            isLoading={isRescheduling}
                            onClick={handleConfirmReschedule}
                        >
                            Konfirmasi Jadwal Baru
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Add Institutional Activity Modal (`POST /calendar/activities`) */}
            <Modal
                isOpen={activityModalOpen}
                onClose={() => setActivityModalOpen(false)}
                title="Tambah Agenda / Kegiatan Lembaga"
                description="Tandai momentum penting lembaga sebagai acuan perencanaan konten HUMAS"
                maxWidth="md"
            >
                <form onSubmit={handleCreateActivity} className="space-y-4" noValidate>
                    <Input
                        label="Nama Kegiatan / Momentum"
                        required
                        placeholder="Contoh: Rapat Koordinasi Nasional Keterbukaan Informasi"
                        value={activityForm.data.title}
                        onChange={(e) => activityForm.setData('title', e.target.value)}
                        error={activityForm.errors.title}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Input
                            type="date"
                            label="Tanggal Pelaksanaan"
                            required
                            value={activityForm.data.activity_date}
                            onChange={(e) => activityForm.setData('activity_date', e.target.value)}
                            error={activityForm.errors.activity_date}
                        />
                        <Select
                            label="Kategori Agenda"
                            value={activityForm.data.type}
                            onChange={(e) =>
                                activityForm.setData(
                                    'type',
                                    e.target.value as typeof activityForm.data.type
                                )
                            }
                        >
                            <option value="agenda">Agenda Resmi</option>
                            <option value="event">Event Publik</option>
                            <option value="hari_besar">Hari Besar Nasional</option>
                            <option value="kampanye">Kampanye Tematik</option>
                            <option value="momentum">Momentum Khusus</option>
                        </Select>
                    </div>
                    <Textarea
                        label="Catatan Liputan / Kebutuhan Konten"
                        rows={3}
                        placeholder="Kebutuhan dokumentasi foto, siaran pers, atau reels liputan..."
                        value={activityForm.data.description}
                        onChange={(e) => activityForm.setData('description', e.target.value)}
                    />
                    <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            disabled={activityForm.processing}
                            onClick={() => setActivityModalOpen(false)}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            isLoading={activityForm.processing}
                        >
                            Simpan Agenda
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Quick Schedule Post Modal (`POST /calendar/events`) */}
            <Modal
                isOpen={scheduleModalOpen}
                onClose={() => setScheduleModalOpen(false)}
                title="Jadwalkan Slot Publikasi Cepat"
                description="Tambahkan jadwal tayang cepat pada kalender distribusi"
                maxWidth="md"
            >
                <form onSubmit={handleCreateSchedule} className="space-y-4" noValidate>
                    <Input
                        label="Judul Konten"
                        required
                        placeholder="Contoh: Pengumuman Layanan Terpadu Akhir Pekan"
                        value={scheduleForm.data.title}
                        onChange={(e) => scheduleForm.setData('title', e.target.value)}
                        error={scheduleForm.errors.title}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Select
                            label="Platform"
                            value={scheduleForm.data.platform}
                            onChange={(e) => scheduleForm.setData('platform', e.target.value)}
                        >
                            <option value="instagram">Instagram</option>
                            <option value="youtube">YouTube</option>
                            <option value="tiktok">TikTok</option>
                            <option value="facebook">Facebook</option>
                        </Select>
                        <Select
                            label="Format"
                            value={scheduleForm.data.format}
                            onChange={(e) => scheduleForm.setData('format', e.target.value)}
                        >
                            <option value="reels">Reels / Shorts</option>
                            <option value="carousel">Carousel</option>
                            <option value="single">Single Image</option>
                            <option value="video">Video Panjang</option>
                        </Select>
                        <Input
                            type="time"
                            label="Jam Tayang (WIB)"
                            required
                            value={scheduleForm.data.time}
                            onChange={(e) => scheduleForm.setData('time', e.target.value)}
                            error={scheduleForm.errors.time}
                        />
                    </div>
                    <Input
                        type="number"
                        min={1}
                        max={30}
                        label="Tanggal (November 2026)"
                        required
                        value={scheduleForm.data.day}
                        onChange={(e) => scheduleForm.setData('day', Number(e.target.value))}
                        error={scheduleForm.errors.day}
                    />
                    <Textarea
                        label="Catatan / Draft Caption"
                        rows={2}
                        value={scheduleForm.data.caption}
                        onChange={(e) => scheduleForm.setData('caption', e.target.value)}
                    />
                    <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            disabled={scheduleForm.processing}
                            onClick={() => setScheduleModalOpen(false)}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            isLoading={scheduleForm.processing}
                        >
                            Simpan Jadwal
                        </Button>
                    </div>
                </form>
            </Modal>
        </AppLayout>
    );
}
