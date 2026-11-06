import React from 'react';
import {
    AlertOctagon,
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    Calendar,
    CheckCircle2,
    Clock,
    Compass,
    Eye,
    FileCheck2,
    Globe,
    Inbox,
    Layers,
    MessageCircle,
    Minus,
    PenTool,
    Send,
    Share2,
    Shield,
    UserCheck,
    Video,
} from 'lucide-react';
import { InstagramIcon, YoutubeIcon } from '@/Components/Icons';
import { cn } from '@/lib/utils';

/* ==========================================================================
   SPARC v3 — Centralized Operational Semantic Types & Visual Chips
   Strict Rule: Status != Priority != Social Platform != Content Pillar.
   Every indicator combines color tokens + shape + icon + text (never color alone).
   ========================================================================== */

export type WorkflowStatus =
    | 'inbox'
    | 'briefing'
    | 'todo'
    | 'in_progress'
    | 'review_approval'
    | 'ready_to_publish'
    | 'published';

export type CanonicalWorkflowStatus =
    | 'inbox'
    | 'briefing'
    | 'in_progress'
    | 'review_approval'
    | 'ready_to_publish'
    | 'published';

export type PriorityLevel = 'critical' | 'tinggi' | 'normal' | 'rendah';

export type SocialPlatform =
    | 'instagram'
    | 'tiktok'
    | 'youtube'
    | 'website'
    | 'whatsapp'
    | 'facebook'
    | 'x';

export type ContentPillarKey =
    | 'edukasi'
    | 'program'
    | 'fundraising'
    | 'inspirasi'
    | 'kelembagaan'
    | 'promosi'
    | 'event'
    | 'pengumuman'
    | 'hiburan';

export type UserRoleKey = 'admin' | 'manager' | 'planner' | 'creator' | 'publisher' | 'viewer';

export function normalizeWorkflowStatus(status?: string): CanonicalWorkflowStatus {
    switch (status) {
        case 'inbox':
        case 'incoming':
            return 'inbox';
        case 'briefing':
        case 'todo':
            return 'briefing';
        case 'in_progress':
        case 'production':
            return 'in_progress';
        case 'review_approval':
        case 'in_review':
            return 'review_approval';
        case 'ready_to_publish':
            return 'ready_to_publish';
        case 'published':
            return 'published';
        default:
            return 'inbox';
    }
}

export const WORKFLOW_STATUS_META: Record<
    CanonicalWorkflowStatus,
    {
        label: string;
        shortLabel: string;
        styleVars: React.CSSProperties;
        icon: React.ComponentType<{ className?: string }>;
    }
> = {
    inbox: {
        label: 'Inbox Request',
        shortLabel: 'Inbox',
        styleVars: {
            backgroundColor: 'var(--sparc-status-inbox-bg)',
            color: 'var(--sparc-status-inbox-fg)',
            borderColor: 'var(--sparc-status-inbox-bd)',
        },
        icon: Inbox,
    },
    briefing: {
        label: 'Briefing & Ideasi',
        shortLabel: 'Briefing',
        styleVars: {
            backgroundColor: 'var(--sparc-status-briefing-bg)',
            color: 'var(--sparc-status-briefing-fg)',
            borderColor: 'var(--sparc-status-briefing-bd)',
        },
        icon: Compass,
    },
    in_progress: {
        label: 'Produksi',
        shortLabel: 'Produksi',
        styleVars: {
            backgroundColor: 'var(--sparc-status-production-bg)',
            color: 'var(--sparc-status-production-fg)',
            borderColor: 'var(--sparc-status-production-bd)',
        },
        icon: PenTool,
    },
    review_approval: {
        label: 'Review',
        shortLabel: 'Review',
        styleVars: {
            backgroundColor: 'var(--sparc-status-review-bg)',
            color: 'var(--sparc-status-review-fg)',
            borderColor: 'var(--sparc-status-review-bd)',
        },
        icon: Eye,
    },
    ready_to_publish: {
        label: 'Siap Tayang',
        shortLabel: 'Siap Tayang',
        styleVars: {
            backgroundColor: 'var(--sparc-status-ready-bg)',
            color: 'var(--sparc-status-ready-fg)',
            borderColor: 'var(--sparc-status-ready-bd)',
        },
        icon: FileCheck2,
    },
    published: {
        label: 'Published',
        shortLabel: 'Published',
        styleVars: {
            backgroundColor: 'var(--sparc-status-published-bg)',
            color: 'var(--sparc-status-published-fg)',
            borderColor: 'var(--sparc-status-published-bd)',
        },
        icon: CheckCircle2,
    },
};

