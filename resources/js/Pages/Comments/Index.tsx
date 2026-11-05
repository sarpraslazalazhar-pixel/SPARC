import React, { useState } from 'react';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import {
    CheckCircle2,
    ExternalLink,
    Eye,
    EyeOff,
    Heart,
    Lightbulb,
    MessageCircle,
    RefreshCw,
    Search,
    Send,
    Sparkles,
    Trash2,
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

interface CommentsPageProps {
    comments: InstagramPublicComment[];
    summary: {
        total: number;
        unreplied: number;
        replied: number;
        hidden: number;
        converted: number;
    };
    filters: {
        status: string;
        q: string;
        content_item_id: string;
    };
    team: SparcTeamMember[];
    instagramSettings?: SparcSystemSettings['instagram'];
}

const QUICK_REPLIES = [
    'Terima kasih atas tanggapannya! Informasi resmi lebih lanjut dapat diakses melalui kanal bio kami.',
    'Halo, terima kasih atas pertanyaannya. Tim layanan kami siap membantu melalui kanal pengaduan resmi.',
    'Apresiasi setinggi-tingginya atas masukan Anda bagi peningkatan kualitas layanan publik kami.',
];

export default function CommentsIndex({
    comments = [],
    summary = { total: 0, unreplied: 0, replied: 0, hidden: 0, converted: 0 },
    filters = { status: 'all', q: '', content_item_id: '' },
    team = [],
    instagramSettings,
}: CommentsPageProps) {
    const { props } = usePage<SharedWorkspaceProps>();
    const can = props.auth?.can;
    const { error: toastError } = useToast();

    const [isSyncing, setIsSyncing] = useState(false);
    const [searchText, setSearchText] = useState(filters.q ?? '');
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

    const applyFilter = (nextStatus: string, nextQ = searchText) => {
        router.get(
            '/instagram/comments',
            {
                status: nextStatus === 'all' ? undefined : nextStatus,
                q: nextQ.trim() || undefined,
            },
            { preserveState: true, preserveScroll: true }
        );
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
        if (!confirm(`Hapus permanen komentar publik dari @${comment.username} di Instagram?`)) {
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
        convertForm.setData({
            title: `Menjawab @${comment.username}: ${comment.text.slice(0, 65)}`,
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

    return (
        <AppLayout
            title="IG Comments Moderation"
            subtitle="Kotak masuk terpusat tanggapan publik Instagram, balasan resmi instansi, moderasi visibilitas, dan konversi aspirasi menjadi ide konten"
            actions={
                (can?.updateTasks || can?.managePublishing) && (
                    <Button
                        variant="primary"
                        size="sm"
                        isLoading={isSyncing}
                        icon={<RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />}
                        onClick={handleSyncComments}
                    >
                        Tarik Komentar IG
                    </Button>
                )
            }
        >
            <Head title="IG Comments Moderation - SPARC" />

            <div className="space-y-5">
                {!instagramSettings?.connected && (
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5">
                            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                            <span className="text-[var(--md-sys-color-on-surface)] font-medium">
                                Akun Instagram Bisnis belum terhubung. Aktifkan izin{' '}
                                <code className="font-mono font-bold">instagram_manage_comments</code> di menu Pengaturan agar SPARC dapat menarik dan membalas komentar publik.
                            </span>
                        </div>
                        {can?.manageSettings && (
                            <Link
                                href="/settings"
                                className="px-3 py-1.5 rounded-xl bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-bold"
                            >
                                Buka Pengaturan
                            </Link>
                        )}
                    </div>
                )}

                {/* Summary KPI Strip */}
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

                {/* Filter Tabs & Search */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <Tabs
                        tabs={[
                            { id: 'all', label: `Semua (${summary.total})` },
                            { id: 'unreplied', label: `Belum Dibalas (${summary.unreplied})` },
                            { id: 'replied', label: `Dibalas (${summary.replied})` },
                            { id: 'hidden', label: `Disembunyikan (${summary.hidden})` },
                            { id: 'converted', label: `Ide Konten (${summary.converted})` },
                        ]}
                        activeTab={filters.status || 'all'}
                        onChange={(id) => applyFilter(id)}
                    />

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            applyFilter(filters.status || 'all', searchText);
                        }}
                        className="relative w-full md:w-72"
                    >
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--md-sys-color-on-surface-muted)] pointer-events-none" />
                        <input
                            type="search"
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            placeholder="Cari @username atau isi komentar..."
                            className="w-full h-9 pl-9 pr-3 text-xs rounded-xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25"
                        />
                    </form>
                </div>

                {/* Comments Stream */}
                <div className="space-y-3.5">
                    {comments.length === 0 ? (
                        <div className="p-12 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] text-center space-y-2">
                            <MessageCircle className="w-9 h-9 text-[var(--md-sys-color-on-surface-muted)] mx-auto" />
                            <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                Belum ada komentar publik pada filter ini
                            </p>
                            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                Klik tombol <strong>Tarik Komentar IG</strong> di kanan atas untuk menyinkronkan tanggapan audiens terbaru dari Meta Graph API.
                            </p>
                        </div>
                    ) : (
                        comments.map((cm) => {
                            const isReplyOpen = openReplyId === cm.id;
                            const isBusy = busyActionId === cm.id;

                            return (
                                <div
                                    key={cm.id}
                                    className={`p-5 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border shadow-[var(--md-elevation-1)] space-y-3.5 transition-opacity ${
                                        cm.isHidden
                                            ? 'border-amber-500/35 opacity-80'
                                            : 'border-[var(--md-sys-color-outline-variant)]'
                                    }`}
                                >
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
                                                {cm.text}
                                            </p>

                                            {/* Source Post Context */}
                                            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                                                {cm.contentCode && <ContentIdBadge contentId={cm.contentCode} />}
                                                <span className="truncate max-w-md">
                                                    Pada: {cm.contentTitle || cm.mediaCaptionExcerpt || 'Postingan Instagram'}
                                                </span>
                                                {cm.mediaPermalink && (
                                                    <a
                                                        href={cm.mediaPermalink}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-1 font-semibold text-[var(--md-sys-color-primary)] hover:underline"
                                                    >
                                                        Buka di IG <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                )}
                                            </div>
                                        </div>

                                        {/* Moderation Action Buttons */}
                                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                            {(can?.updateTasks || can?.managePublishing) && (
                                                <>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant={isReplyOpen ? 'primary' : 'outline'}
                                                        icon={<Send className="w-3 h-3" />}
                                                        onClick={() =>
                                                            setOpenReplyId(isReplyOpen ? null : cm.id)
                                                        }
                                                    >
                                                        Balas
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={isBusy}
                                                        icon={
                                                            cm.isHidden ? (
                                                                <Eye className="w-3 h-3" />
                                                            ) : (
                                                                <EyeOff className="w-3 h-3" />
                                                            )
                                                        }
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
                                            <div className="flex flex-wrap gap-1.5">
                                                {QUICK_REPLIES.map((tpl, idx) => (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        onClick={() =>
                                                            setReplyDrafts((prev) => ({
                                                                ...prev,
                                                                [cm.id]: tpl,
                                                            }))
                                                        }
                                                        className="px-2.5 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-low)] hover:bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-[11px] text-[var(--md-sys-color-on-surface-variant)] cursor-pointer transition-colors"
                                                    >
                                                        Template #{idx + 1}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex flex-col sm:flex-row gap-2">
                                                <input
                                                    type="text"
                                                    value={replyDrafts[cm.id] ?? ''}
                                                    onChange={(e) =>
                                                        setReplyDrafts((prev) => ({
                                                            ...prev,
                                                            [cm.id]: e.target.value,
                                                        }))
                                                    }
                                                    placeholder={`Balas publik ke @${cm.username}...`}
                                                    className="flex-1 h-9 px-3 text-xs rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)]"
                                                />
                                                <Button
                                                    type="submit"
                                                    variant="primary"
                                                    size="sm"
                                                    isLoading={sendingReplyId === cm.id}
                                                    icon={<Send className="w-3.5 h-3.5" />}
                                                >
                                                    Kirim ke Instagram
                                                </Button>
                                            </div>
                                        </form>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
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
