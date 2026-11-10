import React, { useEffect, useMemo, useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import {
    Search,
    Video,
    Image as ImageIcon,
    ExternalLink,
    User,
    Calendar,
    Paperclip,
    AlertTriangle,
    ArrowRight,
    Eye,
    Ban,
    RotateCcw,
    Sparkles,
    RefreshCw,
    CheckCircle2,
    MessageSquare,
    Clock,
    Pause,
    Play,
    Send,
    XCircle,
} from 'lucide-react';
import { AppLayout } from '@/Layouts/AppLayout';
import { Button } from '@/Components/UI/Button';
import { Badge } from '@/Components/UI/Badge';
import { Sheet } from '@/Components/UI/Sheet';
import { Modal } from '@/Components/UI/Modal';
import { Tabs } from '@/Components/UI/Tabs';
import { Input } from '@/Components/UI/Input';
import { Textarea } from '@/Components/UI/Textarea';
import { useToast } from '@/Components/UI/Toast';
export interface TicketAttachment {
    id?: string;
    fileName: string;
    url: string;
    fileSize?: string;
}

export interface TicketUpdateLog {
    id: string;
    label: string;
    oldValue: string;
    newValue: string;
    updatedAt: string;
}

export interface IncomingTicket {
    id: string;
    haloapuTicketId: string;
    sourceType: 'video_reels' | 'desain_feed';
    title: string;
    brief: string;
    requesterName: string;
    targetDate: string;
    haloapuStatus: 'open' | 'on_proses' | 'pending' | 'need_revision' | 'solve' | 'reject' | 'dibatalkan';
    syncStatus: 'pending' | 'converted' | 'ignored';
    formSnapshot: Record<string, string>;
    attachments: TicketAttachment[];
    updateLogs?: TicketUpdateLog[];
    convertedProjectId?: string;
    createdAt: string;
    revisionCount?: number;
    isResultAccepted?: boolean;
    isSlaBreached?: boolean;
    slaResponseDeadline?: string;
    slaResolutionDeadline?: string;
    logs?: Array<{
        id: string;
        aksi: string;
        actor: string;
        catatan: string;
        timestamp: string;
    }>;
}

interface IncomingProps {
    tickets?: IncomingTicket[];
    ticketOverrides?: Record<string, IncomingTicket['syncStatus']>;
}

const DEFAULT_TICKETS: IncomingTicket[] = [];

export default function IncomingIndex({
    tickets: initialTickets,
    ticketOverrides = {},
}: IncomingProps) {
    const { success: toastSuccess, warning, info, error } = useToast();

    const mergedTickets = useMemo(() => {
        const source = initialTickets || DEFAULT_TICKETS;
        return source.map((t) =>
            ticketOverrides[t.id] ? { ...t, syncStatus: ticketOverrides[t.id] } : t
        );
    }, [initialTickets, ticketOverrides]);

    const [tickets, setTickets] = useState<IncomingTicket[]>(mergedTickets);

    useEffect(() => {
        setTickets(mergedTickets);
    }, [mergedTickets]);

    const [selectedTicket, setSelectedTicket] = useState<IncomingTicket | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
    const [savingAssetId, setSavingAssetId] = useState<string | null>(null);
    const [savedAssetIds, setSavedAssetIds] = useState<string[]>([]);
    // Lifecycle action states
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [rejectCatatan, setRejectCatatan] = useState('');
    const [isRejecting, setIsRejecting] = useState(false);

    const [pauseModalOpen, setPauseModalOpen] = useState(false);
    const [pauseCatatan, setPauseCatatan] = useState('');
    const [isPausing, setIsPausing] = useState(false);

    const [isResuming, setIsResuming] = useState(false);

    const [replyModalOpen, setReplyModalOpen] = useState(false);
    const [replyCatatan, setReplyCatatan] = useState('');
    const [isReplying, setIsReplying] = useState(false);

    const [deliverModalOpen, setDeliverModalOpen] = useState(false);
    const [deliverUrl, setDeliverUrl] = useState('');
    const [deliverCatatan, setDeliverCatatan] = useState('');
    const [isDelivering, setIsDelivering] = useState(false);
    const [activeTab, setActiveTab] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');


    const filteredTickets = useMemo(() => {
        return tickets.filter((ticket) => {
            if (activeTab === 'reels' && ticket.sourceType !== 'video_reels') {
                return false;
            }
            if (activeTab === 'feed' && ticket.sourceType !== 'desain_feed') {
                return false;
            }
            if (statusFilter !== 'all' && ticket.syncStatus !== statusFilter) {
                return false;
            }

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchTitle = ticket.title.toLowerCase().includes(q);
                const matchId = ticket.haloapuTicketId.toLowerCase().includes(q);
                const matchReq = ticket.requesterName.toLowerCase().includes(q);
                if (!matchTitle && !matchId && !matchReq) {
                    return false;
                }
            }

            return true;
        });
    }, [tickets, activeTab, statusFilter, searchQuery]);

    const handleOpenDetail = (ticket: IncomingTicket) => {
        setSelectedTicket(ticket);
        setSheetOpen(true);
    };


    const handleSyncHaloApu = () => {
        setIsSyncing(true);
        router.post('/settings/haloapu/sync', {}, {
            preserveScroll: true,
            onFinish: () => setIsSyncing(false),
        });
    };


    const handleSaveToAsset = (ticketId: string, attachmentId: string, fileName: string) => {
        setSavingAssetId(attachmentId);
        router.post(
            `/incoming/${ticketId}/attachments/${attachmentId}/save-asset`,
            {},
            {
                preserveScroll: true,
                onSuccess: () => {
                    setSavedAssetIds((prev) => [...prev, attachmentId]);
                    toastSuccess(
                        'Aset Berhasil Disimpan',
                        `Berkas "${fileName}" berhasil ditambahkan ke katalog Visual Assets (/assets).`
                    );
                },
                onError: () => {
                    error('Gagal Menyimpan Aset', 'Terjadi kesalahan saat menyimpan berkas ke katalog aset visual.');
                },
                onFinish: () => {
                    setSavingAssetId(null);
                },
            }
        );
    };


    const handleToggleIgnore = (ticketId: string, ignore: boolean) => {
        router.post(
            `/incoming/${ticketId}/ignore`,
            { action: ignore ? 'ignore' : 'unignore' },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setTickets((prev) =>
                        prev.map((t) => (t.id === ticketId ? { ...t, syncStatus: ignore ? 'ignored' : 'pending' } : t))
                    );
                    if (selectedTicket && selectedTicket.id === ticketId) {
                        setSelectedTicket((prev) => (prev ? { ...prev, syncStatus: ignore ? 'ignored' : 'pending' } : null));
                    }
                },
            }
        );
    };
    const handleConfirmReject = () => {
        if (!selectedTicket) return;
        setIsRejecting(true);
        router.post(
            `/incoming/${selectedTicket.id}/ignore`,
            { action: 'reject', catatan: rejectCatatan.trim() || 'Pengajuan ditolak oleh Tim Humas.' },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setRejectModalOpen(false);
                    setRejectCatatan('');
                    setTickets((prev) =>
                        prev.map((t) => (t.id === selectedTicket.id ? { ...t, syncStatus: 'ignored', haloapuStatus: 'reject' } : t))
                    );
                    setSelectedTicket((prev) => (prev ? { ...prev, syncStatus: 'ignored', haloapuStatus: 'reject' } : null));
                },
                onFinish: () => setIsRejecting(false),
            }
        );
    };

    const handleConfirmPauseSla = () => {
        if (!selectedTicket) return;
        setIsPausing(true);
        router.patch(
            `/incoming/${selectedTicket.id}/remote-status`,
            { status: 'pending', catatan: pauseCatatan.trim() || 'Meminta kelengkapan informasi dari pemohon.' },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setPauseModalOpen(false);
                    setPauseCatatan('');
                    setTickets((prev) =>
                        prev.map((t) => (t.id === selectedTicket.id ? { ...t, haloapuStatus: 'pending' } : t))
                    );
                    setSelectedTicket((prev) => (prev ? { ...prev, haloapuStatus: 'pending' } : null));
                },
                onFinish: () => setIsPausing(false),
            }
        );
    };

    const handleResumeSla = () => {
        if (!selectedTicket) return;
        setIsResuming(true);
        router.patch(
            `/incoming/${selectedTicket.id}/remote-status`,
            { status: 'on_proses', catatan: 'Tiket dilanjutkan oleh tim Humas.' },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setTickets((prev) =>
                        prev.map((t) => (t.id === selectedTicket.id ? { ...t, haloapuStatus: 'on_proses' } : t))
                    );
                    setSelectedTicket((prev) => (prev ? { ...prev, haloapuStatus: 'on_proses' } : null));
                },
                onFinish: () => setIsResuming(false),
            }
        );
    };

    const handleConfirmReply = () => {
        if (!selectedTicket || !replyCatatan.trim()) return;
        setIsReplying(true);
        router.post(
            `/incoming/${selectedTicket.id}/reply`,
            { catatan: replyCatatan.trim() },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setReplyModalOpen(false);
                    setReplyCatatan('');
                },
                onFinish: () => setIsReplying(false),
            }
        );
    };

    const handleConfirmDeliver = () => {
        if (!selectedTicket || !deliverUrl.trim()) return;
        setIsDelivering(true);
        router.post(
            `/incoming/${selectedTicket.id}/deliver-result`,
            { deliverable_url: deliverUrl.trim(), catatan: deliverCatatan.trim() || undefined },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setDeliverModalOpen(false);
                    setDeliverUrl('');
                    setDeliverCatatan('');
                    setTickets((prev) =>
                        prev.map((t) => (t.id === selectedTicket.id ? { ...t, haloapuStatus: 'solve' } : t))
                    );
                    setSelectedTicket((prev) => (prev ? { ...prev, haloapuStatus: 'solve' } : null));
                },
                onFinish: () => setIsDelivering(false),
            }
        );
    };

    const getSourceBadge = (type: IncomingTicket['sourceType']) => {
        if (type === 'video_reels') {
            return (
                <Badge variant="primary" className="gap-1">
                    <Video className="w-3 h-3" />
                    Reels Video
                </Badge>
            );
        }
        return (
            <Badge variant="success" className="gap-1">
                <ImageIcon className="w-3 h-3" />
                Feed IG / Meme
            </Badge>
        );
    };

    const getHaloApuStatusBadge = (status: IncomingTicket['haloapuStatus']) => {
        switch (status) {
            case 'open':
                return <Badge variant="warning">Open (Menunggu)</Badge>;
            case 'on_proses':
                return <Badge variant="primary">On Process</Badge>;
            case 'need_revision':
                return <Badge variant="danger">Butuh Revisi</Badge>;
            case 'solve':
                return <Badge variant="success">Solved</Badge>;
            case 'dibatalkan':
            case 'reject':
                return (
                    <Badge variant="default" className="line-through opacity-75">
                        Dibatalkan
                    </Badge>
                );
            default:
                return <Badge variant="default">{status}</Badge>;
        }
    };

    const getSyncBadge = (status: IncomingTicket['syncStatus']) => {
        switch (status) {
            case 'pending':
                return (
                    <Badge variant="warning" className="font-semibold">
                        Antrean Baru
                    </Badge>
                );
            case 'converted':
                return <Badge variant="primary">Dikonversi</Badge>;
            case 'ignored':
                return <Badge variant="default">Diabaikan</Badge>;
        }
    };

    const tabsData = [
        { id: 'all', label: 'Semua Tiket', count: tickets.length },
        { id: 'reels', label: 'Video Reels', count: tickets.filter((t) => t.sourceType === 'video_reels').length },
        { id: 'feed', label: 'Desain Feed IG', count: tickets.filter((t) => t.sourceType === 'desain_feed').length },
    ];

    return (
        <AppLayout
            title="Incoming Requests (API)"
            subtitle="Sinkronisasi pengajuan produksi konten dari portal layanan HaloAPU"
            actions={
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        isLoading={isSyncing}
                        icon={<RefreshCw className="w-3.5 h-3.5" />}
                        onClick={handleSyncHaloApu}
                    >
                        Sync HaloAPU
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => router.visit('/content')}>
                        Ke Content Planner <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                </div>
            }
        >
            <Head title="Incoming Requests - SPARC" />

            <div className="space-y-6">
                {/* Top Filter Bar */}
                <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-4 rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <Tabs tabs={tabsData} activeTab={activeTab} onChange={setActiveTab} />

                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="relative w-full sm:w-64">
                            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--md-sys-color-on-surface-variant)] pointer-events-none" />
                            <input
                                type="text"
                                aria-label="Cari ID tiket atau judul"
                                placeholder="Cari ID tiket / judul..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-9 pl-9 pr-3 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/30 focus:border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)]/70"
                            />
                        </div>

                        <select
                            aria-label="Filter status sinkronisasi tiket"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="h-9 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 text-[var(--md-sys-color-on-surface)] font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/30 cursor-pointer"
                        >
                            <option value="all">Status: Semua</option>
                            <option value="pending">Menunggu Tindakan</option>
                            <option value="converted">Sudah Dikonversi</option>
                            <option value="ignored">Diabaikan</option>
                        </select>
                    </div>
                </div>

                {/* Tickets Table */}
                <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">
                                    <th className="py-3.5 px-4">Tiket HaloAPU</th>
                                    <th className="py-3.5 px-4">Jenis</th>
                                    <th className="py-3.5 px-4">Judul & Brief</th>
                                    <th className="py-3.5 px-4">Pemohon</th>
                                    <th className="py-3.5 px-4">Target Tayang</th>
                                    <th className="py-3.5 px-4">Status HaloAPU</th>
                                    <th className="py-3.5 px-4">Status SPARC</th>
                                    <th className="py-3.5 px-4 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]/60">
                                {filteredTickets.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={8}
                                            className="py-12 text-center text-[var(--md-sys-color-on-surface-variant)]"
                                        >
                                            Tidak ada tiket yang cocok dengan kriteria filter.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTickets.map((ticket) => (
                                        <tr
                                            key={ticket.id}
                                            className="notion-row group cursor-pointer"
                                            onClick={() => handleOpenDetail(ticket)}
                                        >
                                            <td className="py-3.5 px-4 font-mono font-bold text-[var(--md-sys-color-on-surface)] whitespace-nowrap">
                                                #{ticket.haloapuTicketId}
                                                {ticket.updateLogs && ticket.updateLogs.length > 0 && (
                                                    <span
                                                        title="Brief diperbarui pemohon"
                                                        className="ml-1.5 inline-block w-2 h-2 rounded-full bg-[#F59E0B]"
                                                    />
                                                )}
                                            </td>

                                            <td className="py-3.5 px-4 whitespace-nowrap">
                                                {getSourceBadge(ticket.sourceType)}
                                            </td>

                                            <td className="py-3.5 px-4 max-w-xs">
                                                <p className="font-bold text-[var(--md-sys-color-on-surface)] line-clamp-1 group-hover:text-[var(--md-sys-color-primary)] transition-colors">
                                                    {ticket.title}
                                                </p>
                                                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] line-clamp-1 mt-0.5">
                                                    {ticket.brief}
                                                </p>
                                            </td>

                                            <td className="py-3.5 px-4 whitespace-nowrap text-[var(--md-sys-color-on-surface)]">
                                                <div className="flex items-center gap-1.5">
                                                    <User className="w-3.5 h-3.5 text-[var(--md-sys-color-on-surface-variant)]" />
                                                    <span className="truncate max-w-[140px] font-medium">
                                                        {ticket.requesterName}
                                                    </span>
                                                </div>
                                            </td>

                                            <td className="py-3.5 px-4 whitespace-nowrap text-[var(--md-sys-color-on-surface-variant)] font-medium">
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar className="w-3.5 h-3.5" />
                                                    <span>{ticket.targetDate || '-'}</span>
                                                </div>
                                            </td>

                                            <td className="py-3.5 px-4 whitespace-nowrap">
                                                <div className="flex flex-col gap-1 items-start">
                                                    {getHaloApuStatusBadge(ticket.haloapuStatus)}
                                                    {ticket.isResultAccepted && (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-600 dark:text-green-400">
                                                            <CheckCircle2 className="w-2.5 h-2.5" /> Disetujui Pemohon
                                                        </span>
                                                    )}
                                                    {Boolean(ticket.revisionCount && ticket.revisionCount > 0) && (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                                            Revisi ke-{ticket.revisionCount}
                                                        </span>
                                                    )}
                                                    {ticket.isSlaBreached && (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
                                                            <AlertTriangle className="w-2.5 h-2.5" /> SLA Lewat
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4 whitespace-nowrap">
                                                {getSyncBadge(ticket.syncStatus)}
                                            </td>

                                            <td
                                                className="py-3.5 px-4 whitespace-nowrap text-right"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <Link href="/content">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            icon={<Sparkles className="w-3 h-3 text-[var(--md-sys-color-primary)]" />}
                                                            title="Buka di Content Planner"
                                                        >
                                                            Lihat di Planner
                                                        </Button>
                                                    </Link>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        aria-label={`Lihat rincian tiket ${ticket.haloapuTicketId}`}
                                                        onClick={() => handleOpenDetail(ticket)}
                                                        title="Lihat Detail Form"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="p-4 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-between text-xs text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container-low)]/60 font-medium">
                        <span>Menampilkan {filteredTickets.length} tiket</span>
                        <span>Sinkronisasi otomatis tiap 15 menit dari HaloAPU</span>
                    </div>
                </div>
            </div>

            {/* Slide-over Detail Ticket Drawer */}
            <Sheet
                isOpen={sheetOpen}
                onClose={() => setSheetOpen(false)}
                title={selectedTicket ? `Tiket #${selectedTicket.haloapuTicketId}` : 'Rincian Tiket'}
                description={selectedTicket?.requesterName}
                width="xl"
            >
                {selectedTicket && (
                    <div className="space-y-6">
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[var(--md-sys-color-outline-variant)]">
                            <div className="flex flex-wrap items-center gap-2">
                                {getSourceBadge(selectedTicket.sourceType)}
                                {getHaloApuStatusBadge(selectedTicket.haloapuStatus)}
                                {getSyncBadge(selectedTicket.syncStatus)}
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

                            <a
                                href={`https://haloapu.domain.id/admin/tiket/${selectedTicket.haloapuTicketId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--md-sys-color-primary)] hover:underline"
                            >
                                Buka di HaloAPU <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                        </div>

                        {selectedTicket.updateLogs && selectedTicket.updateLogs.length > 0 && (
                            <div className="p-4 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-2xl space-y-2">
                                <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300">
                                    <AlertTriangle className="w-4 h-4" />
                                    Brief Telah Diperbarui oleh Pemohon
                                </div>
                                <div className="space-y-1 text-xs text-[var(--md-sys-color-on-surface)] pl-6">
                                    {selectedTicket.updateLogs.map((log) => (
                                        <div key={log.id}>
                                            <span className="font-semibold">{log.label}:</span>{' '}
                                            <span className="line-through text-[var(--md-sys-color-on-surface-variant)] mr-1.5">
                                                {log.oldValue}
                                            </span>
                                            <span className="text-[#00A870] dark:text-emerald-400 font-bold">
                                                {log.newValue}
                                            </span>
                                            <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] block">
                                                {log.updatedAt}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* HaloAPU Ticket Activity & Revision Logs */}
                        {selectedTicket.logs && selectedTicket.logs.length > 0 && (
                            <div className="p-4 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] flex items-center gap-1.5">
                                        <MessageSquare className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" />
                                        Riwayat Interaksi & Revisi HaloAPU ({selectedTicket.logs.length})
                                    </h4>
                                    {Boolean(selectedTicket.revisionCount && selectedTicket.revisionCount > 0) && (
                                        <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                            Total: {selectedTicket.revisionCount}x Revisi
                                        </span>
                                    )}
                                </div>
                                <div className="space-y-2.5 divide-y divide-[var(--md-sys-color-outline-variant)]/60">
                                    {selectedTicket.logs.map((log, idx) => {
                                        const isRevision = log.aksi === 'need_revision';
                                        const isSolve = log.aksi === 'solve';
                                        const isReply = log.aksi === 'balasan';
                                        const isAccepted = log.aksi === 'accepted';
                                        const isPending = log.aksi === 'pending';

                                        return (
                                            <div key={log.id || idx} className={idx > 0 ? 'pt-2.5' : ''}>
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                                                            {log.actor}
                                                        </span>
                                                        <Badge
                                                            variant={
                                                                isRevision
                                                                    ? 'danger'
                                                                    : isSolve || isAccepted
                                                                      ? 'success'
                                                                      : isPending
                                                                        ? 'warning'
                                                                        : isReply
                                                                          ? 'primary'
                                                                          : 'default'
                                                            }
                                                            className="text-[10px] py-0 px-1.5"
                                                        >
                                                            {log.aksi === 'need_revision'
                                                                ? 'Butuh Revisi'
                                                                : log.aksi === 'solve'
                                                                  ? 'Selesai'
                                                                  : log.aksi === 'balasan'
                                                                    ? 'Balasan'
                                                                    : log.aksi === 'accepted'
                                                                      ? 'Disetujui'
                                                                      : log.aksi}
                                                        </Badge>
                                                    </div>
                                                    <span className="text-[10px] text-[var(--md-sys-color-on-surface-muted)]">
                                                        {log.timestamp}
                                                    </span>
                                                </div>
                                                {log.catatan && (
                                                    <p
                                                        className={`text-xs mt-1 leading-relaxed ${
                                                            isRevision
                                                                 ? 'text-amber-800 dark:text-amber-300 font-medium p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20'
                                                                : 'text-[var(--md-sys-color-on-surface-variant)]'
                                                        }`}
                                                    >
                                                        {log.catatan}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <h4 className="text-sm font-black text-[var(--md-sys-color-on-surface)]">
                                {selectedTicket.title}
                            </h4>
                            <p className="text-xs text-[var(--md-sys-color-on-surface)] leading-relaxed bg-[var(--md-sys-color-surface-container-low)] p-4 rounded-2xl border border-[var(--md-sys-color-outline-variant)]">
                                {selectedTicket.brief}
                            </p>
                        </div>

                        {(selectedTicket.slaResponseDeadline || selectedTicket.slaResolutionDeadline) && (
                            <div className="p-3.5 rounded-2xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] space-y-1.5 text-xs">
                                <span className="sparc-eyebrow block">Pemantauan SLA HaloAPU</span>
                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    <div>
                                        <span className="text-[var(--md-sys-color-on-surface-muted)] block">Tenggat Respons:</span>
                                        <span className="font-semibold text-[var(--md-sys-color-on-surface)]">
                                            {selectedTicket.slaResponseDeadline ? new Date(selectedTicket.slaResponseDeadline).toLocaleString('id-ID') : '-'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-[var(--md-sys-color-on-surface-muted)] block">Tenggat Selesai:</span>
                                        <span className="font-semibold text-[var(--md-sys-color-on-surface)]">
                                            {selectedTicket.slaResolutionDeadline ? new Date(selectedTicket.slaResolutionDeadline).toLocaleString('id-ID') : '-'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-3">
                            <h5 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">
                                Data Formulir Pengajuan (HaloAPU Snapshot)
                            </h5>
                            <div className="bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl p-4 divide-y divide-[var(--md-sys-color-outline-variant)]/60 space-y-2.5">
                                {Object.entries(selectedTicket.formSnapshot).map(([key, val], idx) => (
                                    <div
                                        key={key}
                                        className={
                                            idx > 0
                                                ? 'pt-2.5 flex flex-col sm:flex-row sm:justify-between gap-1 text-xs'
                                                : 'flex flex-col sm:flex-row sm:justify-between gap-1 text-xs'
                                        }
                                    >
                                        <span className="font-medium text-[var(--md-sys-color-on-surface-variant)]">
                                            {key}
                                        </span>
                                        <span className="font-bold text-[var(--md-sys-color-on-surface)] sm:text-right max-w-xs break-words">
                                            {val || '-'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h5 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">
                                Berkas Lampiran ({selectedTicket.attachments.length})
                            </h5>
                            {selectedTicket.attachments.length === 0 ? (
                                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] italic">
                                    Tidak ada berkas lampiran pada tiket ini.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {selectedTicket.attachments.map((file, i) => {
                                        const fileProxyUrl = file.id ? `/incoming/${selectedTicket.id}/attachments/${file.id}/proxy` : file.url;
                                        const isImg = /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file.fileName);

                                        return (
                                            <div
                                                key={file.id || i}
                                                className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-3 space-y-2.5"
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        {isImg ? (
                                                            <ImageIcon className="w-4 h-4 text-[var(--md-sys-color-primary)] shrink-0" />
                                                        ) : (
                                                            <Paperclip className="w-4 h-4 text-[var(--md-sys-color-on-surface-variant)] shrink-0" />
                                                        )}
                                                        <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] truncate">
                                                            {file.fileName}
                                                        </span>
                                                        {file.fileSize && (
                                                            <span className="text-[10px] text-[var(--md-sys-color-on-surface-muted)] shrink-0">
                                                                ({file.fileSize})
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => setPreviewImage({ url: fileProxyUrl, title: file.fileName })}
                                                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-primary)] hover:text-white transition-colors"
                                                        >
                                                            Lihat
                                                        </button>
                                                        <a
                                                            href={fileProxyUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="p-1 rounded-lg text-[var(--md-sys-color-on-surface-muted)] hover:text-[var(--md-sys-color-primary)] transition-colors"
                                                            title="Buka / Unduh di Tab Baru"
                                                        >
                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                        </a>
                                                        {file.id && (
                                                            savedAssetIds.includes(String(file.id)) ? (
                                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Tersimpan
                                                                </span>
                                                            ) : (
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    isLoading={savingAssetId === String(file.id)}
                                                                    onClick={() => handleSaveToAsset(selectedTicket.id, String(file.id), file.fileName)}
                                                                >
                                                                    + Simpan Aset
                                                                </Button>
                                                            )
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Inline Image Preview Thumbnail */}
                                                {isImg && (
                                                    <div
                                                        className="rounded-xl overflow-hidden border border-[var(--md-sys-color-outline-variant)]/60 bg-black/5 dark:bg-black/20 max-h-52 flex items-center justify-center cursor-pointer group relative"
                                                        onClick={() => setPreviewImage({ url: fileProxyUrl, title: file.fileName })}
                                                    >
                                                        <img
                                                            src={fileProxyUrl}
                                                            alt={file.fileName}
                                                            className="max-h-52 w-full object-contain group-hover:scale-[1.02] transition-transform duration-200"
                                                            loading="lazy"
                                                        />
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5">
                                                            <Eye className="w-4 h-4" /> Klik untuk Memperbesar
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="pt-4 border-t border-[var(--md-sys-color-outline-variant)] flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                                {selectedTicket.syncStatus === 'ignored' ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        icon={<RotateCcw className="w-3.5 h-3.5" />}
                                        onClick={() => handleToggleIgnore(selectedTicket.id, false)}
                                    >
                                        Pulihkan
                                    </Button>
                                ) : (
                                    <>
                                        {/* Balas Pemohon */}
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            icon={<MessageSquare className="w-3.5 h-3.5" />}
                                            onClick={() => {
                                                setReplyCatatan('');
                                                setReplyModalOpen(true);
                                            }}
                                        >
                                            Balas
                                        </Button>

                                        {/* Pause or Resume SLA */}
                                        {selectedTicket.haloapuStatus === 'pending' ? (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                isLoading={isResuming}
                                                icon={<Play className="w-3.5 h-3.5 text-emerald-600" />}
                                                onClick={handleResumeSla}
                                            >
                                                Lanjutkan (Resume)
                                            </Button>
                                        ) : (
                                            (selectedTicket.haloapuStatus === 'open' ||
                                                selectedTicket.haloapuStatus === 'on_proses' ||
                                                selectedTicket.haloapuStatus === 'need_revision') && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    icon={<Pause className="w-3.5 h-3.5 text-amber-600" />}
                                                    onClick={() => {
                                                        setPauseCatatan('');
                                                        setPauseModalOpen(true);
                                                    }}
                                                >
                                                    Pause SLA
                                                </Button>
                                            )
                                        )}

                                        {/* Kirim Hasil / Solve */}
                                        {selectedTicket.haloapuStatus !== 'solve' && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                icon={<Send className="w-3.5 h-3.5 text-blue-600" />}
                                                onClick={() => {
                                                    setDeliverUrl('');
                                                    setDeliverCatatan('');
                                                    setDeliverModalOpen(true);
                                                }}
                                            >
                                                Kirim Hasil
                                            </Button>
                                        )}

                                        {/* Tolak Tiket */}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            icon={<XCircle className="w-3.5 h-3.5" />}
                                            className="text-red-600 hover:text-red-700 hover:bg-red-500/10 dark:text-red-400"
                                            onClick={() => {
                                                setRejectCatatan('');
                                                setRejectModalOpen(true);
                                            }}
                                        >
                                            Tolak
                                        </Button>

                                        {/* Abaikan */}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            icon={<Ban className="w-3.5 h-3.5" />}
                                            onClick={() => handleToggleIgnore(selectedTicket.id, true)}
                                        >
                                            Abaikan
                                        </Button>
                                    </>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <Link href="/content">
                                    <Button
                                        type="button"
                                        variant="primary"
                                        size="sm"
                                        icon={<Sparkles className="w-4 h-4" />}
                                    >
                                        Buka di Planner
                                    </Button>
                                </Link>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setSheetOpen(false)}
                                >
                                    Tutup
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </Sheet>

            {/* Modal Tolak Tiket */}
            <Modal
                isOpen={rejectModalOpen}
                onClose={() => setRejectModalOpen(false)}
                title={`Tolak Pengajuan Tiket #${selectedTicket?.haloapuTicketId}`}
                description={`Pengajuan dari ${selectedTicket?.requesterName} akan ditolak dan status penolakan beserta alasan akan dikirimkan ke pemohon di portal HaloAPU.`}
                maxWidth="md"
            >
                <div className="space-y-4">
                    <Textarea
                        label="Alasan Penolakan (Catatan Pemohon)"
                        required
                        rows={3}
                        placeholder="Jelaskan alasan penolakan, misal: Informasi konten tidak lengkap atau di luar lingkup layanan..."
                        value={rejectCatatan}
                        onChange={(e) => setRejectCatatan(e.target.value)}
                    />
                    <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={isRejecting}
                            onClick={() => setRejectModalOpen(false)}
                        >
                            Batal
                        </Button>
                        <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            icon={<XCircle className="w-3.5 h-3.5" />}
                            isLoading={isRejecting}
                            onClick={handleConfirmReject}
                        >
                            Tolak Pengajuan
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Modal Pause SLA / Minta Kelengkapan */}
            <Modal
                isOpen={pauseModalOpen}
                onClose={() => setPauseModalOpen(false)}
                title={`Minta Informasi Tambahan (Pause SLA) — #${selectedTicket?.haloapuTicketId}`}
                description="Timer SLA HaloAPU akan dijeda (status pending) sampai pemohon memberikan informasi atau bahan yang diminta."
                maxWidth="md"
            >
                <div className="space-y-4">
                    <Textarea
                        label="Pesan / Permintaan Kelengkapan"
                        required
                        rows={3}
                        placeholder="Tuliskan detail informasi atau bahan materi yang dibutuhkan dari pemohon..."
                        value={pauseCatatan}
                        onChange={(e) => setPauseCatatan(e.target.value)}
                    />
                    <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={isPausing}
                            onClick={() => setPauseModalOpen(false)}
                        >
                            Batal
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            icon={<Pause className="w-3.5 h-3.5" />}
                            isLoading={isPausing}
                            onClick={handleConfirmPauseSla}
                        >
                            Jeda SLA & Kirim Permintaan
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Modal Balas Pemohon */}
            <Modal
                isOpen={replyModalOpen}
                onClose={() => setReplyModalOpen(false)}
                title={`Kirim Pesan ke Pemohon — #${selectedTicket?.haloapuTicketId}`}
                description={`Pesan balasan akan dicatat pada riwayat tiket #${selectedTicket?.haloapuTicketId} dan diteruskan ke portal pemohon HaloAPU.`}
                maxWidth="md"
            >
                <div className="space-y-4">
                    <Textarea
                        label="Pesan Balasan"
                        required
                        rows={3}
                        placeholder="Tuliskan pesan balasan resmi dari Tim Humas..."
                        value={replyCatatan}
                        onChange={(e) => setReplyCatatan(e.target.value)}
                    />
                    <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={isReplying}
                            onClick={() => setReplyModalOpen(false)}
                        >
                            Batal
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            icon={<MessageSquare className="w-3.5 h-3.5" />}
                            isLoading={isReplying}
                            disabled={!replyCatatan.trim()}
                            onClick={handleConfirmReply}
                        >
                            Kirim Pesan
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Modal Kirim Hasil (Solve) */}
            <Modal
                isOpen={deliverModalOpen}
                onClose={() => setDeliverModalOpen(false)}
                title={`Kirim Hasil Produksi (Solve) — #${selectedTicket?.haloapuTicketId}`}
                description="Tandai tiket telah selesai dikerjakan dan kirim tautan hasil publikasi/desain ke pemohon untuk ditinjau."
                maxWidth="md"
            >
                <div className="space-y-4">
                    <Input
                        label="Tautan Hasil Publikasi / Desain (URL)"
                        required
                        type="url"
                        placeholder="https://instagram.com/p/... atau link Google Drive / Figma"
                        value={deliverUrl}
                        onChange={(e) => setDeliverUrl(e.target.value)}
                    />
                    <Textarea
                        label="Catatan Pengiriman (Opsional)"
                        rows={2}
                        placeholder="Pesan tambahan kepada pemohon terkait hasil produksi..."
                        value={deliverCatatan}
                        onChange={(e) => setDeliverCatatan(e.target.value)}
                    />
                    <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={isDelivering}
                            onClick={() => setDeliverModalOpen(false)}
                        >
                            Batal
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            icon={<Send className="w-3.5 h-3.5" />}
                            isLoading={isDelivering}
                            disabled={!deliverUrl.trim()}
                            onClick={handleConfirmDeliver}
                        >
                            Kirim Hasil & Selesaikan
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Image Preview Lightbox Modal */}
            <Modal
                isOpen={Boolean(previewImage)}
                onClose={() => setPreviewImage(null)}
                title={previewImage?.title || 'Pratinjau Lampiran'}
                maxWidth="2xl"
            >
                {previewImage && (
                    <div className="space-y-3">
                        <div className="rounded-2xl overflow-hidden border border-[var(--md-sys-color-outline-variant)] bg-black/5 dark:bg-black/20 flex items-center justify-center max-h-[75vh]">
                            <img
                                src={previewImage.url}
                                alt={previewImage.title}
                                className="max-h-[70vh] w-auto object-contain rounded-xl"
                            />
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                            <span className="text-[var(--md-sys-color-on-surface-muted)] truncate max-w-sm">
                                {previewImage.title}
                            </span>
                            <div className="flex items-center gap-2">
                                <a
                                    href={previewImage.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 font-bold text-[var(--md-sys-color-primary)] hover:underline"
                                >
                                    Buka Ukuran Asli <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                                <Button type="button" variant="secondary" size="sm" onClick={() => setPreviewImage(null)}>
                                    Tutup
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </AppLayout>
    );
}