export const StatusChip: React.FC<{
    status: string;
    compact?: boolean;
    className?: string;
}> = ({ status, compact = false, className }) => {
    const canonical = normalizeWorkflowStatus(status);
    const meta = WORKFLOW_STATUS_META[canonical];
    const Icon = meta.icon;

    return (
        <span
            style={meta.styleVars}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap select-none',
                compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs',
                className
            )}
        >
            <Icon className="w-3 h-3 shrink-0" />
            <span>{compact ? meta.shortLabel : meta.label}</span>
        </span>
    );
};

export const PRIORITY_META: Record<
    PriorityLevel,
    {
        label: string;
        styleVars: React.CSSProperties;
        icon: React.ComponentType<{ className?: string }>;
    }
> = {
    critical: {
        label: 'Kritis',
        styleVars: {
            backgroundColor: 'var(--sparc-priority-critical-bg)',
            color: 'var(--sparc-priority-critical-fg)',
            borderColor: 'var(--sparc-priority-critical-bd)',
        },
        icon: AlertOctagon,
    },
    tinggi: {
        label: 'Tinggi',
        styleVars: {
            backgroundColor: 'var(--sparc-priority-high-bg)',
            color: 'var(--sparc-priority-high-fg)',
            borderColor: 'var(--sparc-priority-high-bd)',
        },
        icon: ArrowUp,
    },
    normal: {
        label: 'Normal',
        styleVars: {
            backgroundColor: 'var(--sparc-priority-normal-bg)',
            color: 'var(--sparc-priority-normal-fg)',
            borderColor: 'var(--sparc-priority-normal-bd)',
        },
        icon: Minus,
    },
    rendah: {
        label: 'Rendah',
        styleVars: {
            backgroundColor: 'var(--sparc-priority-low-bg)',
            color: 'var(--sparc-priority-low-fg)',
            borderColor: 'var(--sparc-priority-low-bd)',
        },
        icon: ArrowDown,
    },
};

export const PriorityBadge: React.FC<{
    priority?: string;
    compact?: boolean;
    className?: string;
}> = ({ priority = 'normal', compact = false, className }) => {
    const key: PriorityLevel =
        priority === 'critical' || priority === 'tinggi' || priority === 'rendah'
            ? priority
            : 'normal';
    const meta = PRIORITY_META[key];
    const Icon = meta.icon;

    return (
        <span
            style={meta.styleVars}
            title={`Prioritas: ${meta.label}`}
            className={cn(
                'inline-flex items-center gap-1 rounded-md border font-semibold whitespace-nowrap select-none',
                compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
                className
            )}
        >
            <Icon className="w-3 h-3 shrink-0" />
            <span>{meta.label}</span>
        </span>
    );
};

const PLATFORM_LABELS: Record<string, string> = {
    instagram: 'Instagram',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    website: 'Website',
    whatsapp: 'WhatsApp',
    facebook: 'Facebook',
    x: 'X',
};

