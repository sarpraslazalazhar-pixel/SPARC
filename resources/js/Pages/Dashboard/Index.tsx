import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { AnimatePresence, motion } from 'framer-motion';
import {
    AlertTriangle,
    ArrowUpRight,
    Building2,
    Calendar as CalendarIcon,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Clock,
    FileText,
    Globe,
    Inbox,
    MessageCircle,
    Palette,
    Plus,
    RefreshCw,
    Search,
    Send,
    SlidersHorizontal,
    Sparkles,
    Video,
    X,
} from 'lucide-react';
import { InstagramIcon, TikTokIcon, YoutubeIcon } from '@/Components/Icons';
import { AppLayout, type SharedWorkspaceProps } from '@/Layouts/AppLayout';
import { ContentDetailSheet } from '@/Components/ContentDetailSheet';
import { Badge } from '@/Components/UI/Badge';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
import { Modal } from '@/Components/UI/Modal';
import { Select } from '@/Components/UI/Select';
import {
    ContentIdBadge,
    DeadlineBadge,
    PillarTag,
    PlatformChip,
    PriorityBadge,
    StatusChip,
    type SocialPlatform,
} from '@/Components/UI/Semantics';
import { Sheet } from '@/Components/UI/Sheet';
import { Textarea } from '@/Components/UI/Textarea';
import { useToast } from '@/Components/UI/Toast';
import { runChunkedInstagramSync, runQuickNewPostCheck } from '@/lib/instagramSync';
import { staggerContainerVariants, staggerItemVariants } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type {
    DashboardIncomingTicket,
    DashboardTrendPoint,
    InstitutionalActivity,
    ProductionTaskItem,
    SparcContentItem,
    SparcPublication,
    SparcSystemSettings,
    SparcTeamMember,
} from '@/types/sparc';

interface DashboardStatsPayload {
    statusCounts: Record<string, number>;
    channels: Record<string, { posts: number; reach: number }>;
    overdueCount: number;
    monthlyPublishedCount: number;
    totalItems: number;
}

interface DashboardPageProps {
    today?: string;
    contentItems?: SparcContentItem[];
    activities?: InstitutionalActivity[];
    publications?: SparcPublication[];
    team?: SparcTeamMember[];
    settings?: SparcSystemSettings;
    incomingTickets?: DashboardIncomingTicket[];
    performanceTrend?: DashboardTrendPoint[];
    dashboardStats?: DashboardStatsPayload;
}
type DashboardPeriod = 'today' | 'week' | 'month';
type TaskTimeTab = 'today' | 'upcoming';
type TaskScopeFilter = 'team_ongoing' | 'mine' | 'completed';
type OverviewBarMode = 'pipeline' | 'channels' | 'workload';
type RightQueueMode = 'tickets' | 'approvals';

interface FlattenedDashboardTask {
    id: string;
    title: string;
    taskType: ProductionTaskItem['taskType'];
    status: ProductionTaskItem['status'];
    assignedTo: string;
    dueDate: string;
    parentItem: SparcContentItem;
}

const PASTEL_STYLES = [
    'panze-pastel-peach',
    'panze-pastel-blue',
    'panze-pastel-pink',
    'panze-pastel-mint',
] as const;

const BAR_GRADIENTS = [
    'bg-gradient-to-r from-[#7C3AED] to-[#9333EA]',
    'bg-gradient-to-r from-[#EF4444] to-[#F87171]',
    'bg-gradient-to-r from-[#0EA5E9] to-[#38BDF8]',
    'bg-gradient-to-r from-[#059669] to-[#10B981]',
    'bg-gradient-to-r from-[#F59E0B] to-[#FBBF24]',
] as const;

const PLATFORM_LABELS: Record<string, string> = {
    all: 'Semua Kanal',
    instagram: 'Instagram',
    youtube: 'YouTube',
    tiktok: 'TikTok',
    website: 'Website',
    whatsapp: 'WhatsApp',
    facebook: 'Facebook',
    x: 'X (Twitter)',
};

function addDaysIso(isoDate: string, days: number): string {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y || 2026, (m || 10) - 1, (d || 27) + days));
    return dt.toISOString().slice(0, 10);
}

function formatShortIndoDate(isoDate: string): string {
    if (!isoDate) {
        return '—';
    }
    const clean = isoDate.slice(0, 10);
    const [, m, d] = clean.split('-').map(Number);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    if (!m || !d) {
        return isoDate;
    }
    return `${d} ${months[(m - 1) % 12]}`;
}

function buildSmoothSvgPath(points: Array<{ x: number; y: number }>): string {
    if (points.length === 0) {
        return '';
    }
    if (points.length === 1) {
        return `M ${points[0].x} ${points[0].y}`;
    }

    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i += 1) {
        const p0 = points[i === 0 ? i : i - 1];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
}

