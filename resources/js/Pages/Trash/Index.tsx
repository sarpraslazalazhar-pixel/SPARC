import React, { useEffect, useMemo, useState } from 'react';
import { Head } from '@inertiajs/react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Trash2,
    RotateCcw,
    AlertTriangle,
    FileText,
    Inbox,
    Grid3x3,
    Calendar,
    User,
} from 'lucide-react';
import { AppLayout } from '@/Layouts/AppLayout';
import { Button } from '@/Components/UI/Button';
import { Badge } from '@/Components/UI/Badge';
import { Modal } from '@/Components/UI/Modal';
import { useToast } from '@/Components/UI/Toast';
import { MD3_EASING } from '@/lib/motion';

export interface TrashItem {
    id: string;
    sourceId?: string;
    type: 'incoming_ticket' | 'creative_project' | 'grid_slot';
    title: string;
    deletedAt: string;
    deletedBy: string;
    details?: string;
}

interface TrashPageProps {
    sessionTrash?: TrashItem[];
}

const DEFAULT_TRASH_ITEMS: TrashItem[] = [
    {
        id: 'trash-1',
        type: 'creative_project',
        title: 'Draft Naskah: Sosialisasi Jadwal Libur Idul Fitri (Format Lama)',
        deletedAt: '25 Okt 2026, 14:20 WIB',
        deletedBy: 'Aldwin (Writer)',
        details: 'Reels Shorts • Digantikan dengan naskah revisi baru',
    },
    {
        id: 'trash-2',
        type: 'incoming_ticket',
        title: 'Tiket #035-771-002: Desain Spanduk Fisik Rapat Kerja',
        deletedAt: '24 Okt 2026, 09:10 WIB',
        deletedBy: 'Admin Humas',
        details: 'Desain Cetak • Bukan scope media sosial SPARC',
    },
    {
        id: 'trash-3',
        type: 'grid_slot',
        title: 'Slot Feed #12: Eksperimen Pola Catur Warna Abu',
        deletedAt: '22 Okt 2026, 17:30 WIB',
        deletedBy: 'Designer 1',
        details: 'Slot Mockup Instagram Feed',
    },
];

