import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, router, useForm, usePage } from '@inertiajs/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import { AnimatePresence, LayoutGroup, motion, PresenceContext } from 'framer-motion';
import {
    AlertCircle,
    AlertTriangle,
    ArrowLeftRight,
    Bell,
    BookOpen,
    Calendar,
    Check,
    CheckCheck,
    CheckCircle2,
    ChevronDown,
    FileText,
    FolderKanban,
    Grid3x3,
    Image as ImageIcon,
    Info,
    Kanban,
    LayoutDashboard,
    LogOut,
    ChevronLeft,
    ChevronRight,
    Menu,
    MessageCircle,
    Plus,
    RefreshCw,
    Send,
    Settings,
    Shield,
    TableProperties,
    Trash2,
    TrendingUp,
    Users,
    X,
} from 'lucide-react';
import { SparcLogo } from '@/Components/SparcLogo';
import { InertiaFlashListener } from '@/Components/InertiaFlashListener';
import { Button } from '@/Components/UI/Button';
import { Modal } from '@/Components/UI/Modal';
import { Input } from '@/Components/UI/Input';
import { Select } from '@/Components/UI/Select';
import { Textarea } from '@/Components/UI/Textarea';
import { Sheet } from '@/Components/UI/Sheet';
import { RoleBadge } from '@/Components/UI/Semantics';
import { ThemeSegmentedControl, ThemeSwitcher } from '@/Components/UI/ThemeSwitcher';
import { useToast } from '@/Components/UI/Toast';
import {
    backdropVariants,
    MD3_EASING,
    MD3_SPRING,
    pageTransitionVariants,
} from '@/lib/motion';
import { cn } from '@/lib/utils';

export interface WorkspaceUser {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'manager' | 'planner' | 'creator' | 'publisher' | 'viewer';
    roleLabel: string;
    avatar: string;
}

export interface WorkspacePermissions {
    manageUsers: boolean;
    inviteTeam: boolean;
    approveContent: boolean;
    bulkEditContent: boolean;
    viewTeamWorkload: boolean;
    manageActivities: boolean;
    editContent: boolean;
    updateTasks: boolean;
    managePublishing: boolean;
    manageAssets: boolean;
    manageSettings: boolean;
}

export interface PersistentNotificationItem {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    actionUrl?: string;
    createdAt: string;
    timeLabel?: string;
    readAt: string | null;
}

export interface SharedWorkspaceProps {
    auth?: {
        user: WorkspaceUser;
        can: WorkspacePermissions;
        personas: WorkspaceUser[];
    };
    workspaceNotifications?: {
        unreadCount: number;
        items: PersistentNotificationItem[];
        serverTime: string;
    };
    workspaceBadges?: {
        incoming: number;
        readyToPublish: number;
        reviewApproval: number;
        unrepliedComments?: number;
    };
    instagramStatus?: {
        connected: boolean;
        username: string;
        name?: string;
        profilePictureUrl?: string | null;
        followersCount?: number | null;
        mediaCount?: number | null;
        lastSyncedAt: string | null;
        capabilities?: {
            basic: boolean;
            insights: boolean;
            publish: boolean;
            comments: boolean;
        };
        bestPostingHours?: string[];
        accountInsights?: {
            reach_28d?: number | null;
            views_28d?: number | null;
            accounts_engaged_28d?: number | null;
            total_interactions_28d?: number | null;
            best_posting_hours?: string[];
            best_hours_source?: string;
        };
    };
    [key: string]: unknown;
}

interface LayoutSlotContextValue {
    insidePersistentShell: boolean;
    sidebarCollapsed: boolean;
    titleSlot: HTMLDivElement | null;
    centerSlot: HTMLDivElement | null;
    actionsSlot: HTMLDivElement | null;
}

const LayoutSlotContext = createContext<LayoutSlotContextValue>({
    insidePersistentShell: false,
    sidebarCollapsed: false,
    titleSlot: null,
    centerSlot: null,
    actionsSlot: null,
});

export interface AppLayoutProps {
    children: React.ReactNode;
    title?: string;
    subtitle?: string;
    headerCenter?: React.ReactNode;
    hideTopbarTitle?: boolean;
    actions?: React.ReactNode;
}

interface NavItemConfig {
    href: string;
    matchHref: string[];
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    badgeTone?: 'primary' | 'amber' | 'teal';
    visible?: boolean;
}

interface NavGroupConfig {
    id: string;
    label: string;
    items: NavItemConfig[];
}

const POLLED_TOAST_STORAGE_KEY = 'sparc_v3_polled_toast_ids';

function readSeenPollIds(): Set<string> {
    if (typeof window === 'undefined') {
        return new Set();
    }
    try {
        const raw = window.sessionStorage.getItem(POLLED_TOAST_STORAGE_KEY);
        if (!raw) {
            return new Set();
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
    } catch {
        return new Set();
    }
}

function saveSeenPollIds(ids: Set<string>): void {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.sessionStorage.setItem(
            POLLED_TOAST_STORAGE_KEY,
            JSON.stringify(Array.from(ids).slice(-80))
        );
    } catch {
        // ignore storage quota errors
    }
}