function renderTaskLeadingBadge(platform: SocialPlatform, taskType: ProductionTaskItem['taskType']) {
    if (platform === 'instagram') {
        return (
            <span className="w-7 h-7 rounded-xl bg-gradient-to-br from-orange-500 via-pink-500 to-purple-600 text-white flex items-center justify-center shadow-2xs">
                <InstagramIcon className="w-3.5 h-3.5" />
            </span>
        );
    }
    if (platform === 'tiktok') {
        return (
            <span className="w-7 h-7 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center shadow-2xs">
                <TikTokIcon className="w-3.5 h-3.5" />
            </span>
        );
    }
    if (platform === 'youtube' || taskType === 'video') {
        return (
            <span className="w-7 h-7 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-2xs">
                {platform === 'youtube' ? <YoutubeIcon className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
            </span>
        );
    }
    if (platform === 'website') {
        return (
            <span className="w-7 h-7 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center shadow-2xs">
                <Globe className="w-3.5 h-3.5" />
            </span>
        );
    }
    if (platform === 'whatsapp') {
        return (
            <span className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-2xs">
                <MessageCircle className="w-3.5 h-3.5" />
            </span>
        );
    }
    if (taskType === 'design') {
        return (
            <span className="w-7 h-7 rounded-xl bg-pink-600 text-white flex items-center justify-center shadow-2xs">
                <Palette className="w-3.5 h-3.5" />
            </span>
        );
    }
    return (
        <span className="w-7 h-7 rounded-xl bg-[#1546D8] text-white flex items-center justify-center shadow-2xs">
            <Sparkles className="w-3.5 h-3.5" />
        </span>
    );
}

export default function DashboardIndex({
    today = '2026-10-27',
    contentItems = [],
    activities = [],
    publications = [],
    team = [],
    settings,
    incomingTickets = [],
    performanceTrend = [],
    dashboardStats,
}: DashboardPageProps) {
    const { props } = usePage<SharedWorkspaceProps>();
    const currentUser = props.auth?.user;
    const can = props.auth?.can;
    const { success: toastSuccess, error: toastError } = useToast();

    // Topbar Period Capsule State
    const [period, setPeriod] = useState<DashboardPeriod>('month');

    // Cross-Module Search Spotlight State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);
    const searchContainerRef = useRef<HTMLDivElement | null>(null);

    // Left Column ("Tugas Produksi") States
    const [taskTab, setTaskTab] = useState<TaskTimeTab>('today');
    const [taskScope, setTaskScope] = useState<TaskScopeFilter>('team_ongoing');
    const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);
    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const [quickAddMode, setQuickAddMode] = useState<'task' | 'content'>('task');

    // Center Column Chart & Progress Bar States
    const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
    const [trendPlatform, setTrendPlatform] = useState<string>('all');
    const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null);
    const [overviewMode, setOverviewMode] = useState<OverviewBarMode>('pipeline');

    // Right Column ("Tiket HALO APU" / "Antrean Approval") States
    const [rightQueueMode, setRightQueueMode] = useState<RightQueueMode>('tickets');

    // Inspection Drawers & Quick Actions
    const [selectedItem, setSelectedItem] = useState<SparcContentItem | null>(null);
    const activeSelectedItem = useMemo(
        () => (selectedItem ? contentItems.find((i) => i.id === selectedItem.id) ?? selectedItem : null),
        [selectedItem, contentItems]
    );
    const [approvingId, setApprovingId] = useState<string | null>(null);
    const [selectedTicket, setSelectedTicket] = useState<DashboardIncomingTicket | null>(null);
    const [isSyncingIgDash, setIsSyncingIgDash] = useState(false);
    const [igSyncProgress, setIgSyncProgress] = useState(0);

    const igDash = settings?.instagram ?? props.instagramStatus;
    const unrepliedIgCount = props.workspaceBadges?.unrepliedComments ?? 0;

    useEffect(() => {
        if (!(can?.editContent || can?.managePublishing)) {
            return;
        }
        let cancelled = false;
        void runQuickNewPostCheck().then((res) => {
            if (!cancelled && res.importedCount > 0) {
                toastSuccess(
                    'Konten Instagram Baru Disinkronkan',
                    `${res.importedCount.toLocaleString('id-ID')} postingan baru otomatis ditambahkan ke Dashboard.`
                );
                router.reload({
                    only: ['contentItems', 'publications', 'performanceTrend', 'dashboardStats'],
                });
            }
        });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSyncIgFromDashboard = async () => {
        setIsSyncingIgDash(true);
        setIgSyncProgress(0);
        const res = await runChunkedInstagramSync({
            mode: 'smart',
            includeProfile: true,
            onProgress: (p) => setIgSyncProgress(p.fetchedCount),
        });
        setIsSyncingIgDash(false);
        if (!res.success) {
            toastError('Sinkronisasi IG Gagal', res.error || 'Gagal menyinkronkan data Instagram.');

            return;
        }
        toastSuccess(
            'Instagram Disinkronkan',
            `${res.syncedCount.toLocaleString('id-ID')} postingan diperbarui (${res.importedCount.toLocaleString('id-ID')} postingan baru diimpor).`
        );
        router.reload();
    };
    useEffect(() => {
        const handleOutside = (e: MouseEvent) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
                setSearchFocused(false);
            }
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSearchFocused(false);
            }
        };
        document.addEventListener('mousedown', handleOutside);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleOutside);
            document.removeEventListener('keydown', handleKey);
        };
    }, []);

    // Quick-Add Subtask Form (`POST /tasks`)
    const taskForm = useForm({
        content_item_id: contentItems[0]?.id ?? 'ci-1',
        title: '',
        task_type: 'design' as ProductionTaskItem['taskType'],
        assigned_to: currentUser?.name ?? 'Dimas Pratama',
        due_date: today,
    });

    // Quick-Add Content Item Form (`POST /planner/items`)
    const contentForm = useForm({
        title: '',
        platform: 'instagram' as 'instagram' | 'youtube' | 'tiktok' | 'facebook' | 'x',
        format: 'reels_shorts',
        pillar: 'edukasi',
        publish_date: addDaysIso(today, 3),
        caption: '',
        status: 'todo',
        redirect_to: 'stay',
    });


    const weekEndIso = useMemo(() => addDaysIso(today, 7), [today]);

    // Period-filtered Content Items for Donut & Pipeline Overview
    const scopedContentItems = useMemo(() => {
        if (period === 'month') {
            return contentItems;
        }
        if (period === 'today') {
            return contentItems.filter(
                (item) =>
                    item.productionDeadline <= addDaysIso(today, 1) ||
                    item.publishDate === today ||
                    item.status === 'review_approval' ||
                    item.status === 'in_progress'
            );
        }
        return contentItems.filter(
            (item) =>
                (item.productionDeadline >= addDaysIso(today, -3) &&
                    item.productionDeadline <= weekEndIso) ||
                (item.publishDate >= today && item.publishDate <= weekEndIso) ||
                item.status !== 'published'
        );
    }, [contentItems, period, today, weekEndIso]);

    // Flatten all production subtasks with parent content item reference
    const allTasks = useMemo<FlattenedDashboardTask[]>(() => {
        const list: FlattenedDashboardTask[] = [];
        for (const item of contentItems) {
            for (const t of item.tasks || []) {
                list.push({
                    id: t.id,
                    title: t.title,
                    taskType: t.taskType,
                    status: t.status,
                    assignedTo: t.assignedTo,
                    dueDate: t.dueDate,
                    parentItem: item,
                });
            }
        }
        return list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    }, [contentItems]);

    const ongoingTeamTaskCount = useMemo(
        () => allTasks.filter((t) => t.status !== 'done').length,
        [allTasks]
    );

    const visibleTasks = useMemo(() => {
        return allTasks.filter((t) => {
            if (taskScope === 'completed') {
                return t.status === 'done';
            }
            if (t.status === 'done') {
                return false;
            }
            if (taskScope === 'mine' && currentUser) {
                const firstName = currentUser.name.split(' ')[0].toLowerCase();
                if (!t.assignedTo.toLowerCase().includes(firstName)) {
                    return false;
                }
            }
            if (taskTab === 'today') {
                return t.dueDate <= today;
            }
            return t.dueDate > today;
        });
    }, [allTasks, taskScope, taskTab, currentUser, today]);

    // Donut Chart ("Ringkasan Konten") Metrics — uses full-DB aggregates on `month` view so 120+ posts never truncate
    const donutStats = useMemo(() => {
        if (period === 'month' && dashboardStats) {
            const sc = dashboardStats.statusCounts;
            const inProgress =
                (sc.in_progress ?? 0) + (sc.review_approval ?? 0) + (sc.ready_to_publish ?? 0);
            const completed = sc.published ?? 0;
            const planning = (sc.inbox ?? 0) + (sc.briefing ?? 0);
            const total = Math.max(1, inProgress + completed + planning);

            return {
                inProgress,
                completed,
                planning,
                rawTotal: inProgress + completed + planning,
                total,
            };
        }

        let inProgress = 0;
        let completed = 0;
        let planning = 0;

        for (const item of scopedContentItems) {
            if (item.status === 'published') {
                completed += 1;
            } else if (
                item.status === 'in_progress' ||
                item.status === 'review_approval' ||
                item.status === 'ready_to_publish'
            ) {
                inProgress += 1;
            } else {
                planning += 1;
            }
        }

        const total = Math.max(1, inProgress + completed + planning);
        return {
            inProgress,
            completed,
            planning,
            rawTotal: inProgress + completed + planning,
            total,
        };
    }, [period, dashboardStats, scopedContentItems]);
    // Dual Spline Area Chart ("Reach vs Interaksi") Series
    const chartSeries = useMemo(() => {
        const base = performanceTrend;

        const factor = period === 'today' ? 0.14 : period === 'week' ? 0.42 : 1;

        return base.map((pt) => {
            if (trendPlatform !== 'all' && pt.byPlatform?.[trendPlatform]) {
                return {
                    label: pt.label,
                    fullLabel: pt.fullLabel,
                    reach: Math.round(pt.byPlatform[trendPlatform].reach * factor),
                    interactions: Math.round(pt.byPlatform[trendPlatform].interactions * factor),
                };
            }
            return {
                label: pt.label,
                fullLabel: pt.fullLabel,
                reach: Math.round(pt.reach * factor),
                interactions: Math.round(pt.interactions * factor),
            };
        });
    }, [performanceTrend, trendPlatform, period]);

    // Overdue & Approval Queues
    const overdueItems = useMemo(
        () =>
            scopedContentItems.filter(
                (item) =>
                    item.status !== 'published' &&
                    Boolean(item.productionDeadline) &&
                    item.productionDeadline < today
            ),
        [scopedContentItems, today]
    );

    const pendingApprovals = useMemo(
        () => contentItems.filter((item) => item.status === 'review_approval'),
        [contentItems]
    );

    // Center-Bottom 5 Horizontal Progress Bars Data
    const monthlyTarget = settings?.monthlyContentTarget ?? 24;

    const pipelineMetrics = useMemo(() => {
        if (period === 'month' && dashboardStats) {
            const sc = dashboardStats.statusCounts;
            return {
                review: sc.review_approval ?? 0,
                inProd: sc.in_progress ?? 0,
                ready: sc.ready_to_publish ?? 0,
                pub: dashboardStats.monthlyPublishedCount ?? (sc.published ?? 0),
                draft: (sc.inbox ?? 0) + (sc.briefing ?? 0),
                instagramCount: dashboardStats.channels?.instagram?.posts ?? 0,
                overdueCount: dashboardStats.overdueCount ?? overdueItems.length,
                totalCount: dashboardStats.totalItems ?? scopedContentItems.length,
            };
        }
        const review = scopedContentItems.filter((i) => i.status === 'review_approval').length;
        const inProd = scopedContentItems.filter((i) => i.status === 'in_progress').length;
        const ready = scopedContentItems.filter((i) => i.status === 'ready_to_publish').length;
        const pub = scopedContentItems.filter((i) => i.status === 'published').length;
        const draft = scopedContentItems.filter(
            (i) => i.status === 'inbox' || i.status === 'briefing'
        ).length;
        const instagramCount = scopedContentItems.filter((i) => i.platform === 'instagram').length;
        return {
            review,
            inProd,
            ready,
            pub,
            draft,
            instagramCount,
            overdueCount: overdueItems.length,
            totalCount: scopedContentItems.length,
        };
    }, [period, dashboardStats, scopedContentItems, overdueItems.length]);

    const channelOverviewMeta = useMemo(() => {
        const source =
            period === 'month' && dashboardStats?.channels
                ? dashboardStats.channels
                : null;
        const channelMap: Record<string, { posts: number; reach: number }> = {
            instagram: source?.instagram ? { ...source.instagram } : { posts: 0, reach: 0 },
            youtube: source?.youtube ? { ...source.youtube } : { posts: 0, reach: 0 },
            tiktok: source?.tiktok ? { ...source.tiktok } : { posts: 0, reach: 0 },
            website: source?.website ? { ...source.website } : { posts: 0, reach: 0 },
            whatsapp: source?.whatsapp ? { ...source.whatsapp } : { posts: 0, reach: 0 },
        };

        if (!source) {
            for (const item of scopedContentItems) {
                if (!channelMap[item.platform]) {
                    channelMap[item.platform] = { posts: 0, reach: 0 };
                }
                channelMap[item.platform].posts += 1;
            }
            for (const pub of publications) {
                if (!channelMap[pub.platform]) {
                    channelMap[pub.platform] = { posts: 0, reach: 0 };
                }
                channelMap[pub.platform].reach += pub.metrics?.reach ?? 0;
            }
        }

        const activeChannelsCount = Object.values(channelMap).filter((v) => v.posts > 0).length;
        const topEntry = Object.entries(channelMap).sort((a, b) => b[1].posts - a[1].posts)[0];

        return { channelMap, activeChannelsCount, topEntry };
    }, [period, dashboardStats, scopedContentItems, publications]);

    const overviewBars = useMemo(() => {
        if (overviewMode === 'channels') {
            const entries = Object.entries(channelOverviewMeta.channelMap).slice(0, 5);
            const maxPosts = Math.max(1, ...entries.map(([, v]) => v.posts));

            return entries.map(([platformKey, val], idx) => ({
                id: platformKey,
                label: PLATFORM_LABELS[platformKey] ?? platformKey,
                countText: `${val.posts.toLocaleString('id-ID')} konten`,
                metaText:
                    val.reach > 0
                        ? `${val.reach.toLocaleString('id-ID')} Reach`
                        : 'Menunggu metrik tayang',
                pct: val.posts > 0 ? Math.max(12, Math.round((val.posts / maxPosts) * 100)) : 4,
                colorClass: BAR_GRADIENTS[idx % BAR_GRADIENTS.length],
                href: platformKey === 'instagram' ? '/instagram/library' : '/report',
            }));
        }

        if (overviewMode === 'workload') {
            const activeMembers = team.filter((m) => m.primaryRole !== 'viewer').slice(0, 5);
            return activeMembers.map((member, idx) => {
                const pct = Math.min(
                    100,
                    Math.max(10, Math.round((member.effortHours / Math.max(1, member.capacityHours)) * 100))
                );
                return {
                    id: member.id,
                    label: `${member.name}`,
                    countText: `${member.activeTasks} tugas`,
                    metaText: `${member.effortHours}/${member.capacityHours} jam (${pct}%)`,
                    pct,
                    colorClass: BAR_GRADIENTS[idx % BAR_GRADIENTS.length],
                    href: '/team',
                };
            });
        }

        const { review: reviewCount, inProd: inProdCount, ready: readyCount, pub: pubCount, draft: draftCount, overdueCount, totalCount } = pipelineMetrics;
        const denom = Math.max(4, totalCount);
        const pubTargetPct = Math.min(100, Math.round((pubCount / Math.max(1, monthlyTarget)) * 100));

        return [
            {
                id: 'overdue',
                label: 'Tenggat Terlewat (Overdue)',
                countText: `${overdueCount}`,
                metaText: overdueCount > 0 ? 'Perlu Percepatan' : 'Tenggat Aman',
                pct: overdueCount > 0 ? Math.max(22, Math.round((overdueCount / denom) * 100)) : 8,
                colorClass: BAR_GRADIENTS[0],
                href: '/content?status=all',
            },
            {
                id: 'approval',
                label: 'Menunggu Approval Pimpinan',
                countText: `${reviewCount}`,
                metaText: `${readyCount} Siap Tayang`,
                pct: reviewCount > 0 ? Math.max(24, Math.round((reviewCount / denom) * 100)) : 10,
                colorClass: BAR_GRADIENTS[1],
                href: '/content?view=kanban',
            },
            {
                id: 'in_progress',
                label: 'Dalam Produksi Kreatif',
                countText: `${inProdCount}`,
                metaText: `${ongoingTeamTaskCount} Sub-Tugas Aktif`,
                pct: inProdCount > 0 ? Math.max(28, Math.round((inProdCount / denom) * 100)) : 12,
                colorClass: BAR_GRADIENTS[2],
                href: '/content?view=kanban',
            },
            {
                id: 'published',
                label: 'Sudah Tayang (Realisasi Bulanan)',
                countText: `${pubCount}/${monthlyTarget}`,
                metaText: `${pubTargetPct}% Target HUMAS`,
                pct: Math.max(18, pubTargetPct),
                colorClass: BAR_GRADIENTS[3],
                href: '/publishing',
            },
            {
                id: 'draft',
                label: 'Inbox & Penyusunan Brief',
                countText: `${draftCount}`,
                metaText: 'Tahap Perencanaan',
                pct: draftCount > 0 ? Math.max(18, Math.round((draftCount / denom) * 100)) : 10,
                colorClass: BAR_GRADIENTS[4],
                href: '/content?status=briefing',
            },
        ];
    }, [overviewMode, channelOverviewMeta, pipelineMetrics, team, ongoingTeamTaskCount, monthlyTarget]);

    // Right-Top ("Agenda & Jadwal Tayang") Combined Upcoming Schedule
    const scheduleCards = useMemo(() => {
        const pubEntries = publications
            .filter((p) => !p.publishedActualAt)
            .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
            .map((p) => {
                const [datePart, timePart] = p.scheduledAt.split(' ');
                return {
                    id: `pub-${p.id}`,
                    eyebrow: 'Jadwal Tayang',
                    title: p.title,
                    timeBadge: `${timePart || '09:00'} WIB`,
                    subBadge: PLATFORM_LABELS[p.platform] ?? p.platform,
                    platform: p.platform as string,
                    sortKey: p.scheduledAt,
                    href: '/publishing',
                };
            });

        const actEntries = activities
            .filter((a) => a.activityDate >= today)
            .sort((a, b) => a.activityDate.localeCompare(b.activityDate))
            .map((a) => ({
                id: `act-${a.id}`,
                eyebrow: a.type === 'hari_besar' ? 'Momentum Nasional' : 'Agenda Lembaga',
                title: a.title,
                timeBadge: formatShortIndoDate(a.activityDate),
                subBadge: `${a.linkedCount ?? 1} Konten`,
                platform: 'agenda',
                sortKey: `${a.activityDate} 08:00`,
                href: '/calendar',
            }));

        return [...pubEntries, ...actEntries]
            .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
            .slice(0, 3);
    }, [publications, activities, today]);

    // Right-Bottom ("Tiket HALO APU" pending tickets)
    const openHaloTickets = useMemo(
        () => incomingTickets.filter((t) => t.syncStatus === 'pending'),
        [incomingTickets]
    );

    // Cross-Module Spotlight Search Results
    const searchResults = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) {
            return null;
        }

        const matchedContent = contentItems
            .filter(
                (c) =>
                    c.title.toLowerCase().includes(q) ||
                    c.contentId.toLowerCase().includes(q) ||
                    c.picName.toLowerCase().includes(q) ||
                    c.platform.toLowerCase().includes(q)
            )
            .slice(0, 4);

        const matchedTasks = allTasks
            .filter(
                (t) =>
                    t.title.toLowerCase().includes(q) ||
                    t.assignedTo.toLowerCase().includes(q)
            )
            .slice(0, 3);

        const matchedActivities = activities
            .filter((a) => a.title.toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q))
            .slice(0, 2);

        const matchedTickets = incomingTickets
            .filter(
                (t) =>
                    t.title.toLowerCase().includes(q) ||
                    t.haloapuTicketId.toLowerCase().includes(q) ||
                    t.requesterName.toLowerCase().includes(q)
            )
            .slice(0, 3);

        const total =
            matchedContent.length +
            matchedTasks.length +
            matchedActivities.length +
            matchedTickets.length;

        return {
            total,
            matchedContent,
            matchedTasks,
            matchedActivities,
            matchedTickets,
        };
    }, [searchQuery, contentItems, allTasks, activities, incomingTickets]);

    // Handlers
    const handleToggleTaskStatus = (e: React.MouseEvent, task: FlattenedDashboardTask) => {
        e.stopPropagation();
        if (!can?.updateTasks) {
            toastError('Akses Dibatasi', 'Peran Anda tidak memiliki izin memperbarui sub-tugas produksi.');
            return;
        }
        const nextStatus = task.status === 'done' ? 'in_progress' : 'done';
        setTogglingTaskId(task.id);
        router.patch(
            `/tasks/${task.id}/status`,
            {
                content_item_id: task.parentItem.id,
                status: nextStatus,
            },
            {
                preserveScroll: true,
                onFinish: () => setTogglingTaskId(null),
            }
        );
    };

    const handleQuickApprove = (item: SparcContentItem) => {
        setApprovingId(item.id);
        router.patch(
            `/content/${item.id}/status`,
            { status: 'ready_to_publish' },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setSelectedItem((prev) =>
                        prev && prev.id === item.id ? { ...prev, status: 'ready_to_publish' } : prev
                    );
                },
                onFinish: () => setApprovingId(null),
                onError: (errors) => {
                    toastError(
                        'Persetujuan Ditolak',
                        errors.status || 'Anda tidak memiliki wewenang menyetujui konten ini.'
                    );
                },
            }
        );
    };

    const handleSubmitTask = (e: React.FormEvent) => {
        e.preventDefault();
        taskForm.post('/tasks', {
            preserveScroll: true,
            onSuccess: () => {
                setQuickAddOpen(false);
                taskForm.reset('title');
            },
        });
    };

    const handleSubmitContent = (e: React.FormEvent) => {
        e.preventDefault();
        contentForm.post('/planner/items', {
            preserveScroll: true,
            onSuccess: () => {
                setQuickAddOpen(false);
                contentForm.reset('title', 'caption');
            },
        });
    };


    // SVG Donut Ring Geometry
    const ringRadius = 60;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const donutSegments = useMemo(() => {
        const rawItems = [
            {
                key: 'in_progress',
                label: 'Dalam Produksi',
                count: donutStats.inProgress,
                color: '#F97316',
            },
            {
                key: 'completed',
                label: 'Sudah Tayang',
                count: donutStats.completed,
                color: '#0EA5E9',
            },
            {
                key: 'planning',
                label: 'Perencanaan',
                count: donutStats.planning,
                color: 'var(--md-sys-color-surface-container-highest)',
            },
        ];

        let cumulativeFraction = 0;
        const gapPx = donutStats.rawTotal > 1 ? 5 : 0;

        return rawItems.map((seg) => {
            const fraction = donutStats.rawTotal > 0 ? seg.count / donutStats.total : seg.key === 'planning' ? 1 : 0;
            const rawLen = fraction * ringCircumference;
            const dashLen = rawLen > gapPx ? rawLen - gapPx : rawLen;
            const dashOffset = -cumulativeFraction * ringCircumference;
            cumulativeFraction += fraction;

            return {
                ...seg,
                dashArray: `${Math.max(0, dashLen).toFixed(1)} ${ringCircumference.toFixed(1)}`,
                dashOffset: dashOffset.toFixed(1),
            };
        });
    }, [donutStats, ringCircumference]);

    // SVG Dual Spline Chart Geometry
    const svgW = 320;
    const svgH = 165;
    const padLeft = 10;
    const padRight = 10;
    const padTop = 26;
    const padBottom = 26;
    const plotW = svgW - padLeft - padRight;
    const plotH = svgH - padTop - padBottom;

    const maxReachVal = Math.max(1, ...chartSeries.map((c) => c.reach));
    const maxInterVal = Math.max(1, ...chartSeries.map((c) => c.interactions));

    const reachCoords = chartSeries.map((pt, i) => {
        const x = padLeft + (i / Math.max(1, chartSeries.length - 1)) * plotW;
        // Reach sits in upper-middle band (panze upper blue curve)
        const norm = maxReachVal > 0 ? pt.reach / (maxReachVal * 1.15) : 0;
        const y = padTop + plotH * (0.62 - norm * 0.54);
        return { x, y };
    });

    const interCoords = chartSeries.map((pt, i) => {
        const x = padLeft + (i / Math.max(1, chartSeries.length - 1)) * plotW;
        // Interactions sits in lower harmonious band (panze lower orange curve)
        const norm = maxInterVal > 0 ? pt.interactions / (maxInterVal * 1.15) : 0;
        const y = padTop + plotH * (0.96 - norm * 0.32);
        return { x, y };
    });

    const reachLinePath = buildSmoothSvgPath(reachCoords);
    const interLinePath = buildSmoothSvgPath(interCoords);

    const baselineY = padTop + plotH;
    const reachAreaPath =
        reachCoords.length > 1
            ? `${reachLinePath} L ${reachCoords[reachCoords.length - 1].x.toFixed(1)} ${baselineY} L ${reachCoords[0].x.toFixed(1)} ${baselineY} Z`
            : '';
    const interAreaPath =
        interCoords.length > 1
            ? `${interLinePath} L ${interCoords[interCoords.length - 1].x.toFixed(1)} ${baselineY} L ${interCoords[0].x.toFixed(1)} ${baselineY} Z`
            : '';

    const activeTrendIndex =
        hoveredTrendIdx !== null
            ? hoveredTrendIdx
            : Math.max(0, Math.min(chartSeries.length - 1, 3));
    const activePoint = chartSeries[activeTrendIndex] ?? chartSeries[0];
    const activeReachXY = reachCoords[activeTrendIndex] ?? { x: 160, y: 60 };
    const activeInterXY = interCoords[activeTrendIndex] ?? { x: 160, y: 120 };

    // Topbar Center Capsule Bar (Portaled into AppLayout Topbar)
    const periodCapsuleBar = (
        <div
            role="tablist"
            aria-label="Filter Periode Dashboard"
            className="inline-flex items-center gap-1.5"
        >
            {(
                [
                    { id: 'today', label: 'Hari Ini' },
                    { id: 'week', label: 'Minggu Ini' },
                    { id: 'month', label: 'Bulan Ini' },
                ] as Array<{ id: DashboardPeriod; label: string }>
            ).map((tab) => {
                const active = period === tab.id;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setPeriod(tab.id)}
                        className={cn(
                            'px-4 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]',
                            active
                                ? 'panze-pill-active shadow-xs'
                                : 'bg-[var(--md-sys-color-surface)] border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-low)]'
                        )}
                    >
                        {tab.label}
                    </button>
                );
            })}
            <Link
                href="/report"
                className="px-4 py-1.5 rounded-full text-xs font-semibold border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]"
            >
                Laporan
            </Link>
        </div>
    );

    const activeDonutMeta = donutSegments.find((s) => s.key === hoveredSegment);

    return (
        <AppLayout
            title="Dashboard HUMAS"
            hideTopbarTitle
            headerCenter={periodCapsuleBar}
        >
            <Head title="Dashboard HUMAS — SPARC v3" />

            <motion.div
                variants={staggerContainerVariants}
                initial="hidden"
                animate="show"
                className="space-y-6"
            >
                {/* =================================================================
                    HERO HEADER ROW: Eyebrow + Bold Title & Pill Spotlight Search
                   ================================================================= */}
                <motion.section
                    variants={staggerItemVariants}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                    <div>
                        <p className="text-xs sm:text-[13px] font-medium text-[var(--md-sys-color-on-surface-muted)]">
                            Kelola dan pantau alur kerja konten terpadu
                        </p>
                        <h1 className="text-2xl sm:text-[30px] font-extrabold text-[var(--md-sys-color-on-surface)] tracking-tight leading-tight mt-0.5">
                            Dashboard HUMAS
                        </h1>
                    </div>

                    {/* Global Cross-Module Search Capsule */}
                    <div ref={searchContainerRef} className="relative w-full md:w-[390px] lg:w-[440px]">
                        <div className="relative flex items-center">
                            <Search className="w-4 h-4 text-[var(--md-sys-color-on-surface-muted)] absolute left-4 pointer-events-none" />
                            <input
                                type="search"
                                value={searchQuery}
                                onFocus={() => setSearchFocused(true)}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setSearchFocused(true);
                                }}
                                placeholder="Cari konten, tugas, agenda, atau tiket HALO APU..."
                                aria-label="Cari lintas modul di Dashboard HUMAS"
                                className="w-full h-12 pl-11 pr-10 rounded-full bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] text-xs sm:text-[13px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-muted)] shadow-2xs outline-none focus:border-[var(--md-sys-color-primary)] focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/20 transition-all"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    aria-label="Bersihkan kata kunci"
                                    className="absolute right-3.5 p-1 rounded-full text-[var(--md-sys-color-on-surface-muted)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)] cursor-pointer"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Instant Cross-Module Results Dropdown */}
                        <AnimatePresence>
                            {searchFocused && searchResults && (
                                <motion.div
                                    initial={{ opacity: 0, y: 6, scale: 0.99 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 4, scale: 0.99 }}
                                    transition={{ duration: 0.14 }}
                                    className="absolute right-0 left-0 mt-2 z-40 rounded-3xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-3)] p-3 max-h-[420px] overflow-y-auto space-y-3"
                                >
                                    {searchResults.total === 0 ? (
                                        <div className="py-6 text-center text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                            Tidak ditemukan konten, tugas, agenda, atau tiket untuk "{searchQuery}".
                                        </div>
                                    ) : (
                                        <>
                                            {searchResults.matchedContent.length > 0 && (
                                                <div className="space-y-1">
                                                    <div className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-muted)]">
                                                        Item Konten ({searchResults.matchedContent.length})
                                                    </div>
                                                    {searchResults.matchedContent.map((item) => (
                                                        <button
                                                            key={item.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedItem(item);
                                                                setSearchFocused(false);
                                                            }}
                                                            className="w-full text-left px-2.5 py-2 rounded-2xl hover:bg-[var(--md-sys-color-surface-container)] flex items-center justify-between gap-2 cursor-pointer transition-colors"
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-1.5">
                                                                    <ContentIdBadge contentId={item.contentId} />
                                                                    <StatusChip status={item.status} compact />
                                                                </div>
                                                                <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] truncate mt-0.5">
                                                                    {item.title}
                                                                </p>
                                                            </div>
                                                            <ArrowUpRight className="w-3.5 h-3.5 text-[var(--md-sys-color-on-surface-muted)] shrink-0" />
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            {searchResults.matchedTasks.length > 0 && (
                                                <div className="space-y-1">
                                                    <div className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-muted)]">
                                                        Sub-Tugas Produksi ({searchResults.matchedTasks.length})
                                                    </div>
                                                    {searchResults.matchedTasks.map((t) => (
                                                        <button
                                                            key={t.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedItem(t.parentItem);
                                                                setSearchFocused(false);
                                                            }}
                                                            className="w-full text-left px-2.5 py-2 rounded-2xl hover:bg-[var(--md-sys-color-surface-container)] flex items-center justify-between gap-2 cursor-pointer transition-colors"
                                                        >
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] truncate">
                                                                    {t.title}
                                                                </p>
                                                                <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] truncate">
                                                                    PIC: {t.assignedTo} • {t.parentItem.contentId}
                                                                </p>
                                                            </div>
                                                            <ChevronRight className="w-3.5 h-3.5 text-[var(--md-sys-color-on-surface-muted)] shrink-0" />
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            {searchResults.matchedTickets.length > 0 && (
                                                <div className="space-y-1">
                                                    <div className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-muted)]">
                                                        Tiket HALO APU ({searchResults.matchedTickets.length})
                                                    </div>
                                                    {searchResults.matchedTickets.map((t) => (
                                                        <button
                                                            key={t.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedTicket(t);
                                                                setSearchFocused(false);
                                                            }}
                                                            className="w-full text-left px-2.5 py-2 rounded-2xl hover:bg-[var(--md-sys-color-surface-container)] flex items-center justify-between gap-2 cursor-pointer transition-colors"
                                                        >
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] truncate">
                                                                    #{t.haloapuTicketId} — {t.title}
                                                                </p>
                                                                <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] truncate">
                                                                    {t.requesterName}
                                                                </p>
                                                            </div>
                                                            <ChevronRight className="w-3.5 h-3.5 text-[var(--md-sys-color-on-surface-muted)] shrink-0" />
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            {searchResults.matchedActivities.length > 0 && (
                                                <div className="space-y-1">
                                                    <div className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-muted)]">
                                                        Agenda Lembaga ({searchResults.matchedActivities.length})
                                                    </div>
                                                    {searchResults.matchedActivities.map((act) => (
                                                        <Link
                                                            key={act.id}
                                                            href="/calendar"
                                                            onClick={() => setSearchFocused(false)}
                                                            className="px-2.5 py-2 rounded-2xl hover:bg-[var(--md-sys-color-surface-container)] flex items-center justify-between gap-2 transition-colors"
                                                        >
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] truncate">
                                                                    {act.title}
                                                                </p>
                                                                <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                                                    {formatShortIndoDate(act.activityDate)}
                                                                </p>
                                                            </div>
                                                            <ArrowUpRight className="w-3.5 h-3.5 text-[var(--md-sys-color-on-surface-muted)] shrink-0" />
                                                        </Link>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.section>

                {/* =================================================================
                    INSTAGRAM BUSINESS LIVE INSIGHTS & BEST POSTING HOURS STRIP
                   ================================================================= */}
                {!igDash?.connected ? (
                    <motion.section
                        variants={staggerItemVariants}
                        className="panze-bento-card px-5 py-3.5 border border-amber-500/30 bg-amber-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <span className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                <InstagramIcon className="w-4 h-4" />
                            </span>
                            <div className="min-w-0 text-xs">
                                <strong className="font-bold text-[var(--md-sys-color-on-surface)] block">
                                    Instagram Graph API Belum Terhubung
                                </strong>
                                <span className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                    Hubungkan akun Instagram Bisnis agar postingan, analitik, komentar, dan visual grid tersinkron otomatis ke Dashboard &amp; Laporan.
                                </span>
                            </div>
                        </div>
                        {can?.manageSettings && (
                            <Link
                                href="/settings"
                                className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] whitespace-nowrap self-start sm:self-center"
                            >
                                Hubungkan Instagram
                            </Link>
                        )}
                    </motion.section>
                ) : (
                    <motion.section
                        variants={staggerItemVariants}
                        className="panze-bento-card px-5 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                    >
                        <div className="flex flex-wrap items-center gap-3 min-w-0">
                            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 via-pink-500 to-purple-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                                <InstagramIcon className="w-4 h-4" />
                            </span>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <strong className="font-extrabold text-[var(--md-sys-color-on-surface)]">
                                        @{igDash.username || 'instansi'}
                                    </strong>
                                    {igDash.followersCount !== null && igDash.followersCount !== undefined && (
                                        <span className="sparc-code-id text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)]">
                                            • {igDash.followersCount.toLocaleString('id-ID')} pengikut
                                        </span>
                                    )}
                                    {igDash.accountInsights?.reach_28d !== undefined &&
                                        igDash.accountInsights.reach_28d !== null && (
                                            <span className="sparc-code-id text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                                • Reach 28h: {igDash.accountInsights.reach_28d.toLocaleString('id-ID')}
                                            </span>
                                        )}
                                </div>
                                {(igDash.bestPostingHours?.length ?? 0) > 0 && (
                                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px]">
                                        <span className="text-[var(--md-sys-color-on-surface-muted)]">
                                            Jam Tayang Terbaik:
                                        </span>
                                        {igDash.bestPostingHours?.map((bh) => (
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

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <Link
                                href="/instagram/library"
                                className="px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] hover:bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] transition-colors"
                            >
                                Konten IG
                            </Link>
                            <Link
                                href="/report"
                                className="px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] hover:bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] transition-colors"
                            >
                                Report
                            </Link>
                            <Link
                                href="/instagram/comments"
                                className="px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] hover:bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] inline-flex items-center gap-1.5 transition-colors"
                            >
                                <MessageCircle className="w-3.5 h-3.5 text-purple-600" />
                                Komentar IG
                                {unrepliedIgCount > 0 && (
                                    <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-extrabold">
                                        {unrepliedIgCount}
                                    </span>
                                )}
                            </Link>
                            <Link
                                href="/grid"
                                className="px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] hover:bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] transition-colors"
                            >
                                Visual Grid 3x3
                            </Link>
                            {(can?.managePublishing || can?.editContent || can?.manageSettings) && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    isLoading={isSyncingIgDash}
                                    icon={<RefreshCw className={`w-3.5 h-3.5 ${isSyncingIgDash ? 'animate-spin' : ''}`} />}
                                    onClick={handleSyncIgFromDashboard}
                                >
                                    {isSyncingIgDash && igSyncProgress > 0 ? `Sync (${igSyncProgress})...` : 'Sync IG'}
                                </Button>
                            )}
                        </div>
                    </motion.section>
                )}

                {/* =================================================================
                    3-COLUMN ASYMMETRIC BENTO GRID (3 - 6 - 3)
                   ================================================================= */}
                <motion.section
                    variants={staggerItemVariants}
                    className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch"
                >
                    {/* -------------------------------------------------------------
                        LEFT COLUMN (3 Cols): TUGAS PRODUKSI (Pastel Stack)
                       ------------------------------------------------------------- */}
                    <div className="@container xl:col-span-3 panze-bento-card p-5 flex flex-col justify-between">
                        <div className="flex-1 flex flex-col min-h-0">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <h2 className="text-[15px] font-bold text-[var(--md-sys-color-on-surface)]">
                                        Tugas Produksi
                                    </h2>
                                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                        {taskScope === 'team_ongoing'
                                            ? `${ongoingTeamTaskCount} sub-tugas aktif`
                                            : taskScope === 'mine'
                                              ? 'Tugas ditugaskan ke saya'
                                              : 'Sub-tugas telah selesai'}
                                    </p>
                                </div>
                                {(can?.updateTasks || can?.editContent) && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setQuickAddMode(can?.updateTasks ? 'task' : 'content');
                                            setQuickAddOpen(true);
                                        }}
                                        aria-label="Tambah tugas atau konten baru"
                                        title="Tambah Sub-Tugas / Konten"
                                        className="panze-icon-btn cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            {/* Unified Filter Row: Segmented Time Pills + Scope Dropdown */}
                            <div className="flex items-center justify-between gap-2 mt-3.5 @max-xs:flex-col @max-xs:items-stretch">
                                <div className="flex items-center gap-1 p-1 rounded-full bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] @max-xs:w-full">
                                    <button
                                        type="button"
                                        onClick={() => setTaskTab('today')}
                                        className={cn(
                                            'px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer @max-xs:flex-1 @max-xs:py-1.5',
                                            taskTab === 'today'
                                                ? 'panze-pill-active shadow-2xs'
                                                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                                        )}
                                    >
                                        Hari Ini
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTaskTab('upcoming')}
                                        className={cn(
                                            'px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer @max-xs:flex-1 @max-xs:py-1.5',
                                            taskTab === 'upcoming'
                                                ? 'panze-pill-active shadow-2xs'
                                                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                                        )}
                                    >
                                        Mendatang
                                    </button>
                                </div>

                                <DropdownMenu.Root>
                                    <DropdownMenu.Trigger asChild>
                                        <button
                                            type="button"
                                            aria-label="Filter cakupan tugas"
                                            title="Filter Penugasan"
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] dark:bg-[var(--md-sys-color-surface-container-low)] hover:bg-[var(--md-sys-color-surface-container)] text-xs font-semibold text-[var(--md-sys-color-on-surface)] transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] shrink-0 @max-xs:w-full @max-xs:px-3 @max-xs:py-1.5"
                                        >
                                            <span className="sparc-code-id w-4 h-4 rounded-full bg-[#0F172A] dark:bg-slate-100 text-white dark:text-slate-900 text-[10px] font-bold flex items-center justify-center">
                                                {visibleTasks.length}
                                            </span>
                                            <span className="truncate max-w-[80px] @max-xs:max-w-none @max-xs:flex-1 @max-xs:text-left">
                                                {taskScope === 'team_ongoing'
                                                    ? 'Tim'
                                                    : taskScope === 'mine'
                                                      ? 'Saya'
                                                      : 'Selesai'}
                                            </span>
                                            <ChevronDown className="w-3 h-3 text-[var(--md-sys-color-on-surface-muted)] shrink-0" />
                                        </button>
                                    </DropdownMenu.Trigger>
                                    <DropdownMenu.Portal>
                                        <DropdownMenu.Content
                                            align="end"
                                            sideOffset={6}
                                            className="z-50 w-52 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] p-1.5 shadow-[var(--md-elevation-3)]"
                                        >
                                            <DropdownMenu.Item
                                                onSelect={() => setTaskScope('team_ongoing')}
                                                className={cn(
                                                    'flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer outline-none',
                                                    taskScope === 'team_ongoing'
                                                        ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] font-bold'
                                                        : 'text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)]'
                                                )}
                                            >
                                                <span>Semua Tugas Tim ({ongoingTeamTaskCount})</span>
                                                {taskScope === 'team_ongoing' && <Check className="w-3.5 h-3.5" />}
                                            </DropdownMenu.Item>
                                            <DropdownMenu.Item
                                                onSelect={() => setTaskScope('mine')}
                                                className={cn(
                                                    'flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer outline-none',
                                                    taskScope === 'mine'
                                                        ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] font-bold'
                                                        : 'text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)]'
                                                )}
                                            >
                                                <span>Tugas Saya</span>
                                                {taskScope === 'mine' && <Check className="w-3.5 h-3.5" />}
                                            </DropdownMenu.Item>
                                            <DropdownMenu.Item
                                                onSelect={() => setTaskScope('completed')}
                                                className={cn(
                                                    'flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer outline-none',
                                                    taskScope === 'completed'
                                                        ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] font-bold'
                                                        : 'text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)]'
                                                )}
                                            >
                                                <span>Sub-Tugas Selesai</span>
                                                {taskScope === 'completed' && <Check className="w-3.5 h-3.5" />}
                                            </DropdownMenu.Item>
                                        </DropdownMenu.Content>
                                    </DropdownMenu.Portal>
                                </DropdownMenu.Root>
                            </div>

                            {/* Refined Task Cards List (Flex-1) */}
                            <div className="mt-3.5 space-y-2.5 flex-1 min-h-0 overflow-y-auto pr-1">
                                {visibleTasks.length === 0 ? (
                                    <div className="p-6 rounded-2xl border border-dashed border-[var(--md-sys-color-outline-variant)] text-center space-y-2 my-2">
                                        <CheckCircle2 className="w-6 h-6 text-[var(--md-sys-color-secondary)] mx-auto" />
                                        <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                                            Tidak ada sub-tugas pada filter ini
                                        </p>
                                        <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                            Coba ganti tab "{taskTab === 'today' ? 'Mendatang' : 'Hari Ini'}" atau filter tim.
                                        </p>
                                    </div>
                                ) : (
                                    visibleTasks.map((task, idx) => {
                                        const pastelClass = PASTEL_STYLES[idx % PASTEL_STYLES.length];
                                        const isDone = task.status === 'done';
                                        const isOverdue = !isDone && task.dueDate < today;
                                        const isSaving = togglingTaskId === task.id;
                                        const platformTitle =
                                            PLATFORM_LABELS[task.parentItem.platform] ?? task.parentItem.platform;

                                        return (
                                            <div
                                                key={task.id}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => setSelectedItem(task.parentItem)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        setSelectedItem(task.parentItem);
                                                    }
                                                }}
                                                className={cn(
                                                    'rounded-2xl p-3.5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] border border-black/5 dark:border-white/5',
                                                    pastelClass
                                                )}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {renderTaskLeadingBadge(task.parentItem.platform, task.taskType)}
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-muted)] truncate">
                                                            {platformTitle}
                                                        </span>
                                                    </div>

                                                    <motion.button
                                                        whileTap={{ scale: 0.86 }}
                                                        type="button"
                                                        disabled={isSaving}
                                                        onClick={(e) => handleToggleTaskStatus(e, task)}
                                                        aria-label={
                                                            isDone
                                                                ? `Buka kembali tugas ${task.title}`
                                                                : `Tandai selesai tugas ${task.title}`
                                                        }
                                                        title={isDone ? 'Tandai belum selesai' : 'Tandai selesai'}
                                                        className={cn(
                                                            'w-6 h-6 rounded-full border flex items-center justify-center transition-colors cursor-pointer shrink-0',
                                                            isDone
                                                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                                                : 'border-slate-400/70 dark:border-slate-500 bg-white/75 dark:bg-slate-900/50 text-slate-500 hover:border-emerald-600 hover:text-emerald-600'
                                                        )}
                                                    >
                                                        <Check className={cn('w-3.5 h-3.5', isSaving && 'animate-pulse')} />
                                                    </motion.button>
                                                </div>

                                                <h3
                                                    className={cn(
                                                        'mt-2.5 text-xs font-bold leading-snug text-[var(--md-sys-color-on-surface)]',
                                                        isDone && 'line-through opacity-70'
                                                    )}
                                                >
                                                    {task.title}
                                                </h3>

                                                <p className="mt-1 text-[11px] text-[var(--md-sys-color-on-surface-variant)] line-clamp-1 leading-normal opacity-90">
                                                    {task.parentItem.title}
                                                </p>

                                                <div className="mt-2.5 pt-2 border-t border-slate-900/6 dark:border-white/8 flex items-center justify-between gap-2 text-[10px] font-semibold">
                                                    <span className="text-[var(--md-sys-color-on-surface-muted)] truncate">
                                                        PIC: {task.assignedTo}
                                                    </span>
                                                    <span
                                                        className={cn(
                                                            'sparc-code-id shrink-0 px-2 py-0.5 rounded-full',
                                                            isOverdue
                                                                ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold'
                                                                : 'bg-slate-900/6 dark:bg-white/10 text-[var(--md-sys-color-on-surface-variant)]'
                                                        )}
                                                    >
                                                        {isOverdue ? 'Terlambat • ' : ''}
                                                        {formatShortIndoDate(task.dueDate)}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Bottom Card Footer */}
                        <div className="mt-3 pt-2.5 border-t border-[var(--md-sys-color-outline-variant)]/60 flex items-center justify-between shrink-0">
                            <span className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                {visibleTasks.filter((t) => t.status !== 'done').length} aktif •{' '}
                                {allTasks.filter((t) => t.status === 'done').length} selesai
                            </span>
                            <Link
                                href="/content?view=kanban"
                                className="inline-flex items-center gap-1 text-xs font-bold text-[var(--md-sys-color-on-surface)] hover:text-[var(--md-sys-color-primary)] transition-colors"
                            >
                                Semua Tugas <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>
                    </div>

                    {/* -------------------------------------------------------------
                        CENTER COLUMN (6 Cols): TOP 2 CHARTS + BOTTOM PROGRESS BARS
                       ------------------------------------------------------------- */}
                    <div className="xl:col-span-6 flex flex-col gap-5">
                        {/* Top Pair: Ringkasan Konten (Donut) + Reach vs Interaksi (Spline) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Card 2A: Ringkasan Konten (Donut Chart) */}
                            <div className="panze-bento-card p-5 flex flex-col justify-between">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <h2 className="text-[15px] font-bold text-[var(--md-sys-color-on-surface)]">
                                            Ringkasan Konten
                                        </h2>
                                        <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                            Proporsi siklus produksi HUMAS
                                        </p>
                                    </div>
                                    <Link
                                        href="/content"
                                        aria-label="Buka Content Plan"
                                        title="Buka Content Plan"
                                        className="panze-icon-btn shrink-0"
                                    >
                                        <ArrowUpRight className="w-4 h-4" />
                                    </Link>
                                </div>

                                {/* Donut Ring SVG */}
                                <div className="my-3 flex items-center justify-center relative">
                                    <svg
                                        viewBox="0 0 168 168"
                                        className="w-[164px] h-[164px] -rotate-90 overflow-visible"
                                        role="img"
                                        aria-label={`Ringkasan Konten: ${donutStats.inProgress} dalam produksi, ${donutStats.completed} sudah tayang, ${donutStats.planning} perencanaan`}
                                    >
                                        <circle
                                            cx="84"
                                            cy="84"
                                            r={ringRadius}
                                            fill="none"
                                            stroke="var(--md-sys-color-surface-container)"
                                            strokeWidth="20"
                                        />
                                        {donutSegments.map((seg, idx) => {
                                            if (seg.count === 0 && donutStats.rawTotal > 0) {
                                                return null;
                                            }
                                            const isHovered = hoveredSegment === seg.key;
                                            return (
                                                <motion.circle
                                                    key={seg.key}
                                                    cx="84"
                                                    cy="84"
                                                    r={ringRadius}
                                                    fill="none"
                                                    stroke={seg.color}
                                                    initial={{ opacity: 0, strokeDashoffset: ringCircumference }}
                                                    animate={{
                                                        opacity: 1,
                                                        strokeDashoffset: Number(seg.dashOffset),
                                                        strokeWidth: isHovered ? 25 : 20,
                                                    }}
                                                    transition={{
                                                        duration: 0.85,
                                                        ease: [0.16, 1, 0.3, 1],
                                                        delay: idx * 0.1,
                                                        strokeWidth: { duration: 0.18 },
                                                    }}
                                                    strokeDasharray={seg.dashArray}
                                                    strokeLinecap="butt"
                                                    onMouseEnter={() => setHoveredSegment(seg.key)}
                                                    onMouseLeave={() => setHoveredSegment(null)}
                                                    className="cursor-pointer"
                                                />
                                            );
                                        })}
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                                        <AnimatePresence mode="wait">
                                            <motion.div
                                                key={activeDonutMeta ? activeDonutMeta.label : 'total'}
                                                initial={{ opacity: 0, scale: 0.88, y: 3 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.88, y: -3 }}
                                                transition={{ duration: 0.18 }}
                                                className="flex flex-col items-center"
                                            >
                                                <span className="sparc-code-id text-2xl font-extrabold text-[var(--md-sys-color-on-surface)] leading-none">
                                                    {activeDonutMeta ? activeDonutMeta.count : donutStats.rawTotal}
                                                </span>
                                                <span className="text-[10px] font-semibold text-[var(--md-sys-color-on-surface-muted)] mt-1">
                                                    {activeDonutMeta ? activeDonutMeta.label : 'Total Konten'}
                                                </span>
                                            </motion.div>
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* Legend Dots (Interactive Filters) */}
                                <div className="space-y-1.5 pt-1">
                                    <div className="flex items-center justify-center gap-2 sm:gap-3 text-xs">
                                        <button
                                            type="button"
                                            onMouseEnter={() => setHoveredSegment('in_progress')}
                                            onMouseLeave={() => setHoveredSegment(null)}
                                            onClick={() => router.visit('/content?status=production')}
                                            className={cn(
                                                'inline-flex items-center gap-1.5 text-[var(--md-sys-color-on-surface-variant)] px-2 py-0.5 rounded-lg transition-all cursor-pointer',
                                                hoveredSegment === 'in_progress' && 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] shadow-2xs'
                                            )}
                                        >
                                            <span className="w-2.5 h-2.5 rounded-full bg-[#F97316] shrink-0" />
                                            <span>Dalam Produksi:</span>
                                            <strong className="sparc-code-id text-[var(--md-sys-color-on-surface)] font-bold">
                                                {donutStats.inProgress}
                                            </strong>
                                        </button>
                                        <button
                                            type="button"
                                            onMouseEnter={() => setHoveredSegment('completed')}
                                            onMouseLeave={() => setHoveredSegment(null)}
                                            onClick={() => router.visit('/content?status=published')}
                                            className={cn(
                                                'inline-flex items-center gap-1.5 text-[var(--md-sys-color-on-surface-variant)] px-2 py-0.5 rounded-lg transition-all cursor-pointer',
                                                hoveredSegment === 'completed' && 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] shadow-2xs'
                                            )}
                                        >
                                            <span className="w-2.5 h-2.5 rounded-full bg-[#0EA5E9] shrink-0" />
                                            <span>Tayang:</span>
                                            <strong className="sparc-code-id text-[var(--md-sys-color-on-surface)] font-bold">
                                                {donutStats.completed}
                                            </strong>
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-center text-xs">
                                        <button
                                            type="button"
                                            onMouseEnter={() => setHoveredSegment('planning')}
                                            onMouseLeave={() => setHoveredSegment(null)}
                                            onClick={() => router.visit('/content?status=briefing')}
                                            className={cn(
                                                'inline-flex items-center gap-1.5 text-[var(--md-sys-color-on-surface-variant)] px-2 py-0.5 rounded-lg transition-all cursor-pointer',
                                                hoveredSegment === 'planning' && 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] shadow-2xs'
                                            )}
                                        >
                                            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                                            <span>Perencanaan:</span>
                                            <strong className="sparc-code-id text-[var(--md-sys-color-on-surface)] font-bold">
                                                {donutStats.planning}
                                            </strong>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Card 2B: Reach vs Interaksi (Dual Spline Area Chart) */}
                            <div className="panze-bento-card p-5 flex flex-col justify-between">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <h2 className="text-[15px] font-bold text-[var(--md-sys-color-on-surface)] truncate">
                                            Reach vs Interaksi
                                        </h2>
                                        <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] truncate">
                                            {PLATFORM_LABELS[trendPlatform] ?? 'Semua Kanal'}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <DropdownMenu.Root>
                                            <DropdownMenu.Trigger asChild>
                                                <button
                                                    type="button"
                                                    aria-label="Filter kanal grafik performa"
                                                    title="Filter Kanal Sosial"
                                                    className="panze-icon-btn cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]"
                                                >
                                                    <SlidersHorizontal className="w-3.5 h-3.5" />
                                                </button>
                                            </DropdownMenu.Trigger>
                                            <DropdownMenu.Portal>
                                                <DropdownMenu.Content
                                                    align="end"
                                                    sideOffset={6}
                                                    className="z-50 w-44 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] p-1.5 shadow-[var(--md-elevation-3)]"
                                                >
                                                    {(['all', 'instagram', 'youtube', 'tiktok', 'website'] as const).map(
                                                        (pf) => (
                                                            <DropdownMenu.Item
                                                                key={pf}
                                                                onSelect={() => setTrendPlatform(pf)}
                                                                className={cn(
                                                                    'flex items-center justify-between px-3 py-1.5 rounded-xl text-xs cursor-pointer outline-none',
                                                                    trendPlatform === pf
                                                                        ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] font-bold'
                                                                        : 'text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)]'
                                                                )}
                                                            >
                                                                <span>{PLATFORM_LABELS[pf]}</span>
                                                                {trendPlatform === pf && <Check className="w-3.5 h-3.5" />}
                                                            </DropdownMenu.Item>
                                                        )
                                                    )}
                                                </DropdownMenu.Content>
                                            </DropdownMenu.Portal>
                                        </DropdownMenu.Root>

                                        <Link
                                            href="/report"
                                            aria-label="Buka Performance Report"
                                            title="Buka Performance Report"
                                            className="panze-icon-btn"
                                        >
                                            <ArrowUpRight className="w-4 h-4" />
                                        </Link>
                                    </div>
                                </div>

                                {/* Interactive Dual Spline SVG + Tooltip */}
                                <div className="relative mt-2 select-none">
                                    {/* Floating Tooltip Card (Panze Style) */}
                                    <AnimatePresence>
                                        {activePoint && (
                                            <motion.div
                                                key="chart-tooltip"
                                                animate={{
                                                    left: `${Math.min(62, Math.max(8, (activeReachXY.x / svgW) * 100 - 16))}%`,
                                                }}
                                                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                                                className="pointer-events-none absolute top-1 z-10 px-2.5 py-1.5 rounded-xl bg-[var(--md-sys-color-surface)]/95 dark:bg-[var(--md-sys-color-surface-container-high)]/95 backdrop-blur-xs border border-[var(--md-sys-color-outline-variant)] shadow-sm text-[10px] space-y-0.5"
                                            >
                                                <div className="text-[10px] font-bold text-[var(--md-sys-color-on-surface-muted)] pb-0.5 border-b border-[var(--md-sys-color-outline-variant)]/50">
                                                    {activePoint.fullLabel ?? activePoint.label}
                                                </div>
                                                <div className="flex items-center gap-1.5 font-bold text-[var(--md-sys-color-on-surface)]">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
                                                    <span className="sparc-code-id">
                                                        Reach: {activePoint.reach.toLocaleString('id-ID')}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 font-bold text-[var(--md-sys-color-on-surface)]">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-[#EA580C]" />
                                                    <span className="sparc-code-id">
                                                        Interaksi: {activePoint.interactions.toLocaleString('id-ID')}
                                                    </span>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <svg
                                        viewBox={`0 0 ${svgW} ${svgH}`}
                                        className="w-full h-[182px] overflow-visible"
                                        role="img"
                                        aria-label="Grafik tren Reach dan Interaksi konten HUMAS"
                                    >
                                        <defs>
                                            <linearGradient id="sparcReachGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.24" />
                                                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.01" />
                                            </linearGradient>
                                            <linearGradient id="sparcInterGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#F97316" stopOpacity="0.26" />
                                                <stop offset="100%" stopColor="#F97316" stopOpacity="0.02" />
                                            </linearGradient>
                                        </defs>

                                        {/* Subtle Vertical Column Bands */}
                                        {chartSeries.map((pt, idx) => {
                                            const x = reachCoords[idx]?.x ?? 0;
                                            const colW = plotW / Math.max(1, chartSeries.length);
                                            return idx % 2 === 1 ? (
                                                <rect
                                                    key={`band-${pt.label}`}
                                                    x={x - colW / 2}
                                                    y={padTop - 6}
                                                    width={colW}
                                                    height={plotH + 6}
                                                    rx="6"
                                                    fill="var(--md-sys-color-surface-container-low)"
                                                    opacity="0.6"
                                                />
                                            ) : null;
                                        })}

                                        {/* Horizontal Guide Lines */}
                                        {[0.25, 0.55, 0.85].map((ratio) => (
                                            <line
                                                key={ratio}
                                                x1={padLeft}
                                                x2={svgW - padRight}
                                                y1={padTop + plotH * ratio}
                                                y2={padTop + plotH * ratio}
                                                stroke="var(--md-sys-color-outline-variant)"
                                                strokeDasharray="3 3"
                                                strokeWidth="0.8"
                                                opacity="0.7"
                                            />
                                        ))}

                                        {/* Gradient Area Fills with Smooth Fade */}
                                        {reachAreaPath && (
                                            <motion.path
                                                key={`reach-area-${trendPlatform}`}
                                                d={reachAreaPath}
                                                fill="url(#sparcReachGrad)"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ duration: 0.8, delay: 0.25 }}
                                            />
                                        )}
                                        {interAreaPath && (
                                            <motion.path
                                                key={`inter-area-${trendPlatform}`}
                                                d={interAreaPath}
                                                fill="url(#sparcInterGrad)"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ duration: 0.8, delay: 0.35 }}
                                            />
                                        )}

                                        {/* Smooth Spline Strokes (opacity-only fade: `pathLength` is dropped
                                            under the app-level MotionConfig reducedMotion="user", which leaves
                                            strokes permanently invisible at pathLength 0) */}
                                        <motion.path
                                            key={`reach-line-${trendPlatform}`}
                                            d={reachLinePath}
                                            fill="none"
                                            stroke="#2563EB"
                                            strokeWidth="2.2"
                                            strokeLinecap="round"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                                        />
                                        <motion.path
                                            key={`inter-line-${trendPlatform}`}
                                            d={interLinePath}
                                            fill="none"
                                            stroke="#EA580C"
                                            strokeWidth="2.2"
                                            strokeLinecap="round"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                                        />

                                        {/* Active Vertical Dashed Scrubber Line with Spring */}
                                        <motion.line
                                            animate={{
                                                x1: activeReachXY.x,
                                                x2: activeReachXY.x,
                                                y1: activeReachXY.y,
                                                y2: baselineY,
                                            }}
                                            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                                            stroke="var(--md-sys-color-outline)"
                                            strokeDasharray="3 3"
                                            strokeWidth="1.1"
                                        />

                                        {/* Pulsating ripple on active Reach dot */}
                                        <motion.circle
                                            animate={{
                                                cx: activeReachXY.x,
                                                cy: activeReachXY.y,
                                                r: [4.5, 9, 4.5],
                                                opacity: [0.5, 0, 0.5],
                                            }}
                                            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                            fill="none"
                                            stroke="#2563EB"
                                            strokeWidth="1.5"
                                        />

                                        {/* Active Hollow Dots with Spring */}
                                        <motion.circle
                                            animate={{
                                                cx: activeReachXY.x,
                                                cy: activeReachXY.y,
                                            }}
                                            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                                            r="4.5"
                                            fill="var(--md-sys-color-surface)"
                                            stroke="#2563EB"
                                            strokeWidth="2.4"
                                        />
                                        <motion.circle
                                            animate={{
                                                cx: activeInterXY.x,
                                                cy: activeInterXY.y,
                                            }}
                                            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                                            r="4.5"
                                            fill="var(--md-sys-color-surface)"
                                            stroke="#EA580C"
                                            strokeWidth="2.4"
                                        />

                                        {/* Month X-Axis Labels + Invisible Hover Columns */}
                                        {chartSeries.map((pt, idx) => {
                                            const x = reachCoords[idx]?.x ?? 0;
                                            const isCurrent = idx === activeTrendIndex;
                                            const hitW = plotW / Math.max(1, chartSeries.length);
                                            return (
                                                <g key={pt.label}>
                                                    <text
                                                        x={x}
                                                        y={svgH - 6}
                                                        textAnchor="middle"
                                                        className={cn(
                                                            'text-[10px] transition-colors',
                                                            isCurrent
                                                                ? 'fill-[var(--md-sys-color-on-surface)] font-bold'
                                                                : 'fill-[var(--md-sys-color-on-surface-muted)] font-medium'
                                                        )}
                                                    >
                                                        {pt.label}
                                                    </text>
                                                    <rect
                                                        x={x - hitW / 2}
                                                        y={0}
                                                        width={hitW}
                                                        height={svgH}
                                                        fill="transparent"
                                                        className="cursor-pointer"
                                                        onMouseEnter={() => setHoveredTrendIdx(idx)}
                                                        onClick={() => setHoveredTrendIdx(idx)}
                                                    />
                                                </g>
                                            );
                                        })}
                                    </svg>
                                </div>
                            </div>
                        </div>

                        {/* Center-Bottom Wide Card: 5 Vibrant Horizontal Progress Bars */}
                        <div className="panze-bento-card p-5 sm:p-6 flex-1 flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
                                        {overviewMode === 'pipeline'
                                            ? 'Status Alur & Tenggat Produksi'
                                            : overviewMode === 'channels'
                                              ? 'Capaian Distribusi per Kanal Sosial'
                                              : 'Beban Kerja & Kapasitas Tim HUMAS'}
                                    </h2>
                                    <p className="text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                        {overviewMode === 'pipeline'
                                            ? `Realisasi konten terhadap target ${monthlyTarget} publikasi/bulan`
                                            : overviewMode === 'channels'
                                              ? 'Perbandingan volume konten dan jangkauan terukur per kanal'
                                              : 'Distribusi jam kerja aktif dibandingkan kapasitas mingguan personel'}
                                    </p>
                                </div>

                                {/* Quick Segmented Pills */}
                                <div className="flex items-center gap-1 p-1 rounded-full bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shrink-0 self-start sm:self-auto">
                                    <button
                                        type="button"
                                        onClick={() => setOverviewMode('pipeline')}
                                        className={cn(
                                            'px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer',
                                            overviewMode === 'pipeline'
                                                ? 'panze-pill-active shadow-2xs'
                                                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                                        )}
                                    >
                                        Alur Kerja
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setOverviewMode('channels')}
                                        className={cn(
                                            'px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer',
                                            overviewMode === 'channels'
                                                ? 'panze-pill-active shadow-2xs'
                                                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                                        )}
                                    >
                                        Kanal
                                    </button>
                                    {can?.viewTeamWorkload && (
                                        <button
                                            type="button"
                                            onClick={() => setOverviewMode('workload')}
                                            className={cn(
                                                'px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer',
                                                overviewMode === 'workload'
                                                    ? 'panze-pill-active shadow-2xs'
                                                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                                            )}
                                        >
                                            Beban Tim
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Perspective KPI Summary Row */}
                            <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]/60">
                                {overviewMode === 'pipeline' && (
                                    <>
                                        <span className="sparc-code-id text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                            {pipelineMetrics.overdueCount} Terlambat
                                        </span>
                                        <span className="sparc-code-id text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                            {pipelineMetrics.review} Siap Review
                                        </span>
                                        <span className="sparc-code-id text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                                            {pipelineMetrics.inProd} Dalam Produksi
                                        </span>
                                        <span className="sparc-code-id text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                            {pipelineMetrics.pub} Tayang ({monthlyTarget} Target)
                                        </span>
                                    </>
                                )}
                                {overviewMode === 'channels' && (
                                    <>
                                        <span className="sparc-code-id text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                            {channelOverviewMeta.activeChannelsCount} Kanal Aktif
                                        </span>
                                        {channelOverviewMeta.topEntry && channelOverviewMeta.topEntry[1].posts > 0 && (
                                            <span className="sparc-code-id text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                                                {PLATFORM_LABELS[channelOverviewMeta.topEntry[0]] ?? channelOverviewMeta.topEntry[0]} Teratas ({channelOverviewMeta.topEntry[1].posts.toLocaleString('id-ID')} Konten)
                                            </span>
                                        )}
                                        <span className="sparc-code-id text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                            {igDash?.connected ? `IG @${igDash.username} Tersambung` : 'Distribusi Multi-Kanal'}
                                        </span>
                                    </>
                                )}
                                {overviewMode === 'workload' && (
                                    <>
                                        <span className="sparc-code-id text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                            {team.length} Personel Terdaftar
                                        </span>
                                        <span className="sparc-code-id text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                                            Kapasitas Terukur
                                        </span>
                                    </>
                                )}
                            </div>

                            <div className="space-y-3.5 flex-1 flex flex-col justify-around">
                                {overviewBars.map((bar) => (
                                    <Link
                                        key={bar.id}
                                        href={bar.href}
                                        className="block group p-2 -mx-2 rounded-2xl hover:bg-[var(--md-sys-color-surface-container)]/50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]"
                                    >
                                        <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                                            <span className="font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)] transition-colors truncate">
                                                {bar.label}
                                            </span>
                                            <span className="sparc-code-id text-[11px] sm:text-xs text-[var(--md-sys-color-on-surface-muted)] shrink-0 flex items-center gap-2">
                                                <strong className="text-[var(--md-sys-color-on-surface)] font-bold">
                                                    {bar.countText}
                                                </strong>
                                                <span className="opacity-40">|</span>
                                                <span>{bar.metaText}</span>
                                            </span>
                                        </div>
                                        <div className="h-3.5 rounded-full bg-slate-200/75 dark:bg-[var(--md-sys-color-surface-container-high)] overflow-hidden">
                                            <motion.div
                                                key={`${overviewMode}-${bar.id}`}
                                                initial={{ width: 0 }}
                                                animate={{ width: `${bar.pct}%` }}
                                                transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                                                className={cn('h-full rounded-full', bar.colorClass)}
                                            />
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* -------------------------------------------------------------
                        RIGHT COLUMN (3 Cols): AGENDA & TAYANG + TIKET HALO APU
                       ------------------------------------------------------------- */}
                    <div className="xl:col-span-3 flex flex-col gap-5">
                        {/* Top Section: Agenda & Jadwal Tayang */}
                        <div className="panze-bento-card p-5 flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-2">
                                <h2 className="text-[15px] font-bold text-[var(--md-sys-color-on-surface)]">
                                    Agenda & Tayang
                                </h2>
                                <Link
                                    href="/calendar"
                                    aria-label="Buka Kalender Operasional"
                                    title="Kalender Operasional"
                                    className="panze-icon-btn shrink-0"
                                >
                                    <CalendarIcon className="w-4 h-4" />
                                </Link>
                            </div>

                            <div className="mt-3.5 space-y-2.5">
                                {scheduleCards.length === 0 ? (
                                    <div className="p-4 rounded-2xl border border-dashed border-[var(--md-sys-color-outline-variant)] text-center text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                        Belum ada agenda atau jadwal publikasi terdekat.
                                    </div>
                                ) : (
                                    scheduleCards.map((ev) => (
                                        <Link
                                            key={ev.id}
                                            href={ev.href}
                                            className="block rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] dark:bg-[var(--md-sys-color-surface-container-low)] hover:border-[var(--md-sys-color-outline)] p-3.5 transition-all group outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <span className="text-[10px] font-semibold text-[var(--md-sys-color-on-surface-muted)] block">
                                                        {ev.eyebrow}
                                                    </span>
                                                    <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] line-clamp-1 mt-0.5 group-hover:text-[var(--md-sys-color-primary)] transition-colors">
                                                        {ev.title}
                                                    </h3>
                                                </div>
                                                <ArrowUpRight className="w-3.5 h-3.5 text-[var(--md-sys-color-on-surface-muted)] shrink-0 mt-0.5" />
                                            </div>

                                            <div className="mt-2.5 flex items-center justify-between gap-2">
                                                <span className="sparc-code-id text-xs font-extrabold text-[var(--md-sys-color-on-surface)]">
                                                    {ev.timeBadge}
                                                </span>
                                                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                                                    {ev.platform === 'agenda' ? (
                                                        <Building2 className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                                                    ) : (
                                                        <Send className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                                    )}
                                                    {ev.subBadge}
                                                </span>
                                            </div>
                                        </Link>
                                    ))
                                )}
                            </div>

                            <div className="mt-3 pt-2 border-t border-[var(--md-sys-color-outline-variant)]/60">
                                <Link
                                    href="/calendar"
                                    className="inline-flex items-center gap-1 text-xs font-bold text-[var(--md-sys-color-on-surface)] hover:text-[var(--md-sys-color-primary)] transition-colors"
                                >
                                    Lihat Semua Jadwal <ChevronRight className="w-3.5 h-3.5" />
                                </Link>
                            </div>
                        </div>

                        {/* Bottom Section: Tiket HALO APU / Antrean Approval */}
                        <div className="panze-bento-card p-5 flex-1 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <h2 className="text-[15px] font-bold text-[var(--md-sys-color-on-surface)]">
                                            {rightQueueMode === 'tickets'
                                                ? 'Tiket HALO APU'
                                                : 'Menunggu Approval'}
                                        </h2>
                                        <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                            {rightQueueMode === 'tickets'
                                                ? `${openHaloTickets.length} permintaan belum dikonversi`
                                                : `${pendingApprovals.length} konten siap ditinjau pimpinan`}
                                        </p>
                                    </div>

                                    <DropdownMenu.Root>
                                        <DropdownMenu.Trigger asChild>
                                            <button
                                                type="button"
                                                aria-label="Ganti antrean kanan bawah"
                                                title="Pilih Antrean Tiket atau Approval"
                                                className="panze-icon-btn shrink-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]"
                                            >
                                                <SlidersHorizontal className="w-3.5 h-3.5" />
                                            </button>
                                        </DropdownMenu.Trigger>
                                        <DropdownMenu.Portal>
                                            <DropdownMenu.Content
                                                align="end"
                                                sideOffset={6}
                                                className="z-50 w-56 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] p-1.5 shadow-[var(--md-elevation-3)]"
                                            >
                                                <DropdownMenu.Item
                                                    onSelect={() => setRightQueueMode('tickets')}
                                                    className={cn(
                                                        'flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer outline-none',
                                                        rightQueueMode === 'tickets'
                                                            ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] font-bold'
                                                            : 'text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)]'
                                                    )}
                                                >
                                                    <span>Tiket Masuk HALO APU ({openHaloTickets.length})</span>
                                                    {rightQueueMode === 'tickets' && <Check className="w-3.5 h-3.5" />}
                                                </DropdownMenu.Item>
                                                <DropdownMenu.Item
                                                    onSelect={() => setRightQueueMode('approvals')}
                                                    className={cn(
                                                        'flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer outline-none',
                                                        rightQueueMode === 'approvals'
                                                            ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] font-bold'
                                                            : 'text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)]'
                                                    )}
                                                >
                                                    <span>Antrean Approval ({pendingApprovals.length})</span>
                                                    {rightQueueMode === 'approvals' && <Check className="w-3.5 h-3.5" />}
                                                </DropdownMenu.Item>
                                            </DropdownMenu.Content>
                                        </DropdownMenu.Portal>
                                    </DropdownMenu.Root>
                                </div>

                                <div className="mt-3.5 space-y-2.5">
                                    {rightQueueMode === 'tickets' ? (
                                        openHaloTickets.length === 0 ? (
                                            <div className="p-5 rounded-2xl border border-dashed border-[var(--md-sys-color-outline-variant)] text-center space-y-1.5">
                                                <Inbox className="w-5 h-5 text-[var(--md-sys-color-secondary)] mx-auto" />
                                                <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                                                    Semua tiket HALO APU tertangani
                                                </p>
                                                <Link
                                                    href="/incoming"
                                                    className="inline-block text-[11px] font-semibold text-[var(--md-sys-color-primary)] hover:underline"
                                                >
                                                    Lihat Riwayat Incoming
                                                </Link>
                                            </div>
                                        ) : (
                                            openHaloTickets.slice(0, 3).map((ticket) => (
                                                <div
                                                    key={ticket.id}
                                                    className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] dark:bg-[var(--md-sys-color-surface-container-low)] p-3.5 flex items-start gap-3"
                                                >
                                                    <img
                                                        src={ticket.requesterAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(ticket.requesterName || 'HaloAPU')}&background=1546D8&color=fff&size=128&bold=true`}
                                                        alt={ticket.requesterName}
                                                        onError={(e) => {
                                                            (e.currentTarget as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(ticket.requesterName || 'HaloAPU')}&background=1546D8&color=fff&size=128&bold=true`;
                                                        }}
                                                        className="w-9 h-9 rounded-full object-cover border border-[var(--md-sys-color-outline-variant)] shrink-0 mt-0.5"
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate">
                                                            {ticket.requesterName}
                                                        </p>
                                                        <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] line-clamp-2 mt-0.5 leading-relaxed">
                                                            {ticket.brief}
                                                        </p>
                                                        <div className="mt-2 flex items-center justify-between gap-2">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSelectedTicket(ticket)}
                                                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--md-sys-color-surface-container)] hover:bg-[var(--md-sys-color-surface-container-high)] text-[11px] font-bold text-[var(--md-sys-color-on-surface)] transition-colors cursor-pointer"
                                                                >
                                                                    Tinjau <ChevronRight className="w-3 h-3" />
                                                                </button>
                                                                {ticket.isSlaBreached && (
                                                                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-bold">
                                                                        <AlertTriangle className="w-2.5 h-2.5" /> SLA
                                                                    </span>
                                                                )}
                                                                {Boolean(ticket.revisionCount && ticket.revisionCount > 0) && (
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                                                                        Rev-{ticket.revisionCount}
                                                                    </span>
                                                                )}
                                                                {ticket.isResultAccepted && (
                                                                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                                                                        <CheckCircle2 className="w-2.5 h-2.5" /> OK
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="sparc-code-id text-[10px] text-[var(--md-sys-color-on-surface-muted)]">
                                                                #{ticket.haloapuTicketId}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )
                                    ) : pendingApprovals.length === 0 ? (
                                        <div className="p-5 rounded-2xl border border-dashed border-[var(--md-sys-color-outline-variant)] text-center space-y-1.5">
                                            <CheckCircle2 className="w-5 h-5 text-[var(--md-sys-color-secondary)] mx-auto" />
                                            <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                                                Tidak ada antrean review pimpinan
                                            </p>
                                        </div>
                                    ) : (
                                        pendingApprovals.slice(0, 3).map((item) => (
                                            <div
                                                key={item.id}
                                                className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] dark:bg-[var(--md-sys-color-surface-container-low)] p-3.5 flex items-start gap-3"
                                            >
                                                <img
                                                    src={item.picAvatar}
                                                    alt={item.picName}
                                                    className="w-9 h-9 rounded-full object-cover border border-[var(--md-sys-color-outline-variant)] shrink-0 mt-0.5"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate">
                                                        {item.picName}
                                                    </p>
                                                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] line-clamp-2 mt-0.5 leading-relaxed">
                                                        {item.title}
                                                    </p>
                                                    <div className="mt-2 flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedItem(item)}
                                                            className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--md-sys-color-surface-container)] hover:bg-[var(--md-sys-color-surface-container-high)] text-[11px] font-bold text-[var(--md-sys-color-on-surface)] transition-colors cursor-pointer"
                                                        >
                                                            Tinjau <ChevronRight className="w-3 h-3" />
                                                        </button>
                                                        {can?.approveContent && (
                                                            <button
                                                                type="button"
                                                                disabled={approvingId === item.id}
                                                                onClick={() => handleQuickApprove(item)}
                                                                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                                                            >
                                                                Setujui
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="mt-3">
                                <Link
                                    href={rightQueueMode === 'tickets' ? '/incoming' : '/content?view=kanban'}
                                    className="inline-flex items-center gap-1 text-xs font-bold text-[var(--md-sys-color-on-surface)] hover:text-[var(--md-sys-color-primary)] transition-colors"
                                >
                                    {rightQueueMode === 'tickets'
                                        ? 'Buka Semua Tiket HALO APU'
                                        : 'Buka Papan Kanban'}{' '}
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </Link>
                            </div>
                        </div>
                    </div>
                </motion.section>
            </motion.div>

            {/* =====================================================================
                MODAL: QUICK ADD PRODUCTION TASK OR NEW CONTENT ITEM ("+" on My Tasks)
               ===================================================================== */}
            <Modal
                isOpen={quickAddOpen}
                onClose={() => setQuickAddOpen(false)}
                title={quickAddMode === 'task' ? 'Tambah Sub-Tugas Produksi' : 'Buat Rencana Konten Baru'}
                description="Tambahkan pekerjaan langsung dari Dashboard HUMAS tanpa berpindah modul"
                maxWidth="md"
            >
                <div className="space-y-4">
                    {can?.updateTasks && can?.editContent && (
                        <div className="inline-flex p-1 rounded-full bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]">
                            <button
                                type="button"
                                onClick={() => setQuickAddMode('task')}
                                className={cn(
                                    'px-3.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer',
                                    quickAddMode === 'task'
                                        ? 'panze-pill-active'
                                        : 'text-[var(--md-sys-color-on-surface-variant)]'
                                )}
                            >
                                Sub-Tugas Produksi
                            </button>
                            <button
                                type="button"
                                onClick={() => setQuickAddMode('content')}
                                className={cn(
                                    'px-3.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer',
                                    quickAddMode === 'content'
                                        ? 'panze-pill-active'
                                        : 'text-[var(--md-sys-color-on-surface-variant)]'
                                )}
                            >
                                Konten Baru
                            </button>
                        </div>
                    )}

                    {quickAddMode === 'task' ? (
                        <form onSubmit={handleSubmitTask} noValidate className="space-y-3.5">
                            <Select
                                label="Item Konten Induk"
                                value={taskForm.data.content_item_id}
                                onChange={(e) => taskForm.setData('content_item_id', e.target.value)}
                                error={taskForm.errors.content_item_id}
                            >
                                {contentItems.map((ci) => (
                                    <option key={ci.id} value={ci.id}>
                                        {ci.contentId} — {ci.title}
                                    </option>
                                ))}
                            </Select>

                            <Input
                                label="Nama Sub-Tugas Produksi"
                                placeholder="Contoh: Revisi transisi bumper akhir Reels"
                                value={taskForm.data.title}
                                onChange={(e) => taskForm.setData('title', e.target.value)}
                                error={taskForm.errors.title}
                                required
                            />

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                <Select
                                    label="Jenis Tugas"
                                    value={taskForm.data.task_type}
                                    onChange={(e) =>
                                        taskForm.setData(
                                            'task_type',
                                            e.target.value as ProductionTaskItem['taskType']
                                        )
                                    }
                                >
                                    <option value="scripting">Penulisan Naskah</option>
                                    <option value="design">Desain Visual</option>
                                    <option value="video">Penyuntingan Video</option>
                                    <option value="review">Review Redaksi</option>
                                    <option value="approval">Persetujuan Pimpinan</option>
                                    <option value="distribution">Distribusi Kanal</option>
                                </Select>

                                <Select
                                    label="Ditugaskan Kepada (PIC)"
                                    value={taskForm.data.assigned_to}
                                    onChange={(e) => taskForm.setData('assigned_to', e.target.value)}
                                >
                                    {team
                                        .filter((m) => m.primaryRole !== 'viewer')
                                        .map((m) => (
                                            <option key={m.id} value={m.name}>
                                                {m.name}
                                            </option>
                                        ))}
                                </Select>
                            </div>

                            <Input
                                label="Tenggat Sub-Tugas"
                                type="date"
                                value={taskForm.data.due_date}
                                onChange={(e) => taskForm.setData('due_date', e.target.value)}
                                error={taskForm.errors.due_date}
                                required
                            />

                            <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    type="button"
                                    onClick={() => setQuickAddOpen(false)}
                                >
                                    Batal
                                </Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    type="submit"
                                    isLoading={taskForm.processing}
                                >
                                    Simpan Tugas
                                </Button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleSubmitContent} noValidate className="space-y-3.5">
                            <Input
                                label="Judul Rencana Konten"
                                placeholder="Contoh: Infografis Layanan Pengaduan Terpadu"
                                value={contentForm.data.title}
                                onChange={(e) => contentForm.setData('title', e.target.value)}
                                error={contentForm.errors.title}
                                required
                            />

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                <Select
                                    label="Kanal Utama"
                                    value={contentForm.data.platform}
                                    onChange={(e) =>
                                        contentForm.setData(
                                            'platform',
                                            e.target.value as typeof contentForm.data.platform
                                        )
                                    }
                                >
                                    <option value="instagram">Instagram</option>
                                    <option value="youtube">YouTube</option>
                                    <option value="tiktok">TikTok</option>
                                    <option value="facebook">Facebook</option>
                                    <option value="x">X (Twitter)</option>
                                </Select>

                                <Input
                                    label="Target Tanggal Tayang"
                                    type="date"
                                    value={contentForm.data.publish_date}
                                    onChange={(e) => contentForm.setData('publish_date', e.target.value)}
                                />
                            </div>

                            <Textarea
                                label="Ringkasan Brief Awal"
                                rows={3}
                                placeholder="Objektif komunikasi atau poin utama konten..."
                                value={contentForm.data.caption}
                                onChange={(e) => contentForm.setData('caption', e.target.value)}
                            />

                            <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    type="button"
                                    onClick={() => setQuickAddOpen(false)}
                                >
                                    Batal
                                </Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    type="submit"
                                    isLoading={contentForm.processing}
                                >
                                    Buat Konten
                                </Button>
                            </div>
                        </form>
                    )}
                </div>
            </Modal>

            {/* =====================================================================
                SHARED SLIDE-OVER: INSPECT CONTENT ITEM & SUBTASKS
               ===================================================================== */}
            <ContentDetailSheet
                item={activeSelectedItem}
                today={today}
                team={team}
                onClose={() => setSelectedItem(null)}
            />

            {/* =====================================================================
                SHEET & MODAL: INSPECT & CONVERT INCOMING HALO APU TICKET
               ===================================================================== */}
            <Sheet
                isOpen={Boolean(selectedTicket)}
                onClose={() => setSelectedTicket(null)}
                title={
                    selectedTicket
                        ? `Tiket HALO APU #${selectedTicket.haloapuTicketId}`
                        : 'Rincian Tiket HALO APU'
                }
                description={selectedTicket?.title}
                width="md"
            >
                {selectedTicket && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]">
                            <img
                                src={selectedTicket.requesterAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedTicket.requesterName || 'HaloAPU')}&background=1546D8&color=fff&size=128&bold=true`}
                                alt={selectedTicket.requesterName}
                                onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedTicket.requesterName || 'HaloAPU')}&background=1546D8&color=fff&size=128&bold=true`;
                                }}
                                className="w-10 h-10 rounded-full object-cover border border-[var(--md-sys-color-outline-variant)] shrink-0"
                            />
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                                    {selectedTicket.requesterName}
                                </p>
                                <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] flex items-center gap-1.5 mt-0.5">
                                    <Clock className="w-3 h-3" /> {selectedTicket.createdAt} • Target{' '}
                                    {formatShortIndoDate(selectedTicket.targetDate)}
                                </p>
                            </div>
                        </div>
                        {/* HaloAPU Lifecycle Badges */}
                        <div className="flex flex-wrap items-center gap-1.5">
                            {selectedTicket.haloapuStatus && (
                                <Badge
                                    variant={
                                        selectedTicket.haloapuStatus === 'solve'
                                            ? 'success'
                                            : selectedTicket.haloapuStatus === 'need_revision'
                                              ? 'danger'
                                              : selectedTicket.haloapuStatus === 'reject' || selectedTicket.haloapuStatus === 'dibatalkan'
                                                ? 'default'
                                                : selectedTicket.haloapuStatus === 'on_proses'
                                                  ? 'primary'
                                                  : 'warning'
                                    }
                                >
                                    {selectedTicket.haloapuStatus}
                                </Badge>
                            )}
                            {selectedTicket.isSlaBreached && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold">
                                    <AlertTriangle className="w-3 h-3" /> SLA Lewat
                                </span>
                            )}
                            {Boolean(selectedTicket.revisionCount && selectedTicket.revisionCount > 0) && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold">
                                    Revisi ke-{selectedTicket.revisionCount}
                                </span>
                            )}
                            {selectedTicket.isResultAccepted && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                                    <CheckCircle2 className="w-3 h-3" /> Disetujui Pemohon
                                </span>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                                Brief Permohonan Konten
                            </h4>
                            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed p-3.5 rounded-2xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]">
                                {selectedTicket.brief}
                            </p>
                        </div>

                        {Object.keys(selectedTicket.formSnapshot || {}).length > 0 && (
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                                    Data Formulir HALO APU
                                </h4>
                                <div className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] divide-y divide-[var(--md-sys-color-outline-variant)]">
                                    {Object.entries(selectedTicket.formSnapshot).map(([k, v]) => (
                                        <div key={k} className="px-3.5 py-2.5 text-xs">
                                            <span className="text-[10px] font-bold uppercase text-[var(--md-sys-color-on-surface-muted)] block">
                                                {k}
                                            </span>
                                            <span className="text-[var(--md-sys-color-on-surface)] font-medium mt-0.5 block">
                                                {v}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Link href="/content">
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        icon={<FileText className="w-3.5 h-3.5" />}
                                    >
                                        Buka di Planner
                                    </Button>
                                </Link>
                                <Link href="/incoming">
                                    <Button variant="secondary" size="sm">
                                        Modul Incoming
                                    </Button>
                                </Link>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedTicket(null)}>
                                Tutup
                            </Button>
                        </div>
                    </div>
                )}
            </Sheet>
        </AppLayout>
    );
}
