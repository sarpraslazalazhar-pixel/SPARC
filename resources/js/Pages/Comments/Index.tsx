import React, { useEffect, useMemo, useState } from 'react';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import {
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Eye,
    EyeOff,
    Filter,
    Heart,
    Image as ImageIcon,
    Layers,
    LayoutList,
    Lightbulb,
    MessageCircle,
    RefreshCw,
    Search,
    Send,
    Sparkles,
    Trash2,
    X,
} from 'lucide-react';
import { AppLayout, type SharedWorkspaceProps } from '@/Layouts/AppLayout';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
import { Modal } from '@/Components/UI/Modal';
import { Select } from '@/Components/UI/Select';
import { ContentIdBadge } from '@/Components/UI/Semantics';
import { Tabs } from '@/Components/UI/Tabs';
import { useToast } from '@/Components/UI/Toast';
import type { InstagramPublicComment, SparcSystemSettings, SparcTeamMember } from '@/types/sparc';

export interface PostWithCommentsSummary {
    igMediaId: string;
    contentItemId?: string | null;
    contentCode?: string;
    contentTitle?: string;
    mediaCaptionExcerpt?: string;
    mediaPermalink?: string;
    mediaThumbnailUrl?: string;
    commentsCount: number;
    unrepliedCount: number;
}

interface CommentsPageProps {
    comments: InstagramPublicComment[];
    summary: {
        total: number;
        unreplied: number;
        replied: number;
        hidden: number;
        converted: number;
    };
    postsWithComments?: PostWithCommentsSummary[];
    filters: {
        status: string;
        q: string;
        content_item_id?: string;
        media_id?: string;
    };
    team: SparcTeamMember[];
    instagramSettings?: SparcSystemSettings['instagram'];
}

const QUICK_REPLIES = [
    'Terima kasih atas tanggapannya! Informasi resmi lebih lanjut dapat diakses melalui tautan bio kami.',
    'Halo, terima kasih atas pertanyaannya. Tim layanan kami siap membantu melalui kanal pengaduan resmi.',
    'Apresiasi setinggi-tingginya atas masukan Anda bagi peningkatan kualitas layanan publik kami.',
];

