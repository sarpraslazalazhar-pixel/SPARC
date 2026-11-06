import React, { useEffect, useState } from 'react';
import { Link, router, useForm, usePage } from '@inertiajs/react';
import {
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    Circle,
    Clock,
    Copy,
    ExternalLink,
    Eye,
    EyeOff,
    History,
    Kanban,
    Lightbulb,
    MessageCircle,
    MessageSquarePlus,
    Plus,
    RefreshCw,
    Save,
    Send,
    TableProperties,
    Trash2,
    Video,
} from 'lucide-react';
import type { SharedWorkspaceProps } from '@/Layouts/AppLayout';
import { Button } from '@/Components/UI/Button';
import { Badge } from '@/Components/UI/Badge';
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
} from '@/Components/UI/Semantics';
import { Sheet } from '@/Components/UI/Sheet';
import { Tabs } from '@/Components/UI/Tabs';
import { Textarea } from '@/Components/UI/Textarea';
import { useToast } from '@/Components/UI/Toast';
import type { SparcContentItem, SparcTeamMember } from '@/types/sparc';

interface ContentDetailSheetProps {
    item: SparcContentItem | null;
    today?: string;
    team?: SparcTeamMember[];
    onClose: () => void;
}

export const ContentDetailSheet: React.FC<ContentDetailSheetProps> = ({
    item,
    today = '2026-10-27',
    team = [],
    onClose,
}) => {
    const { props } = usePage<SharedWorkspaceProps>();
    const can = props.auth?.can;
    const { error: toastError } = useToast();

    const [activeTab, setActiveTab] = useState<
        'overview' | 'tasks' | 'discussion' | 'ig_comments' | 'history' | 'performa'
    >('overview');
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDuplicating, setIsDuplicating] = useState(false);
    const [isStatusUpdating, setIsStatusUpdating] = useState(false);
    const [isSyncingIgComments, setIsSyncingIgComments] = useState(false);
    const [igReplyDrafts, setIgReplyDrafts] = useState<Record<string, string>>({});
    const [igReplyingId, setIgReplyingId] = useState<string | null>(null);
    const [igBusyCommentId, setIgBusyCommentId] = useState<string | null>(null);

    const igHandleLabel = props.instagramStatus?.username
        ? `@${props.instagramStatus.username}`
        : 'Akun IG Resmi';

    const editForm = useForm({
        title: item?.title ?? '',
        platform: item?.platform ?? 'instagram',
        pillar: item?.pillar ?? 'edukasi',
        priority: item?.priority ?? 'normal',
        pic_name: item?.picName ?? 'Nadia Putri',
        production_deadline: item?.productionDeadline ?? today,
        publish_date: item?.publishDate ?? today,
        brief: item?.brief ?? '',
        caption: item?.caption ?? '',
        ref_design_url: item?.refDesignUrl ?? '',
        result_design_url: item?.resultDesignUrl ?? '',
        revision_note: item?.revisionNote ?? '',
        published_url: item?.publishedUrl ?? '',
    });

    const taskForm = useForm({
        content_item_id: item?.id ?? '',
        title: '',
        task_type: 'design' as 'scripting' | 'design' | 'video' | 'review' | 'approval' | 'distribution' | 'other',
        assigned_to: team[0]?.name ?? 'Dimas Pratama',
        due_date: item?.productionDeadline ?? today,
    });

    const commentForm = useForm({
        comment: '',
        is_revision_note: false,
    });

    const [videoLinkInput, setVideoLinkInput] = useState('');
    const [revisionInput, setRevisionInput] = useState('');
    const [publishedUrlInput, setPublishedUrlInput] = useState('');
    const [showRevisionInput, setShowRevisionInput] = useState(false);
    const [isSavingPerf, setIsSavingPerf] = useState(false);
    const [isSyncingIg, setIsSyncingIg] = useState(false);
    const [recentIgMedia, setRecentIgMedia] = useState<Array<{
        id: string;
        permalink: string;
        caption?: string;
        media_type?: string;
        like_count?: number;
        comments_count?: number;
    }>>([]);
    const [isLoadingRecentIg, setIsLoadingRecentIg] = useState(false);
    const [showRecentIg, setShowRecentIg] = useState(false);
    const [perfForm, setPerfForm] = useState({
        revision_note: item?.revisionNote ?? '',
        result_design_url: item?.resultDesignUrl ?? '',
        published_url: item?.publishedUrl ?? '',
        performance_notes: item?.performanceNotes ?? '',
        views: String(item?.views ?? 0),
        likes: String(item?.likes ?? 0),
        comments_count: String(item?.commentsCount ?? 0),
        shares: String(item?.shares ?? 0),
    });


    useEffect(() => {
        if (item) {
            editForm.setData({
                title: item.title,
                platform: item.platform,
                pillar: item.pillar,
                priority: item.priority,
                pic_name: item.picName,
                production_deadline: item.productionDeadline,
                publish_date: item.publishDate,
                brief: item.brief ?? '',
                caption: item.caption ?? '',
                ref_design_url: item.refDesignUrl ?? '',
                result_design_url: item.resultDesignUrl ?? '',
                revision_note: item.revisionNote ?? '',
                published_url: item.publishedUrl ?? '',
            });
            editForm.clearErrors();

            taskForm.setData({
                content_item_id: item.id,
                title: '',
                task_type: 'design',
                assigned_to: item.picName || 'Dimas Pratama',
                due_date: item.productionDeadline || today,
            });
            taskForm.clearErrors();
            commentForm.reset();
            commentForm.clearErrors();
            setVideoLinkInput(item.resultDesignUrl ?? '');
            setRevisionInput(item.revisionNote ?? '');
            setPublishedUrlInput(item.publishedUrl ?? '');
            setShowRevisionInput(false);
            setPerfForm({
                revision_note: item.revisionNote ?? '',
                result_design_url: item.resultDesignUrl ?? '',
                published_url: item.publishedUrl ?? '',
                performance_notes: item.performanceNotes ?? '',
                views: String(item.views ?? 0),
                likes: String(item.likes ?? 0),
                comments_count: String(item.commentsCount ?? 0),
                shares: String(item.shares ?? 0),
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item?.id]);

    useEffect(() => {
        if (item) {
            setPerfForm((prev) => ({
                ...prev,
                published_url: item.publishedUrl ?? prev.published_url,
                revision_note: item.revisionNote ?? prev.revision_note,
                result_design_url: item.resultDesignUrl ?? prev.result_design_url,
                performance_notes: item.performanceNotes ?? prev.performance_notes,
                views: String(item.views ?? 0),
                likes: String(item.likes ?? 0),
                comments_count: String(item.commentsCount ?? 0),
                shares: String(item.shares ?? 0),
            }));
            if (item.publishedUrl) {
                setPublishedUrlInput(item.publishedUrl);
            }
        }
    }, [item?.views, item?.likes, item?.commentsCount, item?.shares, item?.publishedUrl]);

    if (!item) {
        return null;
    }

    const canonicalStatus = normalizeWorkflowStatus(item.status);
    const statusMeta = WORKFLOW_STATUS_META[canonicalStatus];
    const StatusIcon = statusMeta.icon;
    const currentRole = props.auth?.user?.role;

    const handleStatusChange = (
        nextStatus: CanonicalWorkflowStatus,
        extraData: Record<string, unknown> = {}
    ) => {
        if (nextStatus === canonicalStatus && Object.keys(extraData).length === 0) {
            return;
        }
        setIsStatusUpdating(true);
        router.patch(
            `/content/${item.id}/status`,
            { status: nextStatus, ...extraData },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setIsStatusUpdating(false),
                onError: (errors) => {
                    toastError(
                        'Perpindahan Tahap Ditolak',
                        errors.status || 'Peran Anda tidak diizinkan memindahkan konten ke tahap tersebut.'
                    );
                },
            }
        );
    };

    const handleSubmitVideoForReview = () => {
        if (!item || !videoLinkInput.trim()) {
            return;
        }
        setIsStatusUpdating(true);
        router.patch(
            `/content/${item.id}/status`,
            {
                status: 'review_approval',
                result_design_url: videoLinkInput.trim(),
                note: 'Hasil video/desain diserahkan untuk review.',
            },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setIsStatusUpdating(false),
            }
        );
    };

    const handleRequestRevision = () => {
        if (!item || !revisionInput.trim()) {
            return;
        }
        setIsStatusUpdating(true);
        router.patch(
            `/content/${item.id}/status`,
            {
                status: 'in_progress',
                revision_note: revisionInput.trim(),
                note: `Revisi diminta: ${revisionInput.trim()}`,
            },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => {
                    setIsStatusUpdating(false);
                    setShowRevisionInput(false);
                },
            }
        );
    };

    const handleMarkPublished = () => {
        if (!item || !publishedUrlInput.trim()) {
            return;
        }
        setIsStatusUpdating(true);
        router.patch(
            `/content/${item.id}/status`,
            {
                status: 'published',
                published_url: publishedUrlInput.trim(),
                note: 'Konten berhasil dipublikasikan ke media sosial.',
            },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setIsStatusUpdating(false),
            }
        );
    };

    const handleSaveOverview = (e: React.FormEvent) => {
        e.preventDefault();
        editForm.patch(`/content/${item.id}`, {
            preserveScroll: true,
            onError: () => {
                toastError('Gagal Menyimpan', 'Periksa kembali kolom wajib yang ditandai merah.');
            },
        });
    };

    const handleAddTask = (e: React.FormEvent) => {
        e.preventDefault();
        taskForm.post('/tasks', {
            preserveScroll: true,
            onSuccess: () => {
                taskForm.setData('title', '');
            },
            onError: () => {
                toastError('Validasi Sub-Tugas Gagal', 'Nama dan tenggat tugas wajib diisi.');
            },
        });
    };

    const handleToggleTask = (taskId: string, currentStatus: string) => {
        const nextStatus = currentStatus === 'done' ? 'in_progress' : 'done';
        router.patch(
            `/tasks/${taskId}/status`,
            { content_item_id: item.id, status: nextStatus },
            {
                preserveScroll: true,
                onError: () => toastError('Gagal Memperbarui Tugas', 'Perubahan belum tersimpan.'),
            }
        );
    };

    const handleAddComment = (e: React.FormEvent) => {
        e.preventDefault();
        commentForm.post(`/content/${item.id}/comments`, {
            preserveScroll: true,
            onSuccess: () => commentForm.reset(),
            onError: () => toastError('Gagal Mengirim Catatan', 'Tuliskan isi komentar terlebih dahulu.'),
        });
    };

    const handleDuplicate = () => {
        setIsDuplicating(true);
        router.post(
            `/content/${item.id}/duplicate`,
            {},
            {
                preserveScroll: true,
                onFinish: () => setIsDuplicating(false),
            }
        );
    };

    const handleConfirmDelete = () => {
        setIsDeleting(true);
        router.delete(`/content/${item.id}`, {
            data: { title: item.title },
            preserveScroll: true,
            onSuccess: () => {
                setIsDeleting(false);
                setDeleteConfirmOpen(false);
                onClose();
            },
            onError: () => {
                setIsDeleting(false);
                toastError('Gagal Menghapus', 'Item tidak dapat dipindahkan ke Trash.');
            },
        });
    };
    const handleSavePerformance = () => {
        if (!item) {
            return;
        }
        setIsSavingPerf(true);
        router.patch(
            `/content/${item.id}`,
            {
                revision_note: perfForm.revision_note || null,
                result_design_url: perfForm.result_design_url || null,
                published_url: perfForm.published_url || null,
                performance_notes: perfForm.performance_notes || null,
                views: Number(perfForm.views) || 0,
                likes: Number(perfForm.likes) || 0,
                comments_count: Number(perfForm.comments_count) || 0,
                shares: Number(perfForm.shares) || 0,
            },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setIsSavingPerf(false),
            }
        );
    };
    const handleSyncInstagramMetrics = () => {
        if (!item || !perfForm.published_url) {
            return;
        }
        setIsSyncingIg(true);
        router.post(
            `/content/${item.id}/sync-instagram`,
            {},
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setIsSyncingIg(false),
            }
        );
    };
    const handleFetchRecentIg = async () => {
        setIsLoadingRecentIg(true);
        setShowRecentIg(true);
        try {
            const res = await fetch('/content/instagram/recent-media');
            const data = await res.json();
            if (data.success && Array.isArray(data.media)) {
                setRecentIgMedia(data.media);
            }
        } catch {
            // Graceful error fallback
        } finally {
            setIsLoadingRecentIg(false);
        }
    };

    const handleSelectRecentPost = (permalink: string, initialLikes?: number, initialComments?: number) => {
        setPerfForm((f) => ({
            ...f,
            published_url: permalink,
            likes: initialLikes !== undefined ? String(initialLikes) : f.likes,
            comments_count: initialComments !== undefined ? String(initialComments) : f.comments_count,
        }));
        setPublishedUrlInput(permalink);

        if (item) {
            setIsSyncingIg(true);
            router.post(
                `/content/${item.id}/sync-instagram`,
                { published_url: permalink },
                {
                    preserveScroll: true,
                    onFinish: () => setIsSyncingIg(false),
                }
            );
        }
    };


    return (
        <>
            <Sheet
                isOpen={Boolean(item)}
                onClose={onClose}
                eyebrow={
                    <div className="flex items-center gap-2">
                        <ContentIdBadge contentId={item.contentId} />
                        {item.ticketId && (
                            <span className="sparc-code-id text-[10px] font-semibold text-[var(--md-sys-color-primary)]">
                                {item.ticketId}
                            </span>
                        )}
                        <span className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                            • Rincian Konten
                        </span>
                    </div>
                }
                title={item.title}
                width="2xl"
            >
                <div className="space-y-4">
                    {/* Compact Bento Summary Card */}
                    <div className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]/60 p-3.5 space-y-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                            {currentRole && currentRole !== 'viewer' ? (
                                <label
                                    title="Ubah tahap alur konten"
                                    className="relative inline-flex items-center"
                                >
                                    <span className="sr-only">Tahap alur konten</span>
                                    <StatusIcon className="w-3 h-3 absolute left-2.5 pointer-events-none" />
                                    <select
                                        value={canonicalStatus}
                                        onChange={(e) =>
                                            handleStatusChange(
                                                e.target.value as CanonicalWorkflowStatus
                                            )
                                        }
                                        disabled={isStatusUpdating}
                                        style={statusMeta.styleVars}
                                        className="h-8 appearance-none rounded-full border pl-7 pr-7 text-xs font-bold cursor-pointer outline-none transition-opacity disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]"
                                    >
                                        {(Object.keys(WORKFLOW_STATUS_META) as CanonicalWorkflowStatus[]).map(
                                            (statusKey) => (
                                                <option
                                                    key={statusKey}
                                                    value={statusKey}
                                                    disabled={
                                                        (statusKey === 'ready_to_publish' &&
                                                            !can?.approveContent) ||
                                                        (statusKey === 'published' &&
                                                            !['admin', 'manager', 'publisher'].includes(
                                                                currentRole ?? ''
                                                            ))
                                                    }
                                                >
                                                    {WORKFLOW_STATUS_META[statusKey].label}
                                                </option>
                                            )
                                        )}
                                    </select>
                                    <ChevronDown className="w-3 h-3 absolute right-2.5 pointer-events-none" />
                                </label>
                            ) : (
                                <StatusChip status={item.status} />
                            )}
                            <PriorityBadge priority={item.priority} />
                            <PlatformChip platform={item.platform} format={item.format} compact />
                            <PillarTag pillar={item.pillar} />
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 border-t border-[var(--md-sys-color-outline-variant)]/70">
                            <div className="inline-flex items-center gap-2 min-w-0">
                                <img
                                    src={item.picAvatar}
                                    alt={item.picName}
                                    className="w-6 h-6 rounded-full object-cover border border-[var(--md-sys-color-outline-variant)] shrink-0"
                                />
                                <div className="min-w-0">
                                    <p className="text-[10px] uppercase tracking-wide text-[var(--md-sys-color-on-surface-muted)]">
                                        Penanggung Jawab
                                    </p>
                                    <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] truncate">
                                        {item.picName}
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                                <DeadlineBadge
                                    date={item.productionDeadline}
                                    kind="production"
                                    isDone={item.status === 'published'}
                                    todayStr={today}
                                />
                                <DeadlineBadge
                                    date={item.publishDate}
                                    kind="publish"
                                    isDone={item.status === 'published'}
                                    todayStr={today}
                                />
                            </div>
                        </div>
                    </div>

                    {/* LINKED HALOAPU TICKET BANNER */}
                    {(item.haloapuTicketId || item.ticketId) && (
                        <div className="p-3.5 rounded-2xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                            <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="sparc-eyebrow">Tiket HaloAPU</span>
                                    <span className="sparc-code-id font-bold text-[var(--md-sys-color-primary)]">
                                        #{item.haloapuTicketId || item.ticketId}
                                    </span>
                                    {item.haloapuStatus && (
                                        <Badge
                                            variant={
                                                item.haloapuStatus === 'solve'
                                                    ? 'success'
                                                    : item.haloapuStatus === 'need_revision'
                                                      ? 'danger'
                                                      : 'primary'
                                            }
                                        >
                                            {item.haloapuStatus}
                                        </Badge>
                                    )}
                                    {item.isResultAccepted && (
                                        <span className="text-[10px] font-bold text-green-600 dark:text-green-400">
                                            ✓ Diterima Pemohon
                                        </span>
                                    )}
                                    {Boolean(item.revisionCount && item.revisionCount > 0) && (
                                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                            Revisi ke-{item.revisionCount}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                    Status tiket pada portal HaloAPU sinkron secara langsung dengan progres SPARC.
                                </p>
                            </div>

                        </div>
                    )}

                    {/* ACTIVE REVISION NOTE ALERT (IF ANY) */}
                    {item.revisionNote && (
                        <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                    <strong className="font-bold text-amber-800 dark:text-amber-300">
                                        Catatan Revisi Terakhir
                                    </strong>
                                    {canonicalStatus === 'in_progress' && (
                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-200">
                                            Perlu Diperbaiki
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] leading-relaxed">
                                    {item.revisionNote}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* STAGE WORKBENCH: 1. PRODUKSI (IN_PROGRESS) */}
                    {canonicalStatus === 'in_progress' && can?.editContent && (
                        <div className="p-4 rounded-2xl bg-indigo-500/10 dark:bg-indigo-500/15 border border-indigo-500/25 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0">
                                        <Video className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate">
                                            Tahap Produksi: Kirim Link Video / Desain untuk Review
                                        </h4>
                                        <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                                            Masukkan tautan Google Drive / Canva / YouTube unlisted untuk ditinjau oleh reviewer.
                                        </p>
                                    </div>
                                </div>
                                {item.resultDesignUrl && (
                                    <a
                                        href={item.resultDesignUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs shrink-0 transition-colors"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        Buka Video Saat Ini ↗
                                    </a>
                                )}
                            </div>

                            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                                <div className="w-full flex-1">
                                    <Input
                                        placeholder="https://drive.google.com/... atau link Canva/YouTube"
                                        value={videoLinkInput}
                                        onChange={(e) => setVideoLinkInput(e.target.value)}
                                    />
                                </div>
                                <Button
                                    type="button"
                                    variant="primary"
                                    size="md"
                                    className="w-full sm:w-auto shrink-0 bg-indigo-600 hover:bg-indigo-700"
                                    isLoading={isStatusUpdating}
                                    disabled={!videoLinkInput.trim() || isStatusUpdating}
                                    icon={<Send className="w-3.5 h-3.5" />}
                                    onClick={handleSubmitVideoForReview}
                                >
                                    Kirim untuk Di-Review →
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* STAGE WORKBENCH: 2. REVIEW & APPROVAL */}
                    {canonicalStatus === 'review_approval' && (
                        <div className="p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                                        <Video className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate">
                                            Tahap Tinjauan: Review Video & Persetujuan Tayang
                                        </h4>
                                        <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                                            {item.resultDesignUrl
                                                ? 'Periksa kesesuaian materi video/desain sebelum disetujui untuk publikasi.'
                                                : 'Perhatian: Creator belum memasukkan link video untuk di-review.'}
                                        </p>
                                    </div>
                                </div>
                                {item.resultDesignUrl && (
                                    <a
                                        href={item.resultDesignUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs shrink-0 transition-colors"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        Tonton & Review Video ↗
                                    </a>
                                )}
                            </div>

                            {!item.resultDesignUrl && can?.editContent && (
                                <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                                    <div className="w-full flex-1">
                                        <Input
                                            placeholder="Masukkan link video review (Drive/Canva/YouTube)..."
                                            value={videoLinkInput}
                                            onChange={(e) => setVideoLinkInput(e.target.value)}
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        disabled={!videoLinkInput.trim() || isStatusUpdating}
                                        isLoading={isStatusUpdating}
                                        onClick={handleSubmitVideoForReview}
                                    >
                                        Simpan Link
                                    </Button>
                                </div>
                            )}

                            {/* Reviewer Action Buttons */}
                            {can?.approveContent && (
                                <div className="pt-2.5 border-t border-amber-500/20 space-y-2.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <Button
                                            type="button"
                                            variant="primary"
                                            size="sm"
                                            isLoading={isStatusUpdating}
                                            icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                                            onClick={() =>
                                                handleStatusChange('ready_to_publish', {
                                                    note: 'Materi video/desain disetujui untuk tayang.',
                                                })
                                            }
                                        >
                                            Setujui Siap Tayang
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            icon={<AlertCircle className="w-3.5 h-3.5 text-amber-600" />}
                                            onClick={() => setShowRevisionInput((prev) => !prev)}
                                        >
                                            {showRevisionInput ? 'Tutup Catatan Revisi' : 'Minta Revisi...'}
                                        </Button>
                                    </div>

                                    {showRevisionInput && (
                                        <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-amber-500/30 space-y-2">
                                            <label className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface)] block">
                                                Tuliskan Catatan Revisi untuk Creator:
                                            </label>
                                            <Textarea
                                                rows={2}
                                                placeholder="Contoh: Hook 3 detik awal terlalu lambat, font judul ganti sesuai pedoman..."
                                                value={revisionInput}
                                                onChange={(e) => setRevisionInput(e.target.value)}
                                            />
                                            <div className="flex justify-end gap-2 pt-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setShowRevisionInput(false)}
                                                >
                                                    Batal
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="danger"
                                                    size="sm"
                                                    disabled={!revisionInput.trim() || isStatusUpdating}
                                                    isLoading={isStatusUpdating}
                                                    onClick={handleRequestRevision}
                                                >
                                                    Kirim Revisi & Kembalikan ke Produksi
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* STAGE WORKBENCH: 3. SIAP TAYANG (READY_TO_PUBLISH) */}
                    {canonicalStatus === 'ready_to_publish' && (
                        <div className="p-4 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                                        <CheckCircle2 className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate">
                                            Siap Tayang: Materi Video / Desain Telah Disetujui
                                        </h4>
                                        <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                                            Unggah materi final ke media sosial, lalu masukkan tautan postingan di bawah.
                                        </p>
                                    </div>
                                </div>
                                {item.resultDesignUrl && (
                                    <a
                                        href={item.resultDesignUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs shrink-0 transition-colors"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        Buka Materi Final ↗
                                    </a>
                                )}
                            </div>

                            {can?.managePublishing && (
                                <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                                    <div className="w-full flex-1">
                                        <Input
                                            placeholder="https://instagram.com/reel/... atau https://tiktok.com/@..."
                                            value={publishedUrlInput}
                                            onChange={(e) => setPublishedUrlInput(e.target.value)}
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        variant="primary"
                                        size="md"
                                        className="w-full sm:w-auto shrink-0 bg-emerald-600 hover:bg-emerald-700"
                                        isLoading={isStatusUpdating}
                                        disabled={!publishedUrlInput.trim() || isStatusUpdating}
                                        icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                                        onClick={handleMarkPublished}
                                    >
                                        Tandai Sudah Tayang
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STAGE WORKBENCH: 4. SUDAH TAYANG (PUBLISHED) */}
                    {canonicalStatus === 'published' && (
                        <div className="p-3.5 rounded-2xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                                <div className="min-w-0">
                                    <strong className="text-[var(--md-sys-color-on-surface)] block">
                                        Konten Telah Tayang di Media Sosial
                                    </strong>
                                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                                        {item.publishedUrl || 'Tautan publikasi belum dicatat.'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {item.resultDesignUrl && (
                                    <a
                                        href={item.resultDesignUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--md-sys-color-outline-variant)] text-[11px] font-semibold text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)]"
                                    >
                                        <ExternalLink className="w-3 h-3" /> File Video ↗
                                    </a>
                                )}
                                {item.publishedUrl && (
                                    <a
                                        href={item.publishedUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700"
                                    >
                                        <ExternalLink className="w-3 h-3" /> Lihat Postingan ↗
                                    </a>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Fast Navigation Shortcuts */}
                    <div className="flex items-center justify-between gap-2 px-1">
                        <div className="flex items-center gap-2">
                            <Link
                                href="/content?view=kanban"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary-container)]/30 transition-colors"
                            >
                                <Kanban className="w-3.5 h-3.5" />
                                Papan Kanban →
                            </Link>
                            <Link
                                href="/content"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] transition-colors"
                            >
                                <TableProperties className="w-3.5 h-3.5" />
                                Tabel Planner
                            </Link>
                        </div>
                    </div>

                    {/* Section Tabs */}
                    <Tabs
                        tabs={[
                            { id: 'overview', label: 'Atribut & Brief' },
                            { id: 'tasks', label: `Tugas (${item.tasks?.length || 0})` },
                            { id: 'discussion', label: `Diskusi (${item.comments?.length || 0})` },
                            ...(item.platform === 'instagram'
                                ? [
                                      {
                                          id: 'ig_comments',
                                          label: `Komentar IG (${item.igComments?.length || 0})`,
                                      },
                                  ]
                                : []),
                            { id: 'history', label: 'Riwayat' },
                            { id: 'performa', label: 'Performa & Evaluasi' },
                        ]}
                        activeTab={activeTab}
                        onChange={(id) => setActiveTab(id as typeof activeTab)}
                    />

                    {/* TAB 1: OVERVIEW & INLINE FORM */}
                    {activeTab === 'overview' && (
                        <form onSubmit={handleSaveOverview} className="space-y-4" noValidate>
                            <Input
                                label="Judul Konten"
                                value={editForm.data.title}
                                onChange={(e) => editForm.setData('title', e.target.value)}
                                error={editForm.errors.title}
                                disabled={!can?.editContent}
                                required
                            />

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <Select
                                    label="Kanal Utama"
                                    value={editForm.data.platform}
                                    onChange={(e) =>
                                        editForm.setData('platform', e.target.value as typeof editForm.data.platform)
                                    }
                                    disabled={!can?.editContent}
                                >
                                    <option value="instagram">Instagram</option>
                                    <option value="tiktok">TikTok</option>
                                    <option value="youtube">YouTube</option>
                                    <option value="website">Website</option>
                                    <option value="whatsapp">WhatsApp</option>
                                    <option value="facebook">Facebook</option>
                                    <option value="x">X</option>
                                </Select>

                                <Select
                                    label="Pilar Komunikasi"
                                    value={editForm.data.pillar}
                                    onChange={(e) =>
                                        editForm.setData('pillar', e.target.value as typeof editForm.data.pillar)
                                    }
                                    disabled={!can?.editContent}
                                >
                                    <option value="edukasi">Edukasi</option>
                                    <option value="program">Program</option>
                                    <option value="kelembagaan">Kelembagaan</option>
                                    <option value="inspirasi">Inspirasi</option>
                                    <option value="fundraising">Fundraising</option>
                                </Select>

                                <Select
                                    label="Tingkat Prioritas"
                                    value={editForm.data.priority}
                                    onChange={(e) =>
                                        editForm.setData('priority', e.target.value as typeof editForm.data.priority)
                                    }
                                    disabled={!can?.editContent}
                                >
                                    <option value="critical">Kritis</option>
                                    <option value="tinggi">Tinggi</option>
                                    <option value="normal">Normal</option>
                                    <option value="rendah">Rendah</option>
                                </Select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <Input
                                    label="Penanggung Jawab (PIC)"
                                    value={editForm.data.pic_name}
                                    onChange={(e) => editForm.setData('pic_name', e.target.value)}
                                    disabled={!can?.editContent}
                                />
                                <Input
                                    label="Tenggat Produksi"
                                    type="date"
                                    value={editForm.data.production_deadline}
                                    onChange={(e) => editForm.setData('production_deadline', e.target.value)}
                                    error={editForm.errors.production_deadline}
                                    disabled={!can?.editContent}
                                />
                                <Input
                                    label="Rencana Tanggal Tayang"
                                    type="date"
                                    value={editForm.data.publish_date}
                                    onChange={(e) => editForm.setData('publish_date', e.target.value)}
                                    error={editForm.errors.publish_date}
                                    disabled={!can?.editContent}
                                />
                            </div>

                            <Textarea
                                label="Brief Kreatif & Objektif"
                                rows={3}
                                value={editForm.data.brief}
                                onChange={(e) => editForm.setData('brief', e.target.value)}
                                disabled={!can?.editContent}
                            />

                            <Textarea
                                label="Draft Caption"
                                rows={3}
                                value={editForm.data.caption}
                                onChange={(e) => editForm.setData('caption', e.target.value)}
                                disabled={!can?.editContent}
                            />

                            {/* SECTION: TAUTAN MATERI, REVIEW VIDEO & PUBLIKASI */}
                            <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)]/60 space-y-3">
                                <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] flex items-center gap-1.5">
                                    <Video className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" />
                                    Tautan Materi, Video Review & Publikasi
                                </h4>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <Input
                                            label="Link Referensi Desain / Moodboard"
                                            placeholder="Canva, Pinterest, Drive moodboard..."
                                            value={editForm.data.ref_design_url}
                                            onChange={(e) => editForm.setData('ref_design_url', e.target.value)}
                                            disabled={!can?.editContent}
                                        />
                                        {editForm.data.ref_design_url && (
                                            <a
                                                href={editForm.data.ref_design_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 mt-1 text-[11px] font-semibold text-[var(--md-sys-color-primary)] hover:underline"
                                            >
                                                <ExternalLink className="w-3 h-3" /> Buka Referensi Desain ↗
                                            </a>
                                        )}
                                    </div>

                                    <div>
                                        <Input
                                            label="Link Hasil Desain / Video untuk Review"
                                            placeholder="Google Drive, Canva, YouTube unlisted..."
                                            value={editForm.data.result_design_url}
                                            onChange={(e) => editForm.setData('result_design_url', e.target.value)}
                                            disabled={!can?.editContent}
                                        />
                                        {editForm.data.result_design_url && (
                                            <a
                                                href={editForm.data.result_design_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                            >
                                                <ExternalLink className="w-3 h-3" /> Tonton Video / Desain Review ↗
                                            </a>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <Input
                                            label="Link Upload Media Sosial (Setelah Tayang)"
                                            placeholder="https://instagram.com/reel/... atau tiktok.com/@..."
                                            value={editForm.data.published_url}
                                            onChange={(e) => editForm.setData('published_url', e.target.value)}
                                            disabled={!can?.editContent}
                                        />
                                        {editForm.data.published_url && (
                                            <a
                                                href={editForm.data.published_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                                            >
                                                <ExternalLink className="w-3 h-3" /> Buka Postingan Tayang ↗
                                            </a>
                                        )}
                                    </div>

                                    <Input
                                        label="Catatan Revisi"
                                        placeholder="Koreksi naskah, durasi video, atau visual..."
                                        value={editForm.data.revision_note}
                                        onChange={(e) => editForm.setData('revision_note', e.target.value)}
                                        disabled={!can?.editContent}
                                    />
                                </div>
                            </div>
                            {can?.editContent && (
                                <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            isLoading={isDuplicating}
                                            icon={<Copy className="w-3.5 h-3.5" />}
                                            onClick={handleDuplicate}
                                        >
                                            Duplikasi
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="danger"
                                            size="sm"
                                            icon={<Trash2 className="w-3.5 h-3.5" />}
                                            onClick={() => setDeleteConfirmOpen(true)}
                                        >
                                            Hapus
                                        </Button>
                                    </div>
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        size="sm"
                                        isLoading={editForm.processing}
                                        icon={<Save className="w-3.5 h-3.5" />}
                                    >
                                        Simpan Perubahan
                                    </Button>
                                </div>
                            )}
                        </form>
                    )}

                    {/* TAB 2: SUBTASKS & CHECKLISTS */}
                    {activeTab === 'tasks' && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                {!item.tasks || item.tasks.length === 0 ? (
                                    <div className="p-6 text-center rounded-2xl border border-dashed border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                        Belum ada sub-pekerjaan produksi pada konten ini.
                                    </div>
                                ) : (
                                    item.tasks.map((t) => {
                                        const done = t.status === 'done';
                                        return (
                                            <div
                                                key={t.id}
                                                className="p-3 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]/50 flex items-center justify-between gap-3"
                                            >
                                                <button
                                                    type="button"
                                                    disabled={!can?.updateTasks}
                                                    onClick={() => handleToggleTask(t.id, t.status)}
                                                    className="flex items-start gap-2.5 text-left min-w-0 cursor-pointer disabled:cursor-default"
                                                >
                                                    {done ? (
                                                        <CheckCircle2 className="w-4 h-4 text-[var(--md-sys-color-secondary)] shrink-0 mt-0.5" />
                                                    ) : (
                                                        <Circle className="w-4 h-4 text-[var(--md-sys-color-on-surface-muted)] shrink-0 mt-0.5" />
                                                    )}
                                                    <div className="min-w-0">
                                                        <div
                                                            className={`text-xs font-semibold ${
                                                                done
                                                                    ? 'line-through text-[var(--md-sys-color-on-surface-muted)]'
                                                                    : 'text-[var(--md-sys-color-on-surface)]'
                                                            }`}
                                                        >
                                                            {t.title}
                                                        </div>
                                                        <div className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] mt-0.5">
                                                            {t.assignedTo} • Jenis: {t.taskType}
                                                        </div>
                                                    </div>
                                                </button>
                                                <DeadlineBadge
                                                    date={t.dueDate}
                                                    kind="production"
                                                    isDone={done}
                                                    todayStr={today}
                                                />
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {can?.updateTasks && (
                                <form
                                    onSubmit={handleAddTask}
                                    className="p-4 rounded-2xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] space-y-3"
                                    noValidate
                                >
                                    <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                                        Tambah Sub-Tugas Produksi
                                    </h4>
                                    <Input
                                        label="Nama Tugas"
                                        placeholder="Contoh: Desain cover slide 1 rasio 4:5"
                                        value={taskForm.data.title}
                                        onChange={(e) => taskForm.setData('title', e.target.value)}
                                        error={taskForm.errors.title}
                                        required
                                    />
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                        <Select
                                            label="Kategori"
                                            value={taskForm.data.task_type}
                                            onChange={(e) =>
                                                taskForm.setData(
                                                    'task_type',
                                                    e.target.value as typeof taskForm.data.task_type
                                                )
                                            }
                                        >
                                            <option value="scripting">Scripting</option>
                                            <option value="design">Design</option>
                                            <option value="video">Video</option>
                                            <option value="review">Review</option>
                                            <option value="approval">Approval</option>
                                        </Select>
                                        <Input
                                            label="Pelaksana"
                                            value={taskForm.data.assigned_to}
                                            onChange={(e) => taskForm.setData('assigned_to', e.target.value)}
                                        />
                                        <Input
                                            label="Tenggat"
                                            type="date"
                                            value={taskForm.data.due_date}
                                            onChange={(e) => taskForm.setData('due_date', e.target.value)}
                                            error={taskForm.errors.due_date}
                                        />
                                    </div>
                                    <div className="flex justify-end">
                                        <Button
                                            type="submit"
                                            variant="primary"
                                            size="sm"
                                            isLoading={taskForm.processing}
                                            icon={<Plus className="w-3.5 h-3.5" />}
                                        >
                                            Tambah Tugas
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </div>
                    )}

                    {/* TAB 3: TEAM COMMENTS & REVISION NOTES */}
                    {activeTab === 'discussion' && (
                        <div className="space-y-4">
                            <div className="space-y-2.5">
                                {!item.comments || item.comments.length === 0 ? (
                                    <div className="p-6 text-center rounded-2xl border border-dashed border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                        Belum ada diskusi atau catatan revisi.
                                    </div>
                                ) : (
                                    item.comments.map((cm) => (
                                        <div
                                            key={cm.id}
                                            className={`p-3.5 rounded-2xl border space-y-1 ${
                                                cm.isRevisionNote
                                                    ? 'bg-[var(--md-sys-color-tertiary-container)]/50 border-[var(--md-sys-color-tertiary)]/40'
                                                    : 'bg-[var(--md-sys-color-surface-container-low)] border-[var(--md-sys-color-outline-variant)]'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2 text-[11px]">
                                                <span className="font-bold text-[var(--md-sys-color-on-surface)]">
                                                    {cm.author}{' '}
                                                    <span className="font-normal text-[var(--md-sys-color-on-surface-muted)]">
                                                        ({cm.roleLabel})
                                                    </span>
                                                </span>
                                                <span className="text-[var(--md-sys-color-on-surface-muted)]">
                                                    {cm.createdAt}
                                                </span>
                                            </div>
                                            {cm.isRevisionNote && (
                                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]">
                                                    Catatan Revisi
                                                </span>
                                            )}
                                            <p className="text-xs text-[var(--md-sys-color-on-surface)] leading-relaxed">
                                                {cm.comment}
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>

                            {can?.updateTasks && (
                                <form onSubmit={handleAddComment} className="space-y-3" noValidate>
                                    <Textarea
                                        label="Tulis Catatan atau Masukan Revisi"
                                        rows={3}
                                        placeholder="Tuliskan arahan redaksional atau koreksi desain..."
                                        value={commentForm.data.comment}
                                        onChange={(e) => commentForm.setData('comment', e.target.value)}
                                        error={commentForm.errors.comment}
                                    />
                                    <div className="flex items-center justify-between gap-2">
                                        <label className="inline-flex items-center gap-2 text-xs text-[var(--md-sys-color-on-surface-variant)] cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={commentForm.data.is_revision_note}
                                                onChange={(e) =>
                                                    commentForm.setData('is_revision_note', e.target.checked)
                                                }
                                                className="rounded border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-primary)]"
                                            />
                                            Tandai sebagai catatan revisi
                                        </label>
                                        <Button
                                            type="submit"
                                            variant="primary"
                                            size="sm"
                                            isLoading={commentForm.processing}
                                            icon={<MessageSquarePlus className="w-3.5 h-3.5" />}
                                        >
                                            Kirim Catatan
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </div>
                    )}

                    {/* TAB 3B: PUBLIC INSTAGRAM COMMENTS MODERATION */}
                    {activeTab === 'ig_comments' && (
                        <div className="space-y-3.5">
                            <div className="p-3 rounded-2xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] flex flex-wrap items-center justify-between gap-2 text-xs">
                                <div className="flex items-center gap-2">
                                    <MessageCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                    <span className="font-bold text-[var(--md-sys-color-on-surface)]">
                                        Komentar Publik Instagram ({igHandleLabel})
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Link
                                        href={`/instagram/comments${item.id ? `?content_item_id=${item.id.replace(/^ci-/, '')}` : ''}`}
                                        className="text-[11px] font-bold text-[var(--md-sys-color-primary)] hover:underline"
                                    >
                                        Buka Kotak Masuk IG →
                                    </Link>
                                    {(can?.updateTasks || can?.managePublishing) && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            isLoading={isSyncingIgComments}
                                            icon={
                                                <RefreshCw
                                                    className={`w-3 h-3 ${isSyncingIgComments ? 'animate-spin' : ''}`}
                                                />
                                            }
                                            onClick={() => {
                                                setIsSyncingIgComments(true);
                                                router.post(
                                                    '/instagram/comments/sync',
                                                    {},
                                                    {
                                                        preserveScroll: true,
                                                        preserveState: true,
                                                        onFinish: () => setIsSyncingIgComments(false),
                                                    }
                                                );
                                            }}
                                        >
                                            Tarik Komentar
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {!item.igComments || item.igComments.length === 0 ? (
                                <div className="p-6 text-center rounded-2xl border border-dashed border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                    Belum ada komentar publik Instagram yang tersinkronisasi untuk konten ini.
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {item.igComments.map((igc) => (
                                        <div
                                            key={igc.id}
                                            className={`p-3.5 rounded-2xl border space-y-2 ${
                                                igc.isHidden
                                                    ? 'bg-amber-500/5 border-amber-500/30 opacity-80'
                                                    : 'bg-[var(--md-sys-color-surface-container-low)] border-[var(--md-sys-color-outline-variant)]'
                                            }`}
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-extrabold text-[var(--md-sys-color-on-surface)]">
                                                        @{igc.username}
                                                    </span>
                                                    <span className="text-[var(--md-sys-color-on-surface-muted)]">
                                                        • {igc.commentedAt}
                                                    </span>
                                                    {igc.isHidden && (
                                                        <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold text-[10px]">
                                                            Disembunyikan
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {(can?.updateTasks || can?.managePublishing) && (
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            disabled={igBusyCommentId === igc.id}
                                                            icon={
                                                                igc.isHidden ? (
                                                                    <Eye className="w-3 h-3" />
                                                                ) : (
                                                                    <EyeOff className="w-3 h-3" />
                                                                )
                                                            }
                                                            onClick={() => {
                                                                setIgBusyCommentId(igc.id);
                                                                router.patch(
                                                                    `/instagram/comments/${igc.id}/hide`,
                                                                    { hide: !igc.isHidden },
                                                                    {
                                                                        preserveScroll: true,
                                                                        preserveState: true,
                                                                        onFinish: () => setIgBusyCommentId(null),
                                                                    }
                                                                );
                                                            }}
                                                        >
                                                            {igc.isHidden ? 'Tampilkan' : 'Sembunyikan'}
                                                        </Button>
                                                    )}
                                                    {can?.editContent && !igc.convertedContentItemId && (
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            disabled={igBusyCommentId === igc.id}
                                                            icon={<Lightbulb className="w-3 h-3 text-purple-600" />}
                                                            onClick={() => {
                                                                setIgBusyCommentId(igc.id);
                                                                router.post(
                                                                    `/instagram/comments/${igc.id}/convert`,
                                                                    {},
                                                                    {
                                                                        preserveScroll: true,
                                                                        preserveState: true,
                                                                        onFinish: () => setIgBusyCommentId(null),
                                                                    }
                                                                );
                                                            }}
                                                        >
                                                            Ide Konten
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>

                                            <p className="text-xs text-[var(--md-sys-color-on-surface)] leading-relaxed">
                                                {igc.text}
                                            </p>

                                            {igc.replyText && (
                                                <div className="ml-3 pl-2.5 py-1.5 pr-2 rounded-lg bg-[var(--md-sys-color-surface)] border-l-2 border-emerald-500 text-[11px]">
                                                    <span className="font-bold text-emerald-700 dark:text-emerald-300 block">
                                                        Balasan Resmi ({igc.repliedBy || 'HUMAS'}):
                                                    </span>
                                                    <span className="text-[var(--md-sys-color-on-surface)]">
                                                        {igc.replyText}
                                                    </span>
                                                </div>
                                            )}

                                            {(can?.updateTasks || can?.managePublishing) && !igc.isReplied && (
                                                <form
                                                    onSubmit={(e) => {
                                                        e.preventDefault();
                                                        const msg = (igReplyDrafts[igc.id] ?? '').trim();
                                                        if (!msg) {
                                                            return;
                                                        }
                                                        setIgReplyingId(igc.id);
                                                        router.post(
                                                            `/instagram/comments/${igc.id}/reply`,
                                                            { message: msg },
                                                            {
                                                                preserveScroll: true,
                                                                preserveState: true,
                                                                onSuccess: () =>
                                                                    setIgReplyDrafts((prev) => ({
                                                                        ...prev,
                                                                        [igc.id]: '',
                                                                    })),
                                                                onFinish: () => setIgReplyingId(null),
                                                            }
                                                        );
                                                    }}
                                                    className="flex items-center gap-2 pt-1"
                                                >
                                                    <input
                                                        type="text"
                                                        value={igReplyDrafts[igc.id] ?? ''}
                                                        onChange={(e) =>
                                                            setIgReplyDrafts((prev) => ({
                                                                ...prev,
                                                                [igc.id]: e.target.value,
                                                            }))
                                                        }
                                                        placeholder={`Balas ke @${igc.username}...`}
                                                        className="flex-1 h-8 px-2.5 text-xs rounded-lg bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)]"
                                                    />
                                                    <Button
                                                        type="submit"
                                                        size="sm"
                                                        variant="primary"
                                                        isLoading={igReplyingId === igc.id}
                                                        icon={<Send className="w-3 h-3" />}
                                                    >
                                                        Balas
                                                    </Button>
                                                </form>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 4: WORKFLOW AUDIT HISTORY */}
                    {activeTab === 'history' && (
                        <div className="space-y-2.5">
                            {!item.history || item.history.length === 0 ? (
                                <div className="p-6 text-center text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                    Belum ada riwayat perpindahan status.
                                </div>
                            ) : (
                                item.history.map((h) => (
                                    <div
                                        key={h.id}
                                        className="p-3 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]/40 flex items-start gap-2.5"
                                    >
                                        <History className="w-4 h-4 text-[var(--md-sys-color-primary)] shrink-0 mt-0.5" />
                                        <div className="space-y-0.5 min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2 text-xs">
                                                <span className="font-bold text-[var(--md-sys-color-on-surface)]">
                                                    {h.actor}
                                                </span>
                                                <span className="sparc-code-id text-[10px] text-[var(--md-sys-color-on-surface-muted)] flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> {h.timestamp}
                                                </span>
                                            </div>
                                            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                                {h.note}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* TAB 5: PERFORMA & EVALUASI */}
                    {activeTab === 'performa' && (
                        <div className="space-y-4">
                            {/* Meta / Instagram Graph API Sync Banner */}
                            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-orange-500/10 border border-purple-500/20 space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                                            <RefreshCw className={`w-4 h-4 ${isSyncingIg ? 'animate-spin' : ''}`} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate">
                                                    Instagram Graph API Insights
                                                </p>
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                                    {igHandleLabel}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                                                {perfForm.published_url
                                                    ? 'Tarik metrik reach, views, suka, komentar, bagikan & simpanan murni dari Meta.'
                                                    : `Pilih postingan ${igHandleLabel} atau tempel tautan di bawah.`}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            isLoading={isLoadingRecentIg}
                                            onClick={handleFetchRecentIg}
                                        >
                                            Pilih Postingan {igHandleLabel}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="primary"
                                            size="sm"
                                            disabled={!perfForm.published_url || isSyncingIg}
                                            isLoading={isSyncingIg}
                                            icon={<RefreshCw className="w-3.5 h-3.5" />}
                                            onClick={handleSyncInstagramMetrics}
                                        >
                                            Tarik Metrik IG
                                        </Button>
                                    </div>
                                </div>

                                {(item.reach !== null && item.reach !== undefined) ||
                                (item.saves !== null && item.saves !== undefined) ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-purple-500/20 text-[11px]">
                                        <div className="px-2.5 py-1.5 rounded-xl bg-[var(--md-sys-color-surface)]/80 border border-[var(--md-sys-color-outline-variant)]">
                                            <span className="text-[var(--md-sys-color-on-surface-muted)] block">
                                                Reach Murni (Meta)
                                            </span>
                                            <strong className="sparc-code-id text-xs text-[var(--md-sys-color-on-surface)]">
                                                {item.reach !== null && item.reach !== undefined
                                                    ? item.reach.toLocaleString('id-ID')
                                                    : '—'}
                                            </strong>
                                        </div>
                                        <div className="px-2.5 py-1.5 rounded-xl bg-[var(--md-sys-color-surface)]/80 border border-[var(--md-sys-color-outline-variant)]">
                                            <span className="text-[var(--md-sys-color-on-surface-muted)] block">
                                                Saves Murni (Meta)
                                            </span>
                                            <strong className="sparc-code-id text-xs text-[var(--md-sys-color-on-surface)]">
                                                {item.saves !== null && item.saves !== undefined
                                                    ? item.saves.toLocaleString('id-ID')
                                                    : '—'}
                                            </strong>
                                        </div>
                                        <div className="px-2.5 py-1.5 rounded-xl bg-[var(--md-sys-color-surface)]/80 border border-[var(--md-sys-color-outline-variant)] col-span-2">
                                            <span className="text-[var(--md-sys-color-on-surface-muted)] block">
                                                Terakhir Sinkronisasi Meta
                                            </span>
                                            <strong className="sparc-code-id text-xs text-[var(--md-sys-color-on-surface)]">
                                                {item.metricsSyncedAt || 'Tersinkronisasi'}
                                            </strong>
                                        </div>
                                    </div>
                                ) : null}

                                {showRecentIg && (
                                    <div className="pt-2 border-t border-purple-500/20 space-y-2">
                                        <p className="text-[11px] font-bold text-[var(--md-sys-color-on-surface)]">
                                            Postingan Terbaru dari {igHandleLabel} (klik untuk hubungkan & tarik metrik):
                                        </p>
                                        {recentIgMedia.length === 0 && !isLoadingRecentIg && (
                                            <p className="text-xs text-[var(--md-sys-color-on-surface-muted)] py-1">
                                                Belum ada postingan yang ditemukan di akun ini.
                                            </p>
                                        )}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {recentIgMedia.map((m) => (
                                                <div
                                                    key={m.id}
                                                    onClick={() => handleSelectRecentPost(m.permalink, m.like_count, m.comments_count)}
                                                    className="p-2.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] hover:border-purple-500 cursor-pointer transition-colors space-y-1 group"
                                                >
                                                    <div className="flex items-center justify-between text-[10px] font-bold text-purple-600 dark:text-purple-400">
                                                        <span>{m.media_type === 'VIDEO' ? '🎬 Reels / Video' : '📷 Foto / Feed'}</span>
                                                        <span>{m.like_count ?? 0} suka • {m.comments_count ?? 0} komentar</span>
                                                    </div>
                                                    <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] line-clamp-2 group-hover:text-purple-600 transition-colors">
                                                        {m.caption || '(Tanpa caption)'}
                                                    </p>
                                                    <span className="text-[10px] text-[var(--md-sys-color-on-surface-muted)] truncate block">
                                                        {m.permalink}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Input
                                    label="Link Hasil Desain"
                                    placeholder="Drive / Canva / Figma link..."
                                    value={perfForm.result_design_url}
                                    onChange={(e) =>
                                        setPerfForm((f) => ({ ...f, result_design_url: e.target.value }))
                                    }
                                />
                                <Input
                                    label="Link Upload (Published)"
                                    placeholder="https://instagram.com/p/..."
                                    value={perfForm.published_url}
                                    onChange={(e) =>
                                        setPerfForm((f) => ({ ...f, published_url: e.target.value }))
                                    }
                                />
                            </div>
                            <Textarea
                                label="Catatan Revisi"
                                rows={2}
                                placeholder="Tulis catatan revisi desain di sini..."
                                value={perfForm.revision_note}
                                onChange={(e) =>
                                    setPerfForm((f) => ({ ...f, revision_note: e.target.value }))
                                }
                            />
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <Input
                                    type="number"
                                    min="0"
                                    label="Views"
                                    value={perfForm.views}
                                    onChange={(e) =>
                                        setPerfForm((f) => ({ ...f, views: e.target.value }))
                                    }
                                />
                                <Input
                                    type="number"
                                    label="Likes"
                                    value={perfForm.likes}
                                    onChange={(e) =>
                                        setPerfForm((f) => ({ ...f, likes: e.target.value }))
                                    }
                                />
                                <Input
                                    type="number"
                                    min="0"
                                    label="Komentar"
                                    value={perfForm.comments_count}
                                    onChange={(e) =>
                                        setPerfForm((f) => ({ ...f, comments_count: e.target.value }))
                                    }
                                />
                                <Input
                                    type="number"
                                    min="0"
                                    label="Share"
                                    value={perfForm.shares}
                                    onChange={(e) =>
                                        setPerfForm((f) => ({ ...f, shares: e.target.value }))
                                    }
                                />
                            </div>
                            <Textarea
                                label="Evaluasi Deskriptif Performa"
                                rows={3}
                                placeholder="Analisis performa postingan: hook, engagement, rekomendasi perbaikan..."
                                value={perfForm.performance_notes}
                                onChange={(e) =>
                                    setPerfForm((f) => ({ ...f, performance_notes: e.target.value }))
                                }
                            />
                            <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)] flex justify-end">
                                <Button
                                    type="button"
                                    variant="primary"
                                    size="md"
                                    isLoading={isSavingPerf}
                                    icon={<Save className="w-3.5 h-3.5" />}
                                    onClick={handleSavePerformance}
                                >
                                    Simpan Performa
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </Sheet>

            {/* Destructive Delete Confirmation Modal */}
            <Modal
                isOpen={deleteConfirmOpen}
                onClose={() => setDeleteConfirmOpen(false)}
                title="Pindahkan Konten ke Trash?"
                description={`"${item.contentId} — ${item.title}" akan dipindahkan ke Trash & Recovery selama 30 hari.`}
                maxWidth="sm"
            >
                <div className="flex items-center justify-end gap-2.5 pt-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled={isDeleting}
                        onClick={() => setDeleteConfirmOpen(false)}
                    >
                        Batal
                    </Button>
                    <Button
                        variant="danger"
                        size="sm"
                        isLoading={isDeleting}
                        onClick={handleConfirmDelete}
                    >
                        Ya, Pindahkan ke Trash
                    </Button>
                </div>
            </Modal>

        </>
    );
};