export const PlatformChip: React.FC<{
    platform: string;
    format?: string;
    compact?: boolean;
    className?: string;
}> = ({ platform, format, compact = false, className }) => {
    const normalized = platform.toLowerCase();
    const label = PLATFORM_LABELS[normalized] || platform;

    const renderIcon = () => {
        if (normalized === 'instagram') {
            return <InstagramIcon className="w-3 h-3 shrink-0 text-pink-600 dark:text-pink-400" />;
        }
        if (normalized === 'youtube') {
            return <YoutubeIcon className="w-3 h-3 shrink-0 text-red-600 dark:text-red-400" />;
        }
        if (normalized === 'tiktok') {
            return <Video className="w-3 h-3 shrink-0 text-[var(--md-sys-color-on-surface)]" />;
        }
        if (normalized === 'website') {
            return <Globe className="w-3 h-3 shrink-0 text-sky-600 dark:text-sky-400" />;
        }
        if (normalized === 'whatsapp') {
            return <MessageCircle className="w-3 h-3 shrink-0 text-emerald-600 dark:text-emerald-400" />;
        }
        return <Share2 className="w-3 h-3 shrink-0 text-blue-600 dark:text-blue-400" />;
    };

    const formatShort = format
        ? format === 'reels_shorts'
            ? 'Reels'
            : format === 'carousel' || format === 'carousel_feed'
              ? 'Carousel'
              : format === 'single_image' || format === 'single_feed'
                ? 'Feed'
                : format === 'video_long'
                  ? 'Video'
                  : format === 'artikel'
                    ? 'Artikel'
                    : format
        : null;

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] font-medium whitespace-nowrap select-none',
                compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
                className
            )}
        >
            {renderIcon()}
            <span>{label}</span>
            {formatShort && !compact && (
                <span className="text-[var(--md-sys-color-on-surface-muted)] border-l border-[var(--md-sys-color-outline-variant)] pl-1.5">
                    {formatShort}
                </span>
            )}
        </span>
    );
};

const PILLAR_LABELS: Record<string, { label: string; accent: string }> = {
    edukasi: { label: 'Edukasi', accent: 'border-l-blue-500' },
    program: { label: 'Program', accent: 'border-l-indigo-500' },
    fundraising: { label: 'Fundraising', accent: 'border-l-emerald-500' },
    inspirasi: { label: 'Inspirasi', accent: 'border-l-violet-500' },
    kelembagaan: { label: 'Kelembagaan', accent: 'border-l-slate-500' },
    promosi: { label: 'Promosi', accent: 'border-l-indigo-500' },
    event: { label: 'Event & Liputan', accent: 'border-l-violet-500' },
    pengumuman: { label: 'Kelembagaan', accent: 'border-l-slate-500' },
    hiburan: { label: 'Inspirasi', accent: 'border-l-teal-500' },
};

export const PillarTag: React.FC<{
    pillar?: string;
    className?: string;
}> = ({ pillar = 'edukasi', className }) => {
    const meta = PILLAR_LABELS[pillar] || { label: pillar, accent: 'border-l-slate-400' };

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-r-md border-l-2 bg-[var(--md-sys-color-surface-container-low)] text-[10px] font-semibold tracking-wide uppercase text-[var(--md-sys-color-on-surface-variant)] select-none',
                meta.accent,
                className
            )}
        >
            <Layers className="w-2.5 h-2.5 opacity-70 shrink-0" />
            <span>{meta.label}</span>
        </span>
    );
};

export const ContentIdBadge: React.FC<{
    contentId: string;
    className?: string;
}> = ({ contentId, className }) => (
    <span
        className={cn(
            'sparc-code-id inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--md-sys-color-surface-container)] text-[10px] font-mono font-bold text-[var(--md-sys-color-on-surface-variant)] border border-[var(--md-sys-color-outline-variant)]/80 select-all',
            className
        )}
    >
        {contentId}
    </span>
);

/**
 * Computes deadline state relative to reference operational date ("today") without relying on color alone.
 */
