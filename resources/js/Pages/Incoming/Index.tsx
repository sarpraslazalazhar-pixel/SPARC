import React, { useEffect, useMemo, useState } from 'react';
import { Head, router, useForm } from '@inertiajs/react';
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
} from 'lucide-react';
import { AppLayout } from '@/Layouts/AppLayout';
import { Button } from '@/Components/UI/Button';
import { Badge } from '@/Components/UI/Badge';
import { Input } from '@/Components/UI/Input';
import { Select } from '@/Components/UI/Select';
import { Sheet } from '@/Components/UI/Sheet';
import { Modal } from '@/Components/UI/Modal';
import { Tabs } from '@/Components/UI/Tabs';
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
}

interface IncomingProps {
    tickets?: IncomingTicket[];
    ticketOverrides?: Record<string, IncomingTicket['syncStatus']>;
}

const DEFAULT_TICKETS: IncomingTicket[] = [
    {
        id: '1',
        haloapuTicketId: '045-812-901',
        sourceType: 'video_reels',
        title: 'Tutorial Pendaftaran Online Layanan Informasi Publik',
        brief: 'Mohon dibuatkan video reels panduan singkat cara pendaftaran online dan verifikasi akun untuk masyarakat umum.',
        requesterName: 'Budi Santoso (Dit. Layanan)',
        targetDate: '2026-11-02',
        haloapuStatus: 'open',
        syncStatus: 'pending',
        createdAt: '27 Okt 2026, 09:15 WIB',
        formSnapshot: {
            'Judul/Tema Video': 'Tutorial Pendaftaran Online Layanan Informasi Publik',
            'Jenis Video': 'Reels',
            'Durasi Estimasi': '60 Detik',
            'Deadline Tayang': '2026-11-02',
            'Brief Video': 'Fokus pada alur 3 langkah: 1. Buka web, 2. Isi NIK, 3. Konfirmasi email.',
            'Link Referensi': 'https://instagram.com/p/sample-reels',
            'Keterangan Tambahan': 'Gunakan voiceover santai dan human-touch.',
        },
        attachments: [
            { fileName: 'alur-pendaftaran.pdf', url: 'https://example.com/storage/alur-pendaftaran.pdf', fileSize: '1.2 MB' },
            { fileName: 'screenshot-portal.png', url: 'https://example.com/storage/screenshot-portal.png', fileSize: '850 KB' },
        ],
        updateLogs: [
            {
                id: 'log-1',
                label: 'Deadline Tayang',
                oldValue: '2026-10-30',
                newValue: '2026-11-02',
                updatedAt: '27 Okt 2026, 10:20 WIB',
            },
        ],
    },
    {
        id: '2',
        haloapuTicketId: '042-119-002',
        sourceType: 'desain_feed',
        title: 'Feed IG - Infografis Capaian Kinerja Triwulan III',
        brief: 'Desain infografis carousel 5 slide mengenai capaian dan realisasi program prioritas tahun 2026.',
        requesterName: 'Siti Rahma (Biro Perencanaan)',
        targetDate: '2026-10-31',
        haloapuStatus: 'on_proses',
        syncStatus: 'converted',
        convertedProjectId: 'proj-101',
        createdAt: '26 Okt 2026, 14:00 WIB',
        formSnapshot: {
            'Jenis Produksi Desain': 'Feed Instagram / Meme',
            'Tujuan Penggunaan': 'Publikasi media sosial Instagram & LinkedIn.',
            'Brief Materi': '5 Slide Carousel: Slide 1 Cover Hook, Slide 2 Anggaran, Slide 3 Program Unggulan, Slide 4 Testimoni, Slide 5 CTA Website.',
            'Deadline': '2026-10-31',
            'Jumlah Produksi': '1 Paket (5 Slide)',
        },
        attachments: [
            { fileName: 'data-rekap-triwulan.xlsx', url: 'https://example.com/storage/data-rekap.xlsx', fileSize: '2.4 MB' },
        ],
    },
    {
        id: '3',
        haloapuTicketId: '041-908-112',
        sourceType: 'desain_feed',
        title: 'Feed IG - Peringatan Hari Sumpah Pemuda 2026',
        brief: 'Desain single feed ucapan peringatan resmi Hari Sumpah Pemuda dengan nuansa dinamis dan berani.',
        requesterName: 'Ahmad Faiz (Bagian Protokol)',
        targetDate: '2026-10-28',
        haloapuStatus: 'open',
        syncStatus: 'pending',
        createdAt: '26 Okt 2026, 11:30 WIB',
        formSnapshot: {
            'Jenis Produksi Desain': 'Feed Instagram / Meme',
            'Tujuan Penggunaan': 'Ucapan resmi lembaga di feed Instagram.',
            'Brief Materi': 'Sertakan foto pimpinan dan kutipan tema nasional Sumpah Pemuda 2026.',
            'Deadline': '2026-10-28',
        },
        attachments: [
            { fileName: 'foto-pimpinan-resmi.png', url: 'https://example.com/storage/foto-pimpinan.png', fileSize: '4.8 MB' },
        ],
    },
    {
        id: '4',
        haloapuTicketId: '039-551-789',
        sourceType: 'video_reels',
        title: 'Reels Liputan Serah Terima Jabatan Pejabat Baru',
        brief: 'Dokumentasi video singkat suasana serah terima jabatan pejabat fungsional di aula utama.',
        requesterName: 'Hendra Setiawan (Bagian Kepegawaian)',
        targetDate: '2026-10-25',
        haloapuStatus: 'solve',
        syncStatus: 'converted',
        convertedProjectId: 'proj-099',
        createdAt: '24 Okt 2026, 16:45 WIB',
        formSnapshot: {
            'Judul/Tema Video': 'Liputan Serah Terima Jabatan Pejabat Baru',
            'Jenis Video': 'Reels',
            'Durasi Estimasi': '45 Detik',
            'Deadline Tayang': '2026-10-25',
        },
        attachments: [],
    },
    {
        id: '5',
        haloapuTicketId: '038-102-445',
        sourceType: 'desain_feed',
        title: 'Feed IG - Poster Sayembara Desain Maskot',
        brief: 'Poster publikasi sayembara logo dan maskot terbuka untuk umum.',
        requesterName: 'Rina Kusuma (Bagian Tata Usaha)',
        targetDate: '2026-10-20',
        haloapuStatus: 'dibatalkan',
        syncStatus: 'ignored',
        createdAt: '20 Okt 2026, 10:00 WIB',
        formSnapshot: {
            'Jenis Produksi Desain': 'Feed Instagram / Meme',
            'Brief Materi': 'Pengumuman dibatalkan karena perubahan petunjuk teknis sayembara.',
        },
        attachments: [],
    },
];