export default function CommentsIndex({
    comments = [],
    summary = { total: 0, unreplied: 0, replied: 0, hidden: 0, converted: 0 },
    postsWithComments = [],
    filters = { status: 'all', q: '', content_item_id: '', media_id: '' },
    team = [],
    instagramSettings,
}: CommentsPageProps) {
    const { props } = usePage<SharedWorkspaceProps>();
    const can = props.auth?.can;
    const { error: toastError } = useToast();

    const [isSyncing, setIsSyncing] = useState(false);
    const [selectedStatus, setSelectedStatus] = useState(filters.status || 'all');
    const [selectedMediaId, setSelectedMediaId] = useState(filters.media_id || 'all');
    const [searchText, setSearchText] = useState(filters.q ?? '');
    const [viewMode, setViewMode] = useState<'grouped' | 'stream'>('grouped');
    const [collapsedPosts, setCollapsedPosts] = useState<Record<string, boolean>>({});

    useEffect(() => {
        setSelectedStatus(filters.status || 'all');
        setSelectedMediaId(filters.media_id || 'all');
        setSearchText(filters.q ?? '');
    }, [filters.status, filters.media_id, filters.q]);

    const [openReplyId, setOpenReplyId] = useState<string | null>(null);
    const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
    const [sendingReplyId, setSendingReplyId] = useState<string | null>(null);
    const [busyActionId, setBusyActionId] = useState<string | null>(null);
    const [convertTarget, setConvertTarget] = useState<InstagramPublicComment | null>(null);

    const convertForm = useForm({
        title: '',
        format: 'reels',
        pillar: 'edukasi',
        pic_name: team[0]?.name ?? 'Nadia Putri',
    });

    const igHandleLabel = props.instagramStatus?.username
        ? `@${props.instagramStatus.username}`
        : 'Akun IG Resmi';

    const applyFilter = (
        nextStatus: string = selectedStatus,
        nextMediaId: string = selectedMediaId,
        nextQ: string = searchText
    ) => {
        const cleanStatus = nextStatus || 'all';
        const cleanMediaId = nextMediaId || 'all';
        setSelectedStatus(cleanStatus);
        setSelectedMediaId(cleanMediaId);

        const queryParams: Record<string, string> = {};
        if (cleanStatus !== 'all') {
            queryParams.status = cleanStatus;
        }
        if (cleanMediaId !== 'all') {
            queryParams.media_id = cleanMediaId;
        }
        if (nextQ.trim() !== '') {
            queryParams.q = nextQ.trim();
        }

        router.get('/instagram/comments', queryParams, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    };

    const handleSyncComments = () => {
        setIsSyncing(true);
        router.post(
            '/instagram/comments/sync',
            {},
            {
                preserveScroll: true,
                onFinish: () => setIsSyncing(false),
            }
        );
    };

    const handleSendReply = (e: React.FormEvent, comment: InstagramPublicComment) => {
        e.preventDefault();
        const msg = (replyDrafts[comment.id] ?? '').trim();
        if (!msg) {
            toastError('Balasan Kosong', 'Ketik pesan balasan resmi terlebih dahulu.');
            return;
        }
        setSendingReplyId(comment.id);
        router.post(
            `/instagram/comments/${comment.id}/reply`,
            { message: msg },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setReplyDrafts((prev) => ({ ...prev, [comment.id]: '' }));
                    setOpenReplyId(null);
                },
                onFinish: () => setSendingReplyId(null),
            }
        );
    };

    const handleToggleHide = (comment: InstagramPublicComment) => {
        setBusyActionId(comment.id);
        router.patch(
            `/instagram/comments/${comment.id}/hide`,
            { hide: !comment.isHidden },
            {
                preserveScroll: true,
                onFinish: () => setBusyActionId(null),
            }
        );
    };

    const handleDeleteComment = (comment: InstagramPublicComment) => {
        if (!confirm(`Hapus permanen komentar dari @${comment.username} dari Instagram?`)) {
            return;
        }
        setBusyActionId(comment.id);
        router.delete(`/instagram/comments/${comment.id}`, {
            preserveScroll: true,
            onFinish: () => setBusyActionId(null),
        });
    };

    const openConvertModal = (comment: InstagramPublicComment) => {
        setConvertTarget(comment);
        const snippet = comment.text.trim() ? comment.text.slice(0, 60) : 'Komentar Audiens IG';
        convertForm.setData({
            title: `Tanggapan @${comment.username}: ${snippet}`,
            format: 'reels',
            pillar: 'edukasi',
            pic_name: team[0]?.name ?? 'Nadia Putri',
        });
    };

    const submitConvert = (e: React.FormEvent) => {
        e.preventDefault();
        if (!convertTarget) {
            return;
        }
        convertForm.post(`/instagram/comments/${convertTarget.id}/convert`, {
            preserveScroll: true,
            onSuccess: () => setConvertTarget(null),
        });
    };

    const toggleCollapsePost = (postKey: string) => {
        setCollapsedPosts((prev) => ({ ...prev, [postKey]: !prev[postKey] }));
    };

    // Instant client-side + server-synced filtered comments
    const filteredComments = useMemo(() => {
        const qLower = searchText.trim().toLowerCase();
        return comments.filter((cm) => {
            if (selectedMediaId && selectedMediaId !== 'all' && cm.igMediaId !== selectedMediaId) {
                return false;
            }
            if (selectedStatus === 'unreplied' && (cm.isReplied || cm.isHidden)) {
                return false;
            }
            if (selectedStatus === 'replied' && !cm.isReplied) {
                return false;
            }
            if (selectedStatus === 'hidden' && !cm.isHidden) {
                return false;
            }
            if (selectedStatus === 'converted' && !cm.convertedContentItemId) {
                return false;
            }
            if (qLower !== '') {
                const hay = `${cm.username} ${cm.text} ${cm.contentTitle ?? ''} ${cm.mediaCaptionExcerpt ?? ''}`.toLowerCase();
                if (!hay.includes(qLower)) {
                    return false;
                }
            }
            return true;
        });
    }, [comments, selectedMediaId, selectedStatus, searchText]);

    // Group comments by target post
    const groupedByPost = useMemo(() => {
        const map = new Map<
            string,
            {
                key: string;
                mediaId?: string;
                contentCode?: string;
                contentTitle?: string;
                mediaCaptionExcerpt?: string;
                mediaPermalink?: string;
                mediaThumbnailUrl?: string;
                unrepliedCount: number;
                comments: InstagramPublicComment[];
            }
        >();

        filteredComments.forEach((cm) => {
            const postKey = cm.igMediaId || cm.contentItemId || cm.mediaPermalink || 'unlinked';
            if (!map.has(postKey)) {
                map.set(postKey, {
                    key: postKey,
                    mediaId: cm.igMediaId,
                    contentCode: cm.contentCode,
                    contentTitle: cm.contentTitle,
                    mediaCaptionExcerpt: cm.mediaCaptionExcerpt,
                    mediaPermalink: cm.mediaPermalink,
                    mediaThumbnailUrl: cm.mediaThumbnailUrl,
                    unrepliedCount: 0,
                    comments: [],
                });
            }
            const group = map.get(postKey)!;
            group.comments.push(cm);
            if (!cm.isReplied && !cm.isHidden) {
                group.unrepliedCount++;
            }
        });

        return Array.from(map.values()).sort((a, b) => b.unrepliedCount - a.unrepliedCount);
    }, [filteredComments]);

    // Active filtered post summary if user selected a single post
    const activeFilteredPost = useMemo(() => {
        if (!selectedMediaId || selectedMediaId === 'all') return null;
        return (
            postsWithComments.find((p) => p.igMediaId === selectedMediaId) ||
            groupedByPost.find((g) => g.mediaId === selectedMediaId) ||
            null
        );
    }, [selectedMediaId, postsWithComments, groupedByPost]);

    // Helper: Render single comment item
    const renderCommentItem = (cm: InstagramPublicComment, showPostHeader = false) => {
        const isReplyOpen = openReplyId === cm.id;
        const isBusy = busyActionId === cm.id;

        return (
            <div
                key={cm.id}
                className={`p-4 rounded-xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border transition-all ${
                    cm.isHidden
                        ? 'border-amber-500/35 opacity-75'
                        : 'border-[var(--md-sys-color-outline-variant)]'
                }`}
            >
                {/* Prominent Top Post Ribbon (used in stream/feed view) */}
                {showPostHeader && (
                    <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-[var(--md-sys-color-outline-variant)]/60 bg-[var(--md-sys-color-surface-container-low)] -mx-4 -mt-4 p-3 rounded-t-xl">
                        <div className="flex items-center gap-2.5 min-w-0">
                            {cm.mediaThumbnailUrl ? (
                                <img
                                    src={cm.mediaThumbnailUrl}
                                    alt="Post thumbnail"
                                    className="w-8 h-8 rounded-lg object-cover shrink-0 border border-[var(--md-sys-color-outline-variant)]"
                                />
                            ) : (
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white shrink-0">
                                    <ImageIcon className="w-4 h-4" />
                                </div>
                            )}
                            <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                    {cm.contentCode && <ContentIdBadge contentId={cm.contentCode} />}
                                    <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate block max-w-sm">
                                        {cm.contentTitle || cm.mediaCaptionExcerpt || 'Postingan Instagram'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            {cm.igMediaId && (
                                <button
                                    type="button"
                                    onClick={() => applyFilter(selectedStatus, cm.igMediaId, searchText)}
                                    className="text-[11px] font-semibold text-[var(--md-sys-color-primary)] hover:underline flex items-center gap-1"
                                    title="Filter hanya komentar untuk postingan ini"
                                >
                                    <Filter className="w-3 h-3" /> Hanya Post Ini
                                </button>
                            )}
                            {cm.mediaPermalink && (
                                <a
                                    href={cm.mediaPermalink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface-muted)] hover:text-[var(--md-sys-color-primary)] inline-flex items-center gap-1"
                                >
                                    Buka IG <ExternalLink className="w-3 h-3" />
                                </a>
                            )}
                        </div>
                    </div>
                )}

                {/* Comment Content */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-extrabold text-[var(--md-sys-color-on-surface)]">
                                @{cm.username}
                            </span>
                            <span className="sparc-code-id text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                • {cm.commentedAt}
                            </span>
                            {cm.likeCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                                    <Heart className="w-3 h-3 fill-current" /> {cm.likeCount}
                                </span>
                            )}
                            {cm.isReplied ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                    <CheckCircle2 className="w-3 h-3" /> Sudah Dibalas
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                    Menunggu Balasan
                                </span>
                            )}
                            {cm.isHidden && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/15 text-slate-600 dark:text-slate-300">
                                    <EyeOff className="w-3 h-3" /> Disembunyikan di IG
                                </span>
                            )}
                            {cm.convertedContentCode && (
                                <Link
                                    href="/content"
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 hover:underline"
                                >
                                    <Lightbulb className="w-3 h-3" /> Ide {cm.convertedContentCode}
                                </Link>
                            )}
                        </div>

                        <p className="text-sm text-[var(--md-sys-color-on-surface)] leading-relaxed">
                            {cm.text.trim() ? (
                                cm.text
                            ) : (
                                <span className="italic text-[var(--md-sys-color-on-surface-muted)]">
                                    [Stiker / GIF Instagram]
                                </span>
                            )}
                        </p>
                    </div>

                    {/* Moderation Actions */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {(can?.updateTasks || can?.managePublishing) && (
                            <>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={isReplyOpen ? 'primary' : 'outline'}
                                    icon={<Send className="w-3 h-3" />}
                                    onClick={() => setOpenReplyId(isReplyOpen ? null : cm.id)}
                                >
                                    Balas
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={isBusy}
                                    icon={cm.isHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                    onClick={() => handleToggleHide(cm)}
                                >
                                    {cm.isHidden ? 'Tampilkan' : 'Sembunyikan'}
                                </Button>
                            </>
                        )}

                        {can?.editContent && !cm.convertedContentItemId && (
                            <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                icon={<Lightbulb className="w-3 h-3" />}
                                onClick={() => openConvertModal(cm)}
                            >
                                Jadikan Ide Konten
                            </Button>
                        )}

                        {(can?.managePublishing || can?.approveContent) && (
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={isBusy}
                                className="text-red-600 hover:bg-red-500/10"
                                onClick={() => handleDeleteComment(cm)}
                                title="Hapus permanen dari Instagram"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                        )}
                    </div>
                </div>

                {/* Official Reply Bubble */}
                {cm.replyText && (
                    <div className="ml-4 pl-3.5 py-2.5 pr-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border-l-2 border-emerald-500 text-xs space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-emerald-700 dark:text-emerald-300">
                                Balasan Resmi ({cm.repliedBy || 'HUMAS'})
                            </span>
                            {cm.repliedAt && (
                                <span className="sparc-code-id text-[var(--md-sys-color-on-surface-muted)]">
                                    {cm.repliedAt}
                                </span>
                            )}
                        </div>
                        <p className="text-[var(--md-sys-color-on-surface)]">{cm.replyText}</p>
                    </div>
                )}

                {/* Inline Reply Composer */}
                {isReplyOpen && (
                    <form
                        onSubmit={(e) => handleSendReply(e, cm)}
                        className="pt-3 border-t border-[var(--md-sys-color-outline-variant)]/70 space-y-2.5"
                    >
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block">
                                Balas sebagai {igHandleLabel}:
                            </label>
                            <textarea
                                rows={2}
                                value={replyDrafts[cm.id] ?? ''}
                                onChange={(e) =>
                                    setReplyDrafts((prev) => ({
                                        ...prev,
                                        [cm.id]: e.target.value,
                                    }))
                                }
                                placeholder="Ketik balasan resmi institusi..."
                                className="w-full text-xs p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25"
                            />
                        </div>

                        {/* Quick Replies chips */}
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] text-[var(--md-sys-color-on-surface-muted)] font-semibold flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-amber-500" /> Template Cepat:
                            </span>
                            {QUICK_REPLIES.map((tmpl, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() =>
                                        setReplyDrafts((prev) => ({
                                            ...prev,
                                            [cm.id]: tmpl,
                                        }))
                                    }
                                    className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] hover:border-[var(--md-sys-color-primary)] transition-colors"
                                >
                                    Tanggapan #{idx + 1}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                            <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => setOpenReplyId(null)}
                            >
                                Batal
                            </Button>
                            <Button
                                type="submit"
                                size="sm"
                                variant="primary"
                                isLoading={sendingReplyId === cm.id}
                                icon={<Send className="w-3 h-3" />}
                            >
                                Kirim ke Instagram
                            </Button>
                        </div>
                    </form>
                )}
            </div>
        );
    };

    return (
        <AppLayout
            title="Moderasi Komentar Instagram"
            subtitle="Satu meja kerja terpusat tanggapan audiens publik, deteksi postingan, pembalasan resmi, dan penjaringan ide konten"
            actions={
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        isLoading={isSyncing}
                        icon={<RefreshCw className="w-3.5 h-3.5" />}
                        onClick={handleSyncComments}
                    >
                        Tarik Komentar IG
                    </Button>
                </div>
            }
        >
            <Head title="Moderasi Komentar Instagram - SPARC" />

            <div className="space-y-5">
                {/* Metrics Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                        <span className="sparc-eyebrow block">Total Komentar</span>
                        <span className="sparc-code-id text-2xl font-black text-[var(--md-sys-color-on-surface)] mt-1 block">
                            {summary.total}
                        </span>
                    </div>
                    <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                        <span className="sparc-eyebrow block">Belum Dibalas</span>
                        <span className="sparc-code-id text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 block">
                            {summary.unreplied}
                        </span>
                    </div>
                    <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                        <span className="sparc-eyebrow block">Sudah Dibalas</span>
                        <span className="sparc-code-id text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
                            {summary.replied}
                        </span>
                    </div>
                    <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                        <span className="sparc-eyebrow block">Disembunyikan</span>
                        <span className="sparc-code-id text-2xl font-black text-[var(--md-sys-color-on-surface-variant)] mt-1 block">
                            {summary.hidden}
                        </span>
                    </div>
                    <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] col-span-2 sm:col-span-1">
                        <span className="sparc-eyebrow block">Jadi Ide Konten</span>
                        <span className="sparc-code-id text-2xl font-black text-[var(--md-sys-color-primary)] mt-1 block">
                            {summary.converted}
                        </span>
                    </div>
                </div>

                {/* Filter Toolbar: Status Tabs, Post Dropdown, Search & View Switcher */}
                <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-4 rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-3.5">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        {/* Status Tabs */}
                        <Tabs
                            tabs={[
                                { id: 'all', label: `Semua (${summary.total})` },
                                { id: 'unreplied', label: `Belum Dibalas (${summary.unreplied})` },
                                { id: 'replied', label: `Dibalas (${summary.replied})` },
                                { id: 'hidden', label: `Disembunyikan (${summary.hidden})` },
                                { id: 'converted', label: `Ide Konten (${summary.converted})` },
                            ]}
                            activeTab={selectedStatus}
                            onChange={(id) => applyFilter(id, selectedMediaId, searchText)}
                        />

                        {/* View Mode Toggle Switcher */}
                        <div className="flex items-center gap-1.5 bg-[var(--md-sys-color-surface-container-high)] p-1 rounded-xl shrink-0 self-start lg:self-center">
                            <button
                                type="button"
                                onClick={() => setViewMode('grouped')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    viewMode === 'grouped'
                                        ? 'bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-primary)] shadow-xs'
                                        : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                                }`}
                                title="Kelompokkan komentar berdasarkan postingan Instagram"
                            >
                                <Layers className="w-3.5 h-3.5" /> Per Postingan
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('stream')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    viewMode === 'stream'
                                        ? 'bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-primary)] shadow-xs'
                                        : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                                }`}
                                title="Tampilan linimasa semua komentar dengan label postingan"
                            >
                                <LayoutList className="w-3.5 h-3.5" /> Semua Komen
                            </button>
                        </div>
                    </div>

                    {/* Secondary Row: Post Selector & Search Input */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[var(--md-sys-color-outline-variant)]/60">
                        {/* Dropdown Filter Postingan Spesifik */}
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <Filter className="w-4 h-4 text-[var(--md-sys-color-on-surface-muted)] shrink-0" />
                            <select
                                value={selectedMediaId}
                                onChange={(e) => applyFilter(selectedStatus, e.target.value, searchText)}
                                className="w-full sm:w-80 h-9 px-3 text-xs rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25"
                            >
                                <option value="all">
                                    -- Semua Postingan ({postsWithComments.length} postingan aktif) --
                                </option>
                                {postsWithComments.map((p) => {
                                    const titleLabel = p.contentTitle || p.mediaCaptionExcerpt?.slice(0, 40) || 'Postingan IG';
                                    const codePrefix = p.contentCode ? `[${p.contentCode}] ` : '';
                                    return (
                                        <option key={p.igMediaId} value={p.igMediaId}>
                                            {codePrefix}{titleLabel} ({p.commentsCount} komen{p.unrepliedCount > 0 ? `, ${p.unrepliedCount} baru` : ''})
                                        </option>
                                    );
                                })}
                            </select>
                        </div>

                        {/* Search Input */}
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                applyFilter(selectedStatus, selectedMediaId, searchText);
                            }}
                            className="relative w-full sm:w-72"
                        >
                            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--md-sys-color-on-surface-muted)] pointer-events-none" />
                            <input
                                type="search"
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                placeholder="Cari @username atau teks..."
                                className="w-full h-9 pl-9 pr-3 text-xs rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25"
                            />
                        </form>
                    </div>
                </div>

                {/* Active Post Filter Ribbon (if filtering single post) */}
                {Boolean(selectedMediaId && selectedMediaId !== 'all') && (
                    <div className="p-3.5 rounded-2xl bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border border-[var(--md-sys-color-primary)]/25 flex items-center justify-between gap-3 text-xs shadow-xs animate-in fade-in duration-200">
                        <div className="flex items-center gap-3 min-w-0">
                            {activeFilteredPost?.mediaThumbnailUrl ? (
                                <img
                                    src={activeFilteredPost.mediaThumbnailUrl}
                                    alt="Post thumbnail"
                                    className="w-9 h-9 rounded-lg object-cover shrink-0 border border-white/20 shadow-xs"
                                />
                            ) : (
                                <div className="w-9 h-9 rounded-lg bg-[var(--md-sys-color-primary)] text-white flex items-center justify-center shrink-0">
                                    <ImageIcon className="w-4 h-4" />
                                </div>
                            )}
                            <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-extrabold uppercase tracking-wider text-[10px] opacity-80">
                                        Fokus Postingan:
                                    </span>
                                    {activeFilteredPost?.contentCode && (
                                        <span className="sparc-code-id font-bold px-1.5 py-0.2 rounded bg-black/10 dark:bg-white/10 text-[10px]">
                                            {activeFilteredPost.contentCode}
                                        </span>
                                    )}
                                </div>
                                <p className="font-bold truncate text-sm">
                                    {activeFilteredPost?.contentTitle || activeFilteredPost?.mediaCaptionExcerpt || selectedMediaId}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            {activeFilteredPost?.mediaPermalink && (
                                <a
                                    href={activeFilteredPost.mediaPermalink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs font-bold hover:underline inline-flex items-center gap-1 opacity-90 hover:opacity-100"
                                >
                                    Buka IG <ExternalLink className="w-3 h-3" />
                                </a>
                            )}
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="bg-white/10 border-white/20 hover:bg-white/20"
                                icon={<X className="w-3.5 h-3.5" />}
                                onClick={() => applyFilter(selectedStatus, 'all', searchText)}
                            >
                                Reset Fokus Post
                            </Button>
                        </div>
                    </div>
                )}

                {/* Comments Content Display */}
                {filteredComments.length === 0 ? (
                    <div className="p-12 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] text-center space-y-2">
                        <MessageCircle className="w-9 h-9 text-[var(--md-sys-color-on-surface-muted)] mx-auto" />
                        <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                            Belum ada komentar publik pada filter ini
                        </p>
                        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                            Klik tombol <strong>Tarik Komentar IG</strong> di kanan atas untuk menyinkronkan tanggapan audiens terbaru dari Meta Graph API.
                        </p>
                    </div>
                ) : viewMode === 'grouped' ? (
                    /* VIEW 1: GROUPED BY POST (Clear & Organized) */
                    <div className="space-y-4">
                        {groupedByPost.map((postGroup) => {
                            const isCollapsed = Boolean(collapsedPosts[postGroup.key]);
                            return (
                                <div
                                    key={postGroup.key}
                                    className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] shadow-[var(--md-elevation-1)] overflow-hidden space-y-0"
                                >
                                    {/* Big Post Identity Header Card */}
                                    <div className="p-4 bg-[var(--md-sys-color-surface-container-low)]/80 border-b border-[var(--md-sys-color-outline-variant)] flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                                        <div className="flex items-center gap-3 min-w-0">
                                            {postGroup.mediaThumbnailUrl ? (
                                                <img
                                                    src={postGroup.mediaThumbnailUrl}
                                                    alt="Thumbnail"
                                                    className="w-12 h-12 rounded-xl object-cover shrink-0 border border-[var(--md-sys-color-outline-variant)] shadow-xs"
                                                />
                                            ) : (
                                                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                                                    <ImageIcon className="w-6 h-6" />
                                                </div>
                                            )}
                                            <div className="min-w-0 space-y-0.5">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {postGroup.contentCode && (
                                                        <ContentIdBadge contentId={postGroup.contentCode} />
                                                    )}
                                                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)]">
                                                        {postGroup.comments.length} Komentar
                                                    </span>
                                                    {postGroup.unrepliedCount > 0 && (
                                                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/30">
                                                            {postGroup.unrepliedCount} Belum Dibalas
                                                        </span>
                                                    )}
                                                </div>
                                                <h4 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] truncate max-w-xl">
                                                    {postGroup.contentTitle || postGroup.mediaCaptionExcerpt || 'Postingan Instagram'}
                                                </h4>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                            {postGroup.mediaId && selectedMediaId !== postGroup.mediaId && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    icon={<Filter className="w-3.5 h-3.5" />}
                                                    onClick={() => applyFilter(selectedStatus, postGroup.mediaId!, searchText)}
                                                >
                                                    Fokus Post Ini
                                                </Button>
                                            )}
                                            {postGroup.mediaPermalink && (
                                                <a
                                                    href={postGroup.mediaPermalink}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-xs font-bold text-[var(--md-sys-color-primary)] hover:underline inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)]"
                                                >
                                                    Buka IG <ExternalLink className="w-3.5 h-3.5" />
                                                </a>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => toggleCollapsePost(postGroup.key)}
                                                className="p-1.5 rounded-lg border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
                                                title={isCollapsed ? 'Tampilkan Komentar' : 'Sembunyikan Komentar'}
                                            >
                                                {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Nested Comments for this Post */}
                                    {!isCollapsed ? (
                                        <div className="p-4 space-y-3 bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)]/30 divide-y divide-[var(--md-sys-color-outline-variant)]/50">
                                            {postGroup.comments.map((cm, idx) => (
                                                <div key={cm.id} className={idx > 0 ? 'pt-3' : ''}>
                                                    {renderCommentItem(cm, false)}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div
                                            onClick={() => toggleCollapsePost(postGroup.key)}
                                            className="p-3 text-center text-xs text-[var(--md-sys-color-on-surface-muted)] cursor-pointer hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors"
                                        >
                                            {postGroup.comments.length} komentar disembunyikan. Klik untuk menampilkan.
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* VIEW 2: STREAM WITH TOP POST CONTEXT RIBBON */
                    <div className="space-y-3.5">
                        {filteredComments.map((cm) => renderCommentItem(cm, true))}
                    </div>
                )}
            </div>

            {/* Convert Comment to Content Idea Modal */}
            <Modal
                isOpen={Boolean(convertTarget)}
                onClose={() => setConvertTarget(null)}
                title="Jadikan Komentar Sebagai Ide Konten"
            >
                <form onSubmit={submitConvert} className="space-y-4">
                    {convertTarget && (
                        <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] text-xs space-y-1">
                            <span className="font-bold text-[var(--md-sys-color-on-surface)] block">
                                Pertanyaan @{convertTarget.username}:
                            </span>
                            <p className="text-[var(--md-sys-color-on-surface-variant)] italic">
                                &ldquo;{convertTarget.text}&rdquo;
                            </p>
                        </div>
                    )}

                    <Input
                        label="Judul Rencana Konten"
                        required
                        value={convertForm.data.title}
                        onChange={(e) => convertForm.setData('title', e.target.value)}
                        error={convertForm.errors.title}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Select
                            label="Format Produksi"
                            value={convertForm.data.format}
                            onChange={(e) => convertForm.setData('format', e.target.value)}
                        >
                            <option value="reels">Instagram Reels (9:16)</option>
                            <option value="carousel">Carousel Edukasi (4:5)</option>
                            <option value="feed">Single Feed Infografis</option>
                        </Select>
                        <Select
                            label="Pilar Komunikasi"
                            value={convertForm.data.pillar}
                            onChange={(e) => convertForm.setData('pillar', e.target.value)}
                        >
                            <option value="edukasi">Edukasi Publik</option>
                            <option value="kelembagaan">Kelembagaan & Layanan</option>
                            <option value="program">Program Prioritas</option>
                            <option value="inspirasi">Inspirasi & Humanis</option>
                        </Select>
                    </div>

                    <Select
                        label="PIC Perencana"
                        value={convertForm.data.pic_name}
                        onChange={(e) => convertForm.setData('pic_name', e.target.value)}
                    >
                        {(team.length > 0 ? team : [{ id: '1', name: 'Nadia Putri' }]).map((m) => (
                            <option key={m.id} value={m.name}>
                                {m.name}
                            </option>
                        ))}
                    </Select>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="ghost" onClick={() => setConvertTarget(null)}>
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            isLoading={convertForm.processing}
                            icon={<Lightbulb className="w-3.5 h-3.5" />}
                        >
                            Simpan ke Inbox Konten
                        </Button>
                    </div>
                </form>
            </Modal>
        </AppLayout>
    );
}