export default function TrashIndex({ sessionTrash = [] }: TrashPageProps) {
    const { success, warning } = useToast();

    const mergedItems = useMemo(
        () => [...sessionTrash, ...DEFAULT_TRASH_ITEMS],
        [sessionTrash]
    );

    const [items, setItems] = useState<TrashItem[]>(mergedItems);

    useEffect(() => {
        setItems(mergedItems);
    }, [mergedItems]);

    const [purgeItem, setPurgeItem] = useState<TrashItem | null>(null);
    const [purgeModalOpen, setPurgeModalOpen] = useState(false);
    const [purgeAllModalOpen, setPurgeAllModalOpen] = useState(false);

    const handleRestore = (item: TrashItem) => {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        success(
            ' Konten Berhasil Dipulihkan',
            `"${item.title}" telah dikembalikan ke ruang kerja aktif.`
        );
    };

    const handleConfirmPurge = () => {
        if (!purgeItem) {
            return;
        }
        const deletedTitle = purgeItem.title;
        setItems((prev) => prev.filter((i) => i.id !== purgeItem.id));
        setPurgeModalOpen(false);
        setPurgeItem(null);
        warning(
            'Dihapus Permanen',
            `"${deletedTitle}" telah dihapus permanen dari penyimpanan SPARC.`
        );
    };

    const handleConfirmPurgeAll = () => {
        const count = items.length;
        setItems([]);
        setPurgeAllModalOpen(false);
        warning(
            'Keranjang Sampah Dikosongkan',
            `Seluruh ${count} berkas dalam tempat sampah telah dihapus permanen.`
        );
    };

    const getItemIcon = (type: TrashItem['type']) => {
        switch (type) {
            case 'creative_project':
                return <FileText className="w-4 h-4 text-[var(--md-sys-color-primary)]" />;
            case 'incoming_ticket':
                return <Inbox className="w-4 h-4 text-[#F59E0B]" />;
            case 'grid_slot':
                return <Grid3x3 className="w-4 h-4 text-[#00A870] dark:text-emerald-400" />;
        }
    };

    const getTypeBadge = (type: TrashItem['type']) => {
        switch (type) {
            case 'creative_project':
                return <Badge variant="primary">Proyek Konten</Badge>;
            case 'incoming_ticket':
                return <Badge variant="warning">Tiket HaloAPU</Badge>;
            case 'grid_slot':
                return <Badge variant="success">Slot Grid</Badge>;
        }
    };

    return (
        <AppLayout
            title="Trash & Recovery"
            subtitle="Pulihkan konten yang tidak sengaja terhapus atau bersihkan penyimpanan permanen"
            actions={
                items.length > 0 && (
                    <Button
                        variant="danger"
                        size="sm"
                        icon={<Trash2 className="w-3.5 h-3.5" />}
                        onClick={() => setPurgeAllModalOpen(true)}
                    >
                        Kosongkan Trash
                    </Button>
                )
            }
        >
            <Head title="Trash & Recovery - SPARC" />

            <div className="space-y-6">
                <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] overflow-hidden">
                    <div className="p-4 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]/60 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--md-sys-color-on-surface-variant)] font-medium">
                        <span>
                            Total <strong className="text-[var(--md-sys-color-on-surface)]">{items.length}</strong> berkas di tempat sampah
                        </span>
                        <span>Berkas akan otomatis dihapus permanen setelah 30 hari</span>
                    </div>

                    {items.length === 0 ? (
                        <div className="py-16 text-center px-4">
                            <Trash2 className="w-10 h-10 text-[var(--md-sys-color-on-surface-variant)]/40 mx-auto mb-2.5" />
                            <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                Keranjang sampah bersih
                            </p>
                            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
                                Tidak ada draf konten, tiket, atau slot grid yang sedang berada di Trash.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-[var(--md-sys-color-outline-variant)]/60">
                            <AnimatePresence initial={false}>
                                {items.map((item) => (
                                    <motion.div
                                        key={item.id}
                                        layout
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, x: -16 }}
                                        transition={{ duration: 0.16, ease: MD3_EASING.decelerate }}
                                        className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 notion-row"
                                    >
                                        <div className="flex items-start gap-3.5 min-w-0">
                                            <div className="p-2.5 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] mt-0.5 shrink-0">
                                                {getItemIcon(item.type)}
                                            </div>

                                            <div className="space-y-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {getTypeBadge(item.type)}
                                                    <h4 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] break-words">
                                                        {item.title}
                                                    </h4>
                                                </div>
                                                {item.details && (
                                                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                                        {item.details}
                                                    </p>
                                                )}
                                                <div className="flex flex-wrap items-center gap-4 text-[11px] text-[var(--md-sys-color-on-surface-variant)] pt-1">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="w-3 h-3" /> Dihapus: {item.deletedAt}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <User className="w-3 h-3" /> Oleh: {item.deletedBy}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                icon={<RotateCcw className="w-3.5 h-3.5" />}
                                                onClick={() => handleRestore(item)}
                                            >
                                                Pulihkan
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                icon={<Trash2 className="w-3.5 h-3.5" />}
                                                onClick={() => {
                                                    setPurgeItem(item);
                                                    setPurgeModalOpen(true);
                                                }}
                                                className="hover:text-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-error-container)]/40"
                                            >
                                                Hapus Permanen
                                            </Button>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>

            {/* Single Item Purge Confirmation Modal */}
            <Modal
                isOpen={purgeModalOpen}
                onClose={() => setPurgeModalOpen(false)}
                title="Hapus Permanen Berkas?"
                description="Tindakan ini bersifat permanen dan tidak dapat dipulihkan kembali."
                maxWidth="sm"
            >
                <div className="space-y-4">
                    <div className="p-3.5 bg-[var(--md-sys-color-error-container)]/60 border border-[var(--md-sys-color-error)]/30 rounded-2xl flex items-start gap-2.5 text-xs text-[var(--md-sys-color-on-error-container)]">
                        <AlertTriangle className="w-4 h-4 text-[var(--md-sys-color-error)] shrink-0 mt-0.5" />
                        <p>
                            Apakah Anda yakin ingin menghapus permanen{' '}
                            <span className="font-bold">&ldquo;{purgeItem?.title}&rdquo;</span>?
                        </p>
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-2.5">
                        <Button variant="secondary" size="md" onClick={() => setPurgeModalOpen(false)}>
                            Batal
                        </Button>
                        <Button variant="danger" size="md" onClick={handleConfirmPurge}>
                            Ya, Hapus Permanen
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Purge All Confirmation Modal (replaces native window.confirm) */}
            <Modal
                isOpen={purgeAllModalOpen}
                onClose={() => setPurgeAllModalOpen(false)}
                title="Kosongkan Seluruh Trash?"
                description={`Menghapus permanen seluruh ${items.length} berkas di keranjang sampah.`}
                maxWidth="sm"
            >
                <div className="space-y-4">
                    <div className="p-3.5 bg-[var(--md-sys-color-error-container)]/60 border border-[var(--md-sys-color-error)]/30 rounded-2xl flex items-start gap-2.5 text-xs text-[var(--md-sys-color-on-error-container)]">
                        <AlertTriangle className="w-4 h-4 text-[var(--md-sys-color-error)] shrink-0 mt-0.5" />
                        <p>
                            Seluruh berkas yang dikosongkan tidak dapat dikembalikan lagi ke papan kerja SPARC.
                        </p>
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-2.5">
                        <Button variant="secondary" size="md" onClick={() => setPurgeAllModalOpen(false)}>
                            Batal
                        </Button>
                        <Button variant="danger" size="md" onClick={handleConfirmPurgeAll}>
                            Kosongkan Sekarang
                        </Button>
                    </div>
                </div>
            </Modal>
        </AppLayout>
    );
}