export default function IncomingIndex({
    tickets: initialTickets,
    ticketOverrides = {},
}: IncomingProps) {
    const { warning, info, error } = useToast();

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
    const [convertModalOpen, setConvertModalOpen] = useState(false);

    // Filter states
    const [activeTab, setActiveTab] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Inertia useForm for Convert Modal
    const convertForm = useForm({
        title: '',
        ticket_code: '',
        format: 'reels_shorts' as 'reels_shorts' | 'carousel_feed' | 'single_feed',
        pillar: 'edukasi' as 'edukasi' | 'event_liputan' | 'sosialisasi_prestasi' | 'pengumuman' | 'human_touch',
        pic_name: 'Aldwin (Writer)',
        target_date: '',
    });

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

    const handleOpenConvert = (ticket: IncomingTicket) => {
        setSelectedTicket(ticket);
        convertForm.clearErrors();
        convertForm.setData({
            title: ticket.title,
            ticket_code: ticket.haloapuTicketId,
            format: ticket.sourceType === 'video_reels' ? 'reels_shorts' : 'carousel_feed',
            pillar: 'edukasi',
            pic_name: 'Aldwin (Writer)',
            target_date: ticket.targetDate || '2026-11-15',
        });
        setConvertModalOpen(true);
    };

    const handleSaveConvert = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTicket) {
            return;
        }

        convertForm.post(`/incoming/${selectedTicket.id}/convert`, {
            onSuccess: () => {
                setConvertModalOpen(false);
                setSheetOpen(false);
            },
            onError: () => {
                error('Validasi Konversi Gagal', 'Pastikan judul proyek dan target tanggal tayang sudah benar.');
            },
        });
    };

    const handleToggleIgnore = (ticketId: string, ignore: boolean) => {
        setTickets((prev) =>
            prev.map((t) => (t.id === ticketId ? { ...t, syncStatus: ignore ? 'ignored' : 'pending' } : t))
        );
        if (selectedTicket && selectedTicket.id === ticketId) {
            setSelectedTicket((prev) => (prev ? { ...prev, syncStatus: ignore ? 'ignored' : 'pending' } : null));
        }
        if (ignore) {
            warning('Tiket Diabaikan', 'Tiket telah dipindahkan ke daftar tiket yang diabaikan.');
        } else {
            info('Tiket Dipulihkan', 'Tiket dikembalikan ke antrean aktif untuk ditindaklanjuti.');
        }
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
                <Button variant="outline" size="sm" onClick={() => router.visit('/content')}>
                    Ke Content Planner <ArrowRight className="w-3.5 h-3.5" />
                </Button>
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
                                                {getHaloApuStatusBadge(ticket.haloapuStatus)}
                                            </td>

                                            <td className="py-3.5 px-4 whitespace-nowrap">
                                                {getSyncBadge(ticket.syncStatus)}
                                            </td>

                                            <td
                                                className="py-3.5 px-4 whitespace-nowrap text-right"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {ticket.syncStatus === 'pending' && (
                                                        <Button
                                                            size="sm"
                                                            variant="primary"
                                                            icon={<Sparkles className="w-3 h-3" />}
                                                            onClick={() => handleOpenConvert(ticket)}
                                                        >
                                                            Convert
                                                        </Button>
                                                    )}
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

                        <div className="space-y-1.5">
                            <h4 className="text-sm font-black text-[var(--md-sys-color-on-surface)]">
                                {selectedTicket.title}
                            </h4>
                            <p className="text-xs text-[var(--md-sys-color-on-surface)] leading-relaxed bg-[var(--md-sys-color-surface-container-low)] p-4 rounded-2xl border border-[var(--md-sys-color-outline-variant)]">
                                {selectedTicket.brief}
                            </p>
                        </div>

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
                                <div className="space-y-2">
                                    {selectedTicket.attachments.map((file, i) => (
                                        <a
                                            key={i}
                                            href={file.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center justify-between p-3 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] hover:border-[var(--md-sys-color-primary)]/60 transition-colors group"
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <Paperclip className="w-4 h-4 text-[var(--md-sys-color-on-surface-variant)] group-hover:text-[var(--md-sys-color-primary)]" />
                                                <span className="text-xs font-medium text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)]">
                                                    {file.fileName}
                                                </span>
                                            </div>
                                            <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                                                {file.fileSize || 'Unduh'}
                                            </span>
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="pt-4 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-between gap-3">
                            {selectedTicket.syncStatus === 'ignored' ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    icon={<RotateCcw className="w-3.5 h-3.5" />}
                                    onClick={() => handleToggleIgnore(selectedTicket.id, false)}
                                >
                                    Batalkan Abaikan
                                </Button>
                            ) : (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    icon={<Ban className="w-3.5 h-3.5" />}
                                    onClick={() => handleToggleIgnore(selectedTicket.id, true)}
                                >
                                    Abaikan Tiket
                                </Button>
                            )}

                            {selectedTicket.syncStatus === 'pending' && (
                                <Button
                                    variant="primary"
                                    size="md"
                                    icon={<Sparkles className="w-4 h-4" />}
                                    onClick={() => {
                                        setSheetOpen(false);
                                        handleOpenConvert(selectedTicket);
                                    }}
                                >
                                    Konversi ke Proyek
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </Sheet>

            {/* Convert to Project Modal connected to Laravel Validation */}
            <Modal
                isOpen={convertModalOpen}
                onClose={() => setConvertModalOpen(false)}
                title="Konversi Tiket ke Proyek Konten"
                description={`Menghubungkan tiket #${selectedTicket?.haloapuTicketId} ke alur produksi SPARC`}
                maxWidth="lg"
            >
                <form onSubmit={handleSaveConvert} className="space-y-4" noValidate>
                    <Input
                        label="Judul Proyek Konten"
                        required
                        value={convertForm.data.title}
                        onChange={(e) => convertForm.setData('title', e.target.value)}
                        error={convertForm.errors.title}
                        placeholder="Masukkan judul proyek..."
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Select
                            label="Format Konten"
                            required
                            value={convertForm.data.format}
                            onChange={(e) =>
                                convertForm.setData(
                                    'format',
                                    e.target.value as typeof convertForm.data.format
                                )
                            }
                            error={convertForm.errors.format}
                        >
                            <option value="reels_shorts">Video Reels / Shorts (Hook-Body-CTA)</option>
                            <option value="carousel_feed">Carousel Feed (Multi-Slide)</option>
                            <option value="single_feed">Single Image Feed</option>
                        </Select>

                        <Select
                            label="Pilar Konten Humas"
                            required
                            value={convertForm.data.pillar}
                            onChange={(e) =>
                                convertForm.setData(
                                    'pillar',
                                    e.target.value as typeof convertForm.data.pillar
                                )
                            }
                            error={convertForm.errors.pillar}
                        >
                            <option value="edukasi">Pilar 1: Edukasi Publik</option>
                            <option value="event_liputan">Pilar 2: Liputan Event</option>
                            <option value="sosialisasi_prestasi">Pilar 3: Sosialisasi & Prestasi</option>
                            <option value="pengumuman">Pilar 4: Pengumuman Resmi</option>
                            <option value="human_touch">Pilar 5: Human Touch</option>
                        </Select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Select
                            label="Penanggung Jawab (PIC)"
                            required
                            value={convertForm.data.pic_name}
                            onChange={(e) => convertForm.setData('pic_name', e.target.value)}
                            error={convertForm.errors.pic_name}
                        >
                            <option value="Aldwin (Writer)">Aldwin (Writer)</option>
                            <option value="Designer 1">Designer 1</option>
                            <option value="Designer 2">Designer 2</option>
                            <option value="Editor Video">Editor Video</option>
                        </Select>

                        <Input
                            label="Target Tanggal Tayang"
                            type="date"
                            required
                            value={convertForm.data.target_date}
                            onChange={(e) => convertForm.setData('target_date', e.target.value)}
                            error={convertForm.errors.target_date}
                        />
                    </div>

                    <div className="pt-4 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2.5">
                        <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            onClick={() => setConvertModalOpen(false)}
                            disabled={convertForm.processing}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            isLoading={convertForm.processing}
                        >
                            Buat Proyek & Buka Planner
                        </Button>
                    </div>
                </form>
            </Modal>
        </AppLayout>
    );
}