export const DeadlineBadge: React.FC<{
    date?: string | null;
    kind?: 'production' | 'publish';
    isDone?: boolean;
    todayStr?: string;
    className?: string;
}> = ({ date, kind = 'production', isDone = false, todayStr = '2026-10-27', className }) => {
    if (!date) {
        return (
            <span className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] sparc-code-id">
                —
            </span>
        );
    }

    const cleanDate = date.slice(0, 10);
    const targetMs = Date.parse(`${cleanDate}T00:00:00`);
    const todayMs = Date.parse(`${todayStr}T00:00:00`);
    const diffDays = Math.round((targetMs - todayMs) / 86400000);

    const isOverdue = !isDone && diffDays < 0;
    const isDueSoon = !isDone && diffDays >= 0 && diffDays <= 2;

    const formatted = (() => {
        try {
            return new Intl.DateTimeFormat('id-ID', {
                day: 'numeric',
                month: 'short',
            }).format(new Date(`${cleanDate}T00:00:00`));
        } catch {
            return cleanDate;
        }
    })();

    if (isOverdue) {
        return (
            <span
                title={`${kind === 'production' ? 'Tenggat Produksi' : 'Jadwal Tayang'} Terlambat (${cleanDate})`}
                className={cn(
                    'sparc-code-id inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] border border-[var(--md-sys-color-error)]/30',
                    className
                )}
            >
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>{formatted}</span>
                <span className="text-[10px] font-bold">({Math.abs(diffDays)}h lewat)</span>
            </span>
        );
    }

    if (isDueSoon) {
        return (
            <span
                title={`${kind === 'production' ? 'Tenggat Produksi' : 'Jadwal Tayang'} Segera (${cleanDate})`}
                className={cn(
                    'sparc-code-id inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]',
                    className
                )}
            >
                <Clock className="w-3 h-3 shrink-0" />
                <span>{formatted}</span>
                <span className="text-[10px]">{diffDays === 0 ? 'Hari ini' : `${diffDays}h lagi`}</span>
            </span>
        );
    }

    const Icon = kind === 'publish' ? Send : Calendar;

    return (
        <span
            title={`${kind === 'production' ? 'Tenggat Produksi' : 'Jadwal Tayang'}: ${cleanDate}`}
            className={cn(
                'sparc-code-id inline-flex items-center gap-1 text-[11px] text-[var(--md-sys-color-on-surface-variant)]',
                className
            )}
        >
            <Icon className="w-3 h-3 shrink-0 text-[var(--md-sys-color-on-surface-muted)]" />
            <span>{formatted}</span>
        </span>
    );
};

export const ROLE_META: Record<UserRoleKey, { label: string; description: string }> = {
    admin: { label: 'Administrator', description: 'Akses penuh sistem, pengguna & konfigurasi' },
    manager: { label: 'Kepala HUMAS', description: 'Approval konten, prioritas & pantau beban tim' },
    planner: { label: 'Content Planner', description: 'Rencana konten, kalender kegiatan & tugas' },
    creator: { label: 'Creator / Designer', description: 'Produksi naskah, desain & katalog aset' },
    publisher: { label: 'Publisher', description: 'Optimasi checklist kanal, tayang & metrik' },
    viewer: { label: 'Viewer Pimpinan', description: 'Akses baca dashboard, kalender & laporan' },
};

export const RoleBadge: React.FC<{ role: string; className?: string }> = ({ role, className }) => {
    const key = (role in ROLE_META ? role : 'planner') as UserRoleKey;
    const isElevated = key === 'admin' || key === 'manager';

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border select-none',
                isElevated
                    ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border-[var(--md-sys-color-primary)]/25'
                    : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] border-[var(--md-sys-color-outline-variant)]',
                className
            )}
        >
            {isElevated ? <Shield className="w-3 h-3 shrink-0" /> : <UserCheck className="w-3 h-3 shrink-0" />}
            <span>{ROLE_META[key].label}</span>
        </span>
    );
};