function getCsrfToken(): string {
    if (typeof document === 'undefined') {
        return '';
    }
    const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

/**
 * Persistent App Shell mounted once across Inertia page navigations.
 * Implements SPARC v3 6-group role-aware IA, persistent notification drawer + /poll/updates,
 * user/role switcher, and isolated MD3 page transitions.
 */
export const PersistentAppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const page = usePage<SharedWorkspaceProps>();
    const { url, props } = page;
    const { showToast, error: toastError, success: toastSuccess } = useToast();

    const currentUser: WorkspaceUser = props.auth?.user ?? {
        id: 'u-1',
        name: 'Aldwin NV',
        email: 'aldwin@humas.instansi.go.id',
        role: 'admin',
        roleLabel: 'Administrator',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    };

    const can: WorkspacePermissions = props.auth?.can ?? {
        manageUsers: true,
        inviteTeam: true,
        approveContent: true,
        bulkEditContent: true,
        viewTeamWorkload: true,
        manageActivities: true,
        editContent: true,
        updateTasks: true,
        managePublishing: true,
        manageAssets: true,
        manageSettings: true,
    };

    const personas: WorkspaceUser[] = props.auth?.personas ?? [currentUser];

    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
        if (typeof window === 'undefined') {
            return true;
        }
        try {
            const saved = window.localStorage.getItem('sparc_v3_sidebar_collapsed');
            return saved === null ? false : saved === 'true';
        } catch {
            return false;
        }
    });
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [notifSheetOpen, setNotifSheetOpen] = useState(false);
    const [workspacePrefsOpen, setWorkspacePrefsOpen] = useState(false);

    const [titleSlot, setTitleSlot] = useState<HTMLDivElement | null>(null);
    const [centerSlot, setCenterSlot] = useState<HTMLDivElement | null>(null);
    const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);

    const toggleSidebarCollapsed = useCallback(() => {
        setSidebarCollapsed((prev) => {
            const next = !prev;
            try {
                window.localStorage.setItem('sparc_v3_sidebar_collapsed', String(next));
            } catch {
                // ignore storage quota errors
            }
            return next;
        });
    }, []);

    // Persistent Notifications State (synchronized with Inertia shared props + /poll/updates)
    const [notifications, setNotifications] = useState<PersistentNotificationItem[]>(
        () => props.workspaceNotifications?.items ?? []
    );
    const [unreadCount, setUnreadCount] = useState<number>(
        () => props.workspaceNotifications?.unreadCount ?? 0
    );
    const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');
    const [isPolling, setIsPolling] = useState(false);
    const [pollError, setPollError] = useState<string | null>(null);
    const [markingReadId, setMarkingReadId] = useState<string | null>(null);
    const [markingAll, setMarkingAll] = useState(false);

    const lastSinceRef = useRef<string>(
        props.workspaceNotifications?.serverTime || new Date().toISOString()
    );
    const seenNotifIdsRef = useRef<Set<string>>(readSeenPollIds());

    // Seed initial notification IDs into seen set so existing notifications never toast on first poll
    useEffect(() => {
        const incomingItems = props.workspaceNotifications?.items ?? [];
        setNotifications(incomingItems);
        setUnreadCount(props.workspaceNotifications?.unreadCount ?? 0);
        if (props.workspaceNotifications?.serverTime) {
            lastSinceRef.current = props.workspaceNotifications.serverTime;
        }
        incomingItems.forEach((n) => seenNotifIdsRef.current.add(n.id));
        saveSeenPollIds(seenNotifIdsRef.current);
    }, [props.workspaceNotifications]);

    const runShortPoll = useCallback(
        async (manual = false) => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && !manual) {
                return;
            }
            if (manual) {
                setIsPolling(true);
            }
            setPollError(null);

            try {
                const res = await fetch(
                    `/poll/updates?since=${encodeURIComponent(lastSinceRef.current)}`,
                    {
                        headers: {
                            Accept: 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        credentials: 'same-origin',
                    }
                );

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }

                const data = (await res.json()) as {
                    server_time: string;
                    unread_notification_count: number;
                    notifications: PersistentNotificationItem[];
                    new_notifications: PersistentNotificationItem[];
                };

                if (data.server_time) {
                    lastSinceRef.current = data.server_time;
                }
                if (Array.isArray(data.notifications)) {
                    setNotifications(data.notifications);
                }
                if (typeof data.unread_notification_count === 'number') {
                    setUnreadCount(data.unread_notification_count);
                }

                if (Array.isArray(data.new_notifications)) {
                    for (const item of data.new_notifications) {
                        if (!seenNotifIdsRef.current.has(item.id)) {
                            seenNotifIdsRef.current.add(item.id);
                            showToast(
                                item.type || 'info',
                                item.title,
                                item.message,
                                4500,
                                `poll-${item.id}`
                            );
                        }
                    }
                    saveSeenPollIds(seenNotifIdsRef.current);
                }
            } catch {
                if (manual) {
                    setPollError('Gagal memuat pembaruan notifikasi. Periksa koneksi jaringan Anda.');
                }
            } finally {
                if (manual) {
                    setIsPolling(false);
                }
            }
        },
        [showToast]
    );

    // 30-second shared-hosting-friendly short polling
    useEffect(() => {
        const intervalId = window.setInterval(() => {
            void runShortPoll(false);
        }, 30000);

        return () => window.clearInterval(intervalId);
    }, [runShortPoll]);

    const handleMarkSingleRead = async (id: string) => {
        setMarkingReadId(id);
        try {
            const res = await fetch(`/notifications/${encodeURIComponent(id)}/read`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': getCsrfToken(),
                    'X-Requested-With': 'XMLHttpRequest',
                },
                credentials: 'same-origin',
            });
            if (!res.ok) {
                throw new Error('Failed');
            }
            const data = (await res.json()) as {
                unread_notification_count: number;
                notifications: PersistentNotificationItem[];
            };
            setNotifications(data.notifications);
            setUnreadCount(data.unread_notification_count);
        } catch {
            toastError('Gagal Memperbarui Notifikasi', 'Status baca belum dapat disimpan ke server.');
        } finally {
            setMarkingReadId(null);
        }
    };

    const handleMarkAllRead = async () => {
        if (unreadCount === 0) {
            return;
        }
        setMarkingAll(true);
        try {
            const res = await fetch('/notifications/read-all', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': getCsrfToken(),
                    'X-Requested-With': 'XMLHttpRequest',
                },
                credentials: 'same-origin',
            });
            if (!res.ok) {
                throw new Error('Failed');
            }
            const data = (await res.json()) as {
                unread_notification_count: number;
                notifications: PersistentNotificationItem[];
            };
            setNotifications(data.notifications);
            setUnreadCount(data.unread_notification_count);
            toastSuccess('Semua Notifikasi Dibaca', 'Daftar notifikasi telah diperbarui.');
        } catch {
            toastError('Gagal Memperbarui', 'Tidak dapat menandai semua notifikasi saat ini.');
        } finally {
            setMarkingAll(false);
        }
    };

    const pathname = url.split('?')[0] || '/';

    const createForm = useForm({
        title: '',
        platform: 'instagram' as 'instagram' | 'youtube' | 'tiktok' | 'facebook' | 'x',
        format: 'reels_shorts' as 'reels_shorts' | 'carousel' | 'single_image',
        pillar: 'edukasi' as 'edukasi' | 'promosi' | 'event' | 'pengumuman' | 'hiburan',
        publish_date: '',
        caption: '',
        status: 'todo',
        redirect_to: 'planner',
    });

    const navGroups: NavGroupConfig[] = useMemo(
        () => [
            {
                id: 'overview',
                label: 'Overview',
                items: [
                    {
                        href: '/',
                        matchHref: ['/', '/dashboard'],
                        label: 'Dashboard',
                        icon: LayoutDashboard,
                    },
                    {
                        href: '/incoming',
                        matchHref: ['/incoming'],
                        label: 'Incoming HALO APU',
                        icon: ArrowLeftRight,
                        badge: props.workspaceBadges?.incoming ?? 5,
                        badgeTone: 'amber',
                    },
                ],
            },
            {
                id: 'workflow',
                label: 'Content Workflow',
                items: [
                    {
                        href: '/content',
                        matchHref: ['/content', '/planner'],
                        label: 'Content Planner',
                        icon: TableProperties,
                        badge: props.workspaceBadges?.reviewApproval || undefined,
                        badgeTone: 'primary',
                    },
                    {
                        href: '/calendar',
                        matchHref: ['/calendar'],
                        label: 'Calendar',
                        icon: Calendar,
                    },
                ],
            },
            {
                id: 'distribution',
                label: 'Distribution & Insights',
                items: [
                    {
                        href: '/publishing',
                        matchHref: ['/publishing'],
                        label: 'Publishing & Opt.',
                        icon: Send,
                        badge: props.workspaceBadges?.readyToPublish || undefined,
                        badgeTone: 'teal',
                    },
                    {
                        href: '/instagram/comments',
                        matchHref: ['/instagram/comments'],
                        label: 'IG Comments',
                        icon: MessageCircle,
                        badge: props.workspaceBadges?.unrepliedComments || undefined,
                        badgeTone: 'amber',
                    },
                    {
                        href: '/report',
                        matchHref: ['/report', '/analytics'],
                        label: 'Performance Report',
                        icon: TrendingUp,
                    },
                ],
            },
            {
                id: 'creative',
                label: 'Creative Resources',
                items: [
                    {
                        href: '/studio',
                        matchHref: ['/studio'],
                        label: 'Script Studio',
                        icon: FileText,
                    },
                    {
                        href: '/grid',
                        matchHref: ['/grid'],
                        label: 'Grid Drafting',
                        icon: Grid3x3,
                    },
                    {
                        href: '/resources',
                        matchHref: ['/resources'],
                        label: 'Resource Library',
                        icon: BookOpen,
                    },
                    {
                        href: '/assets',
                        matchHref: ['/assets'],
                        label: 'Visual Assets',
                        icon: ImageIcon,
                    },
                ],
            },
            {
                id: 'collaboration',
                label: 'Collaboration',
                items: [
                    {
                        href: '/team',
                        matchHref: ['/team'],
                        label: 'Team & Integration',
                        icon: Users,
                    },
                ],
            },
            {
                id: 'administration',
                label: 'Administration',
                items: [
                    {
                        href: '/settings',
                        matchHref: ['/settings'],
                        label: 'Settings',
                        icon: Settings,
                        visible: can.manageSettings,
                    },
                    {
                        href: '/trash',
                        matchHref: ['/trash'],
                        label: 'Trash',
                        icon: Trash2,
                    },
                ],
            },
        ],
        [can.manageSettings, props.workspaceBadges]
    );

    const isCurrentActive = (matches: string[]) => {
        if ((pathname === '/' || pathname === '/dashboard') && matches.includes('/')) {
            return true;
        }
        return matches.some((path) => path !== '/' && pathname.startsWith(path));
    };

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createForm.post('/planner/items', {
            preserveScroll: false,
            onSuccess: () => {
                setCreateModalOpen(false);
                createForm.reset();
            },
            onError: () => {
                toastError('Validasi Form Gagal', 'Mohon periksa kembali kolom yang ditandai merah.');
            },
        });
    };

    const handleSwitchRole = (role: WorkspaceUser['role']) => {
        if (role === currentUser.role) {
            return;
        }
        router.post(
            '/workspace/role',
            { role },
            {
                preserveScroll: true,
            }
        );
    };

    const filteredNotifications = useMemo(() => {
        if (notifFilter === 'unread') {
            return notifications.filter((n) => !n.readAt);
        }
        return notifications;
    }, [notifications, notifFilter]);

    const renderSidebarContent = (pillPrefix: string, isMobile = false, isCollapsed = false) => (
        <Tooltip.Provider delayDuration={120}>
            {/* Compact Operational Brand Header */}
            <div
                className={cn(
                    'h-16 border-b border-[var(--md-sys-color-outline-variant)] flex items-center shrink-0 transition-all duration-200',
                    isCollapsed ? 'px-2.5 justify-between gap-1' : 'px-4 justify-between gap-2'
                )}
            >
                <Link
                    href="/"
                    onClick={() => isMobile && setMobileMenuOpen(false)}
                    aria-label="SPARC Dashboard"
                    className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] min-w-0 flex items-center shrink-0"
                >
                    {isCollapsed ? (
                        <SparcLogo size="sm" iconOnly />
                    ) : (
                        <SparcLogo size="sm" />
                    )}
                </Link>
                <div className="flex items-center gap-1.5 shrink-0">
                    {!isMobile && (
                        <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                                <button
                                    type="button"
                                    onClick={toggleSidebarCollapsed}
                                    aria-label={isCollapsed ? 'Perluas menu sidebar' : 'Ciutkan sidebar ke mode ringkas'}
                                    title={isCollapsed ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
                                    className="p-1.5 rounded-xl text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/60 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] transition-colors shrink-0"
                                >
                                    {isCollapsed ? (
                                        <ChevronRight className="w-4 h-4" />
                                    ) : (
                                        <ChevronLeft className="w-4 h-4" />
                                    )}
                                </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                                <Tooltip.Content
                                    side="right"
                                    sideOffset={10}
                                    className="z-[80] px-2.5 py-1.5 rounded-xl bg-[#0F172A] dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-semibold shadow-md select-none"
                                >
                                    {isCollapsed ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
                                    <Tooltip.Arrow className="fill-[#0F172A] dark:fill-slate-100" />
                                </Tooltip.Content>
                            </Tooltip.Portal>
                        </Tooltip.Root>
                    )}
                    {isMobile && (
                        <button
                            type="button"
                            onClick={() => setMobileMenuOpen(false)}
                            aria-label="Tutup menu navigasi"
                            className="p-1.5 rounded-xl text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)] cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Operational Navigation */}
            <nav
                aria-label="Menu Utama"
                className={cn(
                    'flex-1 overflow-y-auto',
                    isCollapsed ? 'py-3 px-2 space-y-1.5 flex flex-col items-center' : 'py-3 px-3 space-y-1'
                )}
            >
                {navGroups.map((group, groupIdx) => {
                    const visibleItems = group.items.filter((i) => i.visible !== false);
                    if (visibleItems.length === 0) {
                        return null;
                    }

                    return (
                        <div key={group.id} className="w-full space-y-1">
                            {groupIdx > 0 && (
                                <div
                                    aria-hidden="true"
                                    className={cn(
                                        'h-px bg-[var(--md-sys-color-outline-variant)]/60 my-2 shrink-0',
                                        isCollapsed ? 'w-6 mx-auto' : 'w-full'
                                    )}
                                />
                            )}
                            {!isCollapsed && (
                                <div className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--md-sys-color-on-surface-muted)]/75 select-none">
                                    {group.label}
                                </div>
                            )}

                            {visibleItems.map((item) => {
                                const Icon = item.icon;
                                const active = isCurrentActive(item.matchHref);

                                if (isCollapsed) {
                                    return (
                                        <Tooltip.Root key={item.href}>
                                            <Tooltip.Trigger asChild>
                                                <Link
                                                    href={item.href}
                                                    aria-label={item.label}
                                                    aria-current={active ? 'page' : undefined}
                                                    className={cn(
                                                        'relative w-10 h-10 mx-auto rounded-xl flex items-center justify-center transition-colors select-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] shrink-0 group',
                                                        active
                                                            ? 'text-[var(--md-sys-color-on-primary-container)] font-bold'
                                                            : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]'
                                                    )}
                                                >
                                                    {active && (
                                                        <motion.span
                                                            layoutId={`${pillPrefix}-active-nav`}
                                                            transition={MD3_SPRING.indicator}
                                                            className="absolute inset-0 rounded-xl bg-[var(--md-sys-color-primary-container)]"
                                                        />
                                                    )}
                                                    <Icon
                                                        className={cn(
                                                            'relative z-10 w-4 h-4 shrink-0 transition-colors',
                                                            active
                                                                ? 'text-[var(--md-sys-color-primary)]'
                                                                : 'text-[var(--md-sys-color-on-surface-muted)] group-hover:text-[var(--md-sys-color-on-surface)]'
                                                        )}
                                                    />
                                                    {typeof item.badge === 'number' && item.badge > 0 && (
                                                        <span
                                                            className={cn(
                                                                'sparc-code-id absolute -top-1 -right-1 z-20 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center ring-2 ring-[var(--md-sys-color-surface)]',
                                                                item.badgeTone === 'amber'
                                                                    ? 'bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]'
                                                                    : item.badgeTone === 'teal'
                                                                      ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]'
                                                                      : 'bg-[var(--md-sys-color-primary-filled)] text-white'
                                                            )}
                                                        >
                                                            {item.badge}
                                                        </span>
                                                    )}
                                                </Link>
                                            </Tooltip.Trigger>
                                            <Tooltip.Portal>
                                                <Tooltip.Content
                                                    side="right"
                                                    sideOffset={10}
                                                    className="z-[80] px-2.5 py-1.5 rounded-xl bg-[#0F172A] dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-semibold shadow-md select-none flex items-center gap-2"
                                                >
                                                    <span>{item.label}</span>
                                                    {typeof item.badge === 'number' && item.badge > 0 && (
                                                        <span className="px-1.5 py-0.2 rounded-full bg-white/20 dark:bg-slate-900/15 text-[10px] font-bold">
                                                            {item.badge}
                                                        </span>
                                                    )}
                                                    <Tooltip.Arrow className="fill-[#0F172A] dark:fill-slate-100" />
                                                </Tooltip.Content>
                                            </Tooltip.Portal>
                                        </Tooltip.Root>
                                    );
                                }

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => isMobile && setMobileMenuOpen(false)}
                                        aria-current={active ? 'page' : undefined}
                                        className={cn(
                                            'relative h-10 w-full px-3 rounded-xl flex items-center justify-between transition-colors select-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] group',
                                            active
                                                ? 'text-[var(--md-sys-color-on-primary-container)] font-bold'
                                                : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]'
                                        )}
                                    >
                                        {active && (
                                            <motion.span
                                                layoutId={`${pillPrefix}-active-nav`}
                                                transition={MD3_SPRING.indicator}
                                                className="absolute inset-0 rounded-xl bg-[var(--md-sys-color-primary-container)]"
                                            />
                                        )}
                                        <div className="relative z-10 flex items-center gap-3 min-w-0">
                                            <div className="w-5 h-5 flex items-center justify-center shrink-0">
                                                <Icon
                                                    className={cn(
                                                        'w-4 h-4 shrink-0 transition-colors',
                                                        active
                                                            ? 'text-[var(--md-sys-color-primary)]'
                                                            : 'text-[var(--md-sys-color-on-surface-muted)] group-hover:text-[var(--md-sys-color-on-surface)]'
                                                    )}
                                                />
                                            </div>
                                            <span className="truncate text-xs">{item.label}</span>
                                        </div>
                                        {typeof item.badge === 'number' && item.badge > 0 && (
                                            <span
                                                className={cn(
                                                    'sparc-code-id relative z-10 px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[18px] text-center',
                                                    item.badgeTone === 'amber'
                                                        ? 'bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]'
                                                        : item.badgeTone === 'teal'
                                                          ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]'
                                                          : 'bg-[var(--md-sys-color-primary-filled)] text-white'
                                                )}
                                            >
                                                {item.badge}
                                            </span>
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    );
                })}
            </nav>

            {/* Footer Active Persona & Workspace Preferences */}
            <div
                className={cn(
                    'border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]/50 shrink-0',
                    isCollapsed
                        ? 'p-2.5 flex flex-col items-center gap-2'
                        : 'p-3 flex items-center justify-between gap-2'
                )}
            >
                {isCollapsed ? (
                    <>
                        <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                                <div className="relative shrink-0 cursor-pointer">
                                    <div className="w-8 h-8 rounded-full overflow-hidden border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)]">
                                        <img
                                            src={currentUser.avatar}
                                            alt={currentUser.name}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <span className="absolute bottom-0 right-0 w-2 h-2 bg-[#057A55] border border-[var(--md-sys-color-surface)] rounded-full" />
                                </div>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                                <Tooltip.Content
                                    side="right"
                                    sideOffset={10}
                                    className="z-[80] px-2.5 py-1.5 rounded-xl bg-[#0F172A] dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-semibold shadow-md select-none"
                                >
                                    <p className="font-bold">{currentUser.name}</p>
                                    <p className="text-[10px] opacity-80">{currentUser.roleLabel}</p>
                                    <Tooltip.Arrow className="fill-[#0F172A] dark:fill-slate-100" />
                                </Tooltip.Content>
                            </Tooltip.Portal>
                        </Tooltip.Root>
                        <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                                <button
                                    type="button"
                                    onClick={() => setWorkspacePrefsOpen(true)}
                                    aria-label="Pengaturan Workspace"
                                    className="p-1.5 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] rounded-xl cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] transition-colors"
                                >
                                    <FolderKanban className="w-4 h-4" />
                                </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                                <Tooltip.Content
                                    side="right"
                                    sideOffset={10}
                                    className="z-[80] px-2.5 py-1.5 rounded-xl bg-[#0F172A] dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-semibold shadow-md select-none"
                                >
                                    Pengaturan Workspace
                                    <Tooltip.Arrow className="fill-[#0F172A] dark:fill-slate-100" />
                                </Tooltip.Content>
                            </Tooltip.Portal>
                        </Tooltip.Root>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative shrink-0">
                                <div className="w-8 h-8 rounded-full overflow-hidden border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)]">
                                    <img
                                        src={currentUser.avatar}
                                        alt={currentUser.name}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <span className="absolute bottom-0 right-0 w-2 h-2 bg-[#057A55] border border-[var(--md-sys-color-surface)] rounded-full" />
                            </div>
                            <div className="truncate">
                                <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate leading-tight">
                                    {currentUser.name}
                                </p>
                                <p className="text-[10px] text-[var(--md-sys-color-on-surface-muted)] font-medium truncate">
                                    {currentUser.roleLabel}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setWorkspacePrefsOpen(true)}
                            aria-label="Pengaturan Workspace"
                            title="Preferensi Tampilan & Tema"
                            className="md-btn-tactile p-2 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] rounded-xl cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]"
                        >
                            <FolderKanban className="w-4 h-4" />
                        </button>
                    </>
                )}
            </div>
        </Tooltip.Provider>
    );

    return (
        <LayoutSlotContext.Provider
            value={{
                insidePersistentShell: true,
                sidebarCollapsed,
                titleSlot,
                centerSlot,
                actionsSlot,
            }}
        >
            <InertiaFlashListener />

            <div className="min-h-screen bg-[var(--md-sys-color-background)] text-[var(--md-sys-color-on-background)] font-sans antialiased flex flex-col md:flex-row">
                {/* Mobile Sticky Top Header Bar */}
                <div className="md:hidden flex items-center justify-between px-4 h-14 bg-[var(--md-sys-color-surface)]/95 dark:bg-[var(--md-sys-color-surface-container-low)]/95 backdrop-blur-md border-b border-[var(--md-sys-color-outline-variant)] sticky top-0 z-30">
                    <Link href="/" className="outline-none">
                        <SparcLogo size="sm" />
                    </Link>
                    <div className="flex items-center gap-1.5">
                        <ThemeSwitcher compact />
                        {can.editContent && (
                            <button
                                type="button"
                                onClick={() => setCreateModalOpen(true)}
                                aria-label="Buat Item Konten Baru"
                                title="Create Item"
                                className="md-btn-tactile p-2 rounded-xl bg-[var(--md-sys-color-primary-filled)] text-white shadow-[var(--md-elevation-1)] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setNotifSheetOpen(true)}
                            aria-label={`Pusat Notifikasi (${unreadCount} belum dibaca)`}
                            className="md-btn-tactile p-2 rounded-xl text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] relative cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]"
                        >
                            <Bell className="w-4 h-4" />
                            {unreadCount > 0 && (
                                <span className="sparc-code-id absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--md-sys-color-error)] text-[var(--md-sys-color-on-error)] text-[10px] font-bold flex items-center justify-center">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setMobileMenuOpen((prev) => !prev)}
                            aria-label={mobileMenuOpen ? 'Tutup menu' : 'Buka menu'}
                            aria-expanded={mobileMenuOpen}
                            className="md-btn-tactile p-2 rounded-xl text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]"
                        >
                            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </button>
                    </div>
                </div>

                {/* Desktop Sticky Sidebar (Collapsible Icon-Rail <-> Full 6-Group Sidebar) */}
                <aside
                    className={cn(
                        'hidden md:flex md:flex-col md:shrink-0 md:sticky md:top-0 md:h-dvh bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container-low)] border-r border-[var(--md-sys-color-outline-variant)]/80 z-30 transition-[width] duration-200 ease-out',
                        sidebarCollapsed ? 'md:w-[72px]' : 'md:w-60 lg:w-64'
                    )}
                >
                    {renderSidebarContent('desktop', false, sidebarCollapsed)}
                </aside>

                {/* Animated Mobile Navigation Drawer */}
                <AnimatePresence>
                    {mobileMenuOpen && (
                        <>
                            <motion.div
                                key="mobile-backdrop"
                                variants={backdropVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                className="fixed inset-0 bg-[var(--md-sys-color-scrim)] z-40 md:hidden backdrop-blur-[2px]"
                                onClick={() => setMobileMenuOpen(false)}
                            />
                            <motion.aside
                                key="mobile-drawer"
                                initial={{ x: '-100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '-100%' }}
                                transition={{ duration: 0.22, ease: MD3_EASING.decelerate }}
                                className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container-low)] border-r border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-4)] flex flex-col md:hidden"
                            >
                                {renderSidebarContent('mobile', true)}
                            </motion.aside>
                        </>
                    )}
                </AnimatePresence>

                {/* Main Operational Column */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Desktop Sticky Editorial & Bento Topbar */}
                    <header className="hidden md:flex items-center justify-between gap-4 h-16 px-6 lg:px-8 bg-[var(--md-sys-color-surface)]/92 dark:bg-[var(--md-sys-color-surface-container-low)]/92 backdrop-blur-md border-b border-[var(--md-sys-color-outline-variant)]/80 sticky top-0 z-20">
                        <div className="min-w-0 flex items-center gap-3 flex-1">
                            <div ref={setTitleSlot} className="min-w-0 empty:hidden" />
                        </div>

                        {/* Center Capsule Slot (Used by Dashboard Period Pills like Panze Topbar) */}
                        <div ref={setCenterSlot} className="flex items-center justify-center shrink-0 empty:hidden" />

                        <div className="flex items-center justify-end gap-2 shrink-0">
                            {/* Page-Specific Contextual Actions */}
                            <div ref={setActionsSlot} className="flex items-center gap-2 shrink-0 empty:hidden" />

                            {/* Global + Create Item Button (Role-Aware) */}
                            {can.editContent && (
                                <button
                                    type="button"
                                    onClick={() => setCreateModalOpen(true)}
                                    aria-label="Buat Item Konten Baru"
                                    title="Buat Konten Baru"
                                    className="panze-icon-btn cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            )}


                            {/* Persistent Notification Bell with Live Unread Count */}
                            <button
                                type="button"
                                onClick={() => setNotifSheetOpen(true)}
                                aria-label="Pusat Notifikasi"
                                title={`Pusat Notifikasi (${unreadCount} belum dibaca)`}
                                className="panze-icon-btn relative cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]"
                            >
                                <Bell className="w-4 h-4" />
                                {unreadCount > 0 && (
                                    <span
                                        data-testid="unread-notification-badge"
                                        className="sparc-code-id absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--md-sys-color-error)] text-[var(--md-sys-color-on-error)] text-[10px] font-bold flex items-center justify-center ring-2 ring-[var(--md-sys-color-surface)]"
                                    >
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                )}
                            </button>

                            {/* Theme Selector */}
                            <ThemeSwitcher compact />

                            {/* Workspace Appearance / Preferences Button */}
                            <button
                                type="button"
                                onClick={() => setWorkspacePrefsOpen(true)}
                                aria-label="Pengaturan Workspace"
                                title="Preferensi Tampilan & Tema"
                                className="panze-icon-btn cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]"
                            >
                                <Settings className="w-4 h-4" />
                            </button>

                            {/* User & Role Switcher Dropdown Menu (Panze Profile Trigger) */}
                            <DropdownMenu.Root>
                                <DropdownMenu.Trigger asChild>
                                    <button
                                        type="button"
                                        aria-label={`Menu Pengguna ${currentUser.name} (${currentUser.roleLabel})`}
                                        className="md-btn-tactile flex items-center gap-2.5 pl-1 pr-2.5 py-1 rounded-full hover:bg-[var(--md-sys-color-surface-container)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] cursor-pointer transition-colors"
                                    >
                                        <img
                                            src={currentUser.avatar}
                                            alt={currentUser.name}
                                            className="w-9 h-9 rounded-full object-cover border border-[var(--md-sys-color-outline-variant)] shadow-2xs"
                                        />
                                        <div className="hidden xl:block text-left leading-tight">
                                            <div className="text-xs font-bold text-[var(--md-sys-color-on-surface)] max-w-[120px] truncate">
                                                {currentUser.name}
                                            </div>
                                            <div className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                                {currentUser.roleLabel}
                                            </div>
                                        </div>
                                        <ChevronDown className="w-3.5 h-3.5 text-[var(--md-sys-color-on-surface-muted)] hidden xl:block" />
                                    </button>
                                </DropdownMenu.Trigger>

                                <DropdownMenu.Portal>
                                    <DropdownMenu.Content align="end" sideOffset={8} asChild>
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.97, y: -4 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            transition={{ duration: 0.15, ease: MD3_EASING.decelerate }}
                                            className="z-[70] w-72 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] p-2 shadow-[var(--md-elevation-3)] outline-none"
                                        >
                                            <div className="px-2.5 py-2 border-b border-[var(--md-sys-color-outline-variant)] mb-1.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                                                        {currentUser.name}
                                                    </span>
                                                    <RoleBadge role={currentUser.role} />
                                                </div>
                                                <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] truncate mt-0.5">
                                                    {currentUser.email}
                                                </p>
                                            </div>

                                            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-muted)] flex items-center gap-1.5">
                                                <Shield className="w-3 h-3" /> Simulasi Peran RBAC (6 Role)
                                            </div>

                                            <div className="space-y-0.5">
                                                {personas.map((persona) => {
                                                    const isSelected = persona.role === currentUser.role;
                                                    return (
                                                        <DropdownMenu.Item
                                                            key={persona.role}
                                                            onSelect={() => handleSwitchRole(persona.role)}
                                                            className={cn(
                                                                'flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs cursor-pointer select-none outline-none transition-colors',
                                                                isSelected
                                                                    ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] font-semibold'
                                                                    : 'text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)] focus:bg-[var(--md-sys-color-surface-container)]'
                                                            )}
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="truncate font-semibold leading-tight">
                                                                    {persona.roleLabel}
                                                                </div>
                                                                <div className="text-[10px] opacity-75 truncate">
                                                                    {persona.name}
                                                                </div>
                                                            </div>
                                                            {isSelected && (
                                                                <Check className="w-3.5 h-3.5 shrink-0 text-[var(--md-sys-color-primary)]" />
                                                            )}
                                                        </DropdownMenu.Item>
                                                    );
                                                })}

                                            <div className="pt-1.5 mt-1.5 border-t border-[var(--md-sys-color-outline-variant)]">
                                                <DropdownMenu.Item asChild>
                                                    <Link
                                                        method="post"
                                                        href="/logout"
                                                        as="button"
                                                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-error-container)]/40 focus:bg-[var(--md-sys-color-error-container)]/40 cursor-pointer select-none outline-none font-semibold transition-colors"
                                                    >
                                                        <LogOut className="w-3.5 h-3.5 shrink-0" />
                                                        <span>Keluar dari Workspace</span>
                                                    </Link>
                                                </DropdownMenu.Item>
                                            </div>
                                            </div>
                                        </motion.div>
                                    </DropdownMenu.Content>
                                </DropdownMenu.Portal>
                            </DropdownMenu.Root>
                        </div>
                    </header>

                    {/* Page Canvas with Isolated MD3 Exit + Enter Transitions */}
                    <main className="flex-1 p-4 sm:p-6 lg:p-7">
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={pathname}
                                variants={pageTransitionVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                className="w-full max-w-[1600px] mx-auto"
                            >
                                <PresenceContext.Provider value={null}>
                                    <LayoutGroup id={`page-${pathname}`}>
                                        {children}
                                    </LayoutGroup>
                                </PresenceContext.Provider>
                            </motion.div>
                        </AnimatePresence>
                    </main>
                </div>

                {/* Global Quick Create Content Item Modal */}
                <Modal
                    isOpen={createModalOpen}
                    onClose={() => setCreateModalOpen(false)}
                    title="Create New Content Item"
                    description="Tambahkan rencana konten baru ke alur produksi SPARC"
                    maxWidth="lg"
                >
                    <form onSubmit={handleCreateSubmit} noValidate className="space-y-4">
                        <Input
                            label="Judul Konten"
                            placeholder="Contoh: Panduan 3 Langkah Permohonan Informasi Publik"
                            value={createForm.data.title}
                            onChange={(e) => createForm.setData('title', e.target.value)}
                            error={createForm.errors.title}
                            helperText="Minimal 3 karakter agar mudah ditelusuri pada Content Plan."
                            required
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Select
                                label="Kanal Utama"
                                value={createForm.data.platform}
                                onChange={(e) =>
                                    createForm.setData(
                                        'platform',
                                        e.target.value as typeof createForm.data.platform
                                    )
                                }
                                error={createForm.errors.platform}
                            >
                                <option value="instagram">Instagram</option>
                                <option value="youtube">YouTube</option>
                                <option value="tiktok">TikTok</option>
                                <option value="facebook">Facebook</option>
                                <option value="x">X (Twitter)</option>
                            </Select>

                            <Select
                                label="Format Konten"
                                value={createForm.data.format}
                                onChange={(e) =>
                                    createForm.setData(
                                        'format',
                                        e.target.value as typeof createForm.data.format
                                    )
                                }
                                error={createForm.errors.format}
                            >
                                <option value="reels_shorts">Reels / Shorts (Video)</option>
                                <option value="carousel">Carousel Feed</option>
                                <option value="single_image">Single Image Feed</option>
                            </Select>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Select
                                label="Pilar Konten"
                                value={createForm.data.pillar}
                                onChange={(e) =>
                                    createForm.setData(
                                        'pillar',
                                        e.target.value as typeof createForm.data.pillar
                                    )
                                }
                                error={createForm.errors.pillar}
                            >
                                <option value="edukasi">Edukasi</option>
                                <option value="promosi">Program / Promosi</option>
                                <option value="event">Event & Liputan</option>
                                <option value="pengumuman">Kelembagaan / Pengumuman</option>
                                <option value="hiburan">Inspirasi / Humanis</option>
                            </Select>

                            <Input
                                label="Target Tanggal Tayang"
                                type="date"
                                value={createForm.data.publish_date}
                                onChange={(e) => createForm.setData('publish_date', e.target.value)}
                                error={createForm.errors.publish_date}
                            />
                        </div>

                        <Textarea
                            label="Ringkasan Brief / Copywriting Awal"
                            rows={3}
                            placeholder="Tulis objektif komunikasi atau draf caption..."
                            value={createForm.data.caption}
                            onChange={(e) => createForm.setData('caption', e.target.value)}
                            error={createForm.errors.caption}
                        />

                        <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2.5">
                            <Button
                                variant="secondary"
                                size="md"
                                type="button"
                                disabled={createForm.processing}
                                onClick={() => setCreateModalOpen(false)}
                            >
                                Batal
                            </Button>
                            <Button
                                variant="primary"
                                size="md"
                                type="submit"
                                isLoading={createForm.processing}
                                className="font-semibold"
                            >
                                Tambah ke Planner
                            </Button>
                        </div>
                    </form>
                </Modal>

                {/* Persistent Database-Style Notification Drawer (Separated from Transient Toast) */}
                <Sheet
                    isOpen={notifSheetOpen}
                    onClose={() => setNotifSheetOpen(false)}
                    title="Pusat Notifikasi"
                    description="Riwayat pemberitahuan alur persetujuan, tenggat produksi, dan sinkronisasi HALO APU"
                    width="md"
                >
                    <div className="space-y-4">
                        {/* Controls Bar: Filter & Mark All Read */}
                        <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--md-sys-color-outline-variant)]">
                            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]">
                                <button
                                    type="button"
                                    onClick={() => setNotifFilter('all')}
                                    className={cn(
                                        'px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
                                        notifFilter === 'all'
                                            ? 'bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] shadow-2xs'
                                            : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                                    )}
                                >
                                    Semua ({notifications.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setNotifFilter('unread')}
                                    className={cn(
                                        'px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
                                        notifFilter === 'unread'
                                            ? 'bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] shadow-2xs'
                                            : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                                    )}
                                >
                                    Belum Dibaca ({unreadCount})
                                </button>
                            </div>

                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => void runShortPoll(true)}
                                    disabled={isPolling}
                                    aria-label="Segarkan notifikasi"
                                    title="Periksa pembaruan sekarang"
                                    className="p-1.5 rounded-lg text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] cursor-pointer disabled:opacity-50"
                                >
                                    <RefreshCw className={cn('w-3.5 h-3.5', isPolling && 'animate-spin')} />
                                </button>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={unreadCount === 0 || markingAll}
                                    isLoading={markingAll}
                                    icon={<CheckCheck className="w-3.5 h-3.5" />}
                                    onClick={() => void handleMarkAllRead()}
                                    className="text-xs px-2.5"
                                >
                                    Tandai Semua Dibaca
                                </Button>
                            </div>
                        </div>

                        {/* Error Recovery Banner */}
                        {pollError && (
                            <div className="p-3 rounded-xl bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] text-xs flex items-center justify-between gap-2">
                                <span>{pollError}</span>
                                <Button size="sm" variant="secondary" onClick={() => void runShortPoll(true)}>
                                    Coba Lagi
                                </Button>
                            </div>
                        )}

                        {/* Notification Items */}
                        {filteredNotifications.length === 0 ? (
                            <div className="py-12 text-center space-y-2 rounded-2xl border border-dashed border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]/50 px-4">
                                <Bell className="w-7 h-7 text-[var(--md-sys-color-on-surface-muted)] mx-auto" />
                                <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                                    {notifFilter === 'unread'
                                        ? 'Tidak ada notifikasi belum dibaca'
                                        : 'Belum ada riwayat notifikasi'}
                                </p>
                                <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                    Pemberitahuan persetujuan dan tenggat produksi akan muncul secara otomatis.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {filteredNotifications.map((n) => {
                                    const isUnread = !n.readAt;
                                    const Icon =
                                        n.type === 'error'
                                            ? AlertCircle
                                            : n.type === 'warning'
                                              ? AlertTriangle
                                              : n.type === 'success'
                                                ? CheckCircle2
                                                : Info;
                                    const iconTone =
                                        n.type === 'error'
                                            ? 'text-[var(--md-sys-color-error)]'
                                            : n.type === 'warning'
                                              ? 'text-[var(--md-sys-color-tertiary)]'
                                              : n.type === 'success'
                                                ? 'text-[var(--md-sys-color-secondary)]'
                                                : 'text-[var(--md-sys-color-primary)]';

                                    return (
                                        <div
                                            key={n.id}
                                            className={cn(
                                                'p-3.5 rounded-2xl border transition-colors space-y-2',
                                                isUnread
                                                    ? 'bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container-high)] border-[var(--md-sys-color-primary)]/35 shadow-[var(--md-elevation-1)]'
                                                    : 'bg-[var(--md-sys-color-surface-container-low)]/70 border-[var(--md-sys-color-outline-variant)] opacity-85'
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-2.5">
                                                <div className="flex items-start gap-2.5 min-w-0">
                                                    <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', iconTone)} />
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] leading-snug">
                                                                {n.title}
                                                            </h4>
                                                            {isUnread && (
                                                                <span
                                                                    aria-label="Belum dibaca"
                                                                    className="w-1.5 h-1.5 rounded-full bg-[var(--md-sys-color-primary)] shrink-0"
                                                                />
                                                            )}
                                                        </div>
                                                        <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed mt-0.5">
                                                            {n.message}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className="text-[10px] text-[var(--md-sys-color-on-surface-muted)] whitespace-nowrap shrink-0">
                                                    {n.timeLabel || 'Baru'}
                                                </span>
                                            </div>

                                            <div className="flex items-center justify-end gap-2 pt-1">
                                                {n.actionUrl && (
                                                    <Link
                                                        href={n.actionUrl}
                                                        onClick={() => {
                                                            if (isUnread) {
                                                                void handleMarkSingleRead(n.id);
                                                            }
                                                            setNotifSheetOpen(false);
                                                        }}
                                                        className="text-[11px] font-semibold text-[var(--md-sys-color-primary)] hover:underline"
                                                    >
                                                        Buka Modul
                                                    </Link>
                                                )}
                                                {isUnread && (
                                                    <button
                                                        type="button"
                                                        disabled={markingReadId === n.id}
                                                        onClick={() => void handleMarkSingleRead(n.id)}
                                                        className="text-[11px] font-medium text-[var(--md-sys-color-on-surface-muted)] hover:text-[var(--md-sys-color-on-surface)] cursor-pointer disabled:opacity-50"
                                                    >
                                                        {markingReadId === n.id ? 'Menyimpan...' : 'Tandai dibaca'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </Sheet>

                {/* Workspace Display & Theme Preferences Modal */}
                <Modal
                    isOpen={workspacePrefsOpen}
                    onClose={() => setWorkspacePrefsOpen(false)}
                    title="Preferensi Tampilan & Ruang Kerja"
                    description="Sesuaikan mode warna Material Design 3 dan peran simulasi Anda"
                    maxWidth="md"
                >
                    <div className="space-y-5">
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                                Tema Antarmuka (Light / Dark / System)
                            </label>
                            <ThemeSegmentedControl />
                            <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                Pilihan tersimpan otomatis dan dipulihkan sebelum halaman dirender (tanpa kedipan putih).
                            </p>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] flex items-center justify-between gap-3">
                            <div>
                                <div className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                                    Sesi Aktif: {currentUser.name}
                                </div>
                                <div className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] mt-0.5">
                                    Gunakan menu profil di kanan atas untuk menguji keenam peran RBAC.
                                </div>
                            </div>
                            <RoleBadge role={currentUser.role} />
                        </div>

                        <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-between gap-2">
                            {can.manageSettings ? (
                                <Link
                                    href="/settings"
                                    onClick={() => setWorkspacePrefsOpen(false)}
                                    className="text-xs font-semibold text-[var(--md-sys-color-primary)] hover:underline"
                                >
                                    Buka Pengaturan Sistem Lengkap →
                                </Link>
                            ) : (
                                <span className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                    Polling singkat aktif setiap 30 detik
                                </span>
                            )}
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => setWorkspacePrefsOpen(false)}
                            >
                                Selesai
                            </Button>
                        </div>
                    </div>
                </Modal>
            </div>
        </LayoutSlotContext.Provider>
    );
};

/**
 * Page-level layout connector:
 * - Portals contextual page title, subtitle, and actions into the persistent desktop Topbar
 * - Renders a responsive mobile header (< md) so touch devices retain access to page actions
 */
export const AppLayout: React.FC<AppLayoutProps> = ({
    children,
    title = 'Dashboard HUMAS',
    subtitle,
    headerCenter,
    hideTopbarTitle = false,
    actions,
}) => {
    const { insidePersistentShell, sidebarCollapsed, titleSlot, centerSlot, actionsSlot } =
        useContext(LayoutSlotContext);

    if (!insidePersistentShell) {
        return (
            <PersistentAppShell>
                <AppLayout
                    title={title}
                    subtitle={subtitle}
                    headerCenter={headerCenter}
                    hideTopbarTitle={hideTopbarTitle}
                    actions={actions}
                >
                    {children}
                </AppLayout>
            </PersistentAppShell>
        );
    }

    const titleNode = hideTopbarTitle ? (
        sidebarCollapsed ? (
            <Link
                href="/"
                className="inline-flex items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]"
            >
                <SparcLogo size="sm" />
            </Link>
        ) : (
            <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-muted)]">
                Workspace Operasional HUMAS
            </span>
        )
    ) : (
        <div className="min-w-0">
            <h1 className="text-base lg:text-lg font-bold text-[var(--md-sys-color-on-surface)] tracking-tight truncate">
                {title}
            </h1>
            {subtitle && (
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] truncate">
                    {subtitle}
                </p>
            )}
        </div>
    );

    return (
        <>
            {titleSlot && createPortal(titleNode, titleSlot)}
            {centerSlot &&
                headerCenter &&
                createPortal(
                    <LayoutGroup id="desktop-topbar-center">{headerCenter}</LayoutGroup>,
                    centerSlot
                )}
            {actionsSlot &&
                actions &&
                createPortal(
                    <LayoutGroup id="desktop-topbar-actions">{actions}</LayoutGroup>,
                    actionsSlot
                )}

            {/* Mobile Page Title / Period Controls Bar (< md) */}
            {!hideTopbarTitle && (
                <div className="md:hidden mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3.5 border-b border-[var(--md-sys-color-outline-variant)]">
                    <div>
                        <h1 className="text-base font-bold text-[var(--md-sys-color-on-surface)] tracking-tight">
                            {title}
                        </h1>
                        {subtitle && (
                            <p className="text-xs text-[var(--md-sys-color-on-surface-muted)] mt-0.5">
                                {subtitle}
                            </p>
                        )}
                    </div>
                    {actions && (
                        <LayoutGroup id="mobile-header-actions">
                            <div className="flex flex-wrap items-center gap-2">{actions}</div>
                        </LayoutGroup>
                    )}
                </div>
            )}
            {hideTopbarTitle && headerCenter && (
                <div className="md:hidden mb-4 flex items-center justify-start overflow-x-auto pb-1">
                    {headerCenter}
                </div>
            )}

            {children}
        </>
    );
};
