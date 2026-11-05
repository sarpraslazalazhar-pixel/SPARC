import React, { useMemo, useState } from 'react';
import { Head, Link } from '@inertiajs/react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ArrowLeft,
    Save,
    Copy,
    Check,
    Plus,
    Trash2,
    Sparkles,
    Grid3x3,
    Search,
} from 'lucide-react';
import { AppLayout } from '@/Layouts/AppLayout';
import { Button } from '@/Components/UI/Button';
import { Badge } from '@/Components/UI/Badge';
import { Input } from '@/Components/UI/Input';
import { Textarea } from '@/Components/UI/Textarea';
import { Modal } from '@/Components/UI/Modal';
import { useToast } from '@/Components/UI/Toast';
import { MD3_EASING, MD3_SPRING } from '@/lib/motion';
import { copyToClipboard } from '@/lib/utils';

export interface ScriptSlide {
    id: string;
    orderIndex: number;
    title: string;
    textContent: string;
    visualNotes: string;
}

export interface ReelsScript {
    hookText: string;
    hookVisualNotes: string;
    bodyText: string;
    bodyVisualNotes: string;
    ctaText: string;
    ctaVisualNotes: string;
}

export interface StudioProjectDetail {
    id: string;
    title: string;
    format: 'reels_shorts' | 'carousel_feed' | 'single_feed';
    pillar: 'edukasi' | 'event_liputan' | 'sosialisasi_prestasi' | 'pengumuman' | 'human_touch';
    status: 'drafting' | 'in_scripting' | 'in_design' | 'ready_to_publish' | 'published';
    picName: string;
    targetDate?: string;
    haloapuTicketId?: string;
    haloapuBrief?: string;
    caption: string;
    hashtags: string;
    referenceUrl?: string;
    canvaUrl?: string;
    publishedUrl?: string;
    slides: ScriptSlide[];
    reelsScript: ReelsScript;
}

interface StudioShowProps {
    projectId?: string;
    project?: StudioProjectDetail;
    sessionProject?: Partial<StudioProjectDetail> | null;
}

const SAMPLE_HOOKS = [
    { id: 'h1', category: 'Pertanyaan Ajakan', text: 'Pernahkah kamu bertanya-tanya kenapa layanan ini sering antre?' },
    { id: 'h2', category: 'Pertanyaan Ajakan', text: 'Apakah kamu tahu kalau sekarang urus dokumen ini cuma butuh 5 menit?' },
    { id: 'h3', category: 'Personalisasi', text: 'Kamu pasti pernah mengalami ribetnya cari berkas verifikasi...' },
    { id: 'h4', category: 'Personalisasi', text: 'Kalau kamu masih urus berkas dengan cara lama, kamu wajib tonton video ini!' },
    { id: 'h5', category: 'Edukasi & Rahasia', text: '3 Fitur rahasia di portal layanan yang belum banyak orang tahu!' },
    { id: 'h6', category: 'Edukasi & Rahasia', text: 'Jangan lakukan 3 kesalahan ini saat mengunggah dokumen pendaftaran!' },
    { id: 'h7', category: 'Pain & Gain', text: 'Capek bolak-balik kantor dinas? Coba cara pendaftaran online ini!' },
    { id: 'h8', category: 'Storytelling', text: 'Gini jadinya kalau tim Humas lembur demi memastikan siaran pers tayang tepat waktu...' },
];

const DEFAULT_PROJECT: StudioProjectDetail = {
    id: 'proj-1',
    title: 'Tutorial Pendaftaran Online Layanan Informasi Publik',
    format: 'reels_shorts',
    pillar: 'edukasi',
    status: 'in_scripting',
    picName: 'Aldwin (Writer)',
    targetDate: '2026-11-02',
    haloapuTicketId: '045-812-901',
    haloapuBrief: 'Panduan 3 langkah online: 1. Buka portal, 2. Isi NIK, 3. Konfirmasi email.',
    caption:
        'Urus permohonan informasi publik kini makin mudah dan transparan! Cukup ikuti 3 langkah mudah ini langsung dari HP kamu. Simpan postingan ini ya!',
    hashtags: '#LayananPublik #HumasPemerintah #InformasiPublik #KeterbukaanInformasi',
    referenceUrl: 'https://instagram.com/p/sample-reels',
    canvaUrl: 'https://canva.com/design/sample-template',
    publishedUrl: '',
    slides: [
        {
            id: 's1',
            orderIndex: 1,
            title: 'Slide 1: Hook / Cover',
            textContent: 'Urus Berkas Masih Ribet? Ini Cara Baru 2026!',
            visualNotes: 'Foto pimpinan / visual bold dengan warna kontras',
        },
        {
            id: 's2',
            orderIndex: 2,
            title: 'Slide 2: Masalah',
            textContent: 'Banyak yang belum tahu kalau portal baru sudah online...',
            visualNotes: 'Tampilkan screenshot tampilan portal lama vs baru',
        },
        {
            id: 's3',
            orderIndex: 3,
            title: 'Slide 3: Solusi 3 Langkah',
            textContent: 'Cukup siapkan NIK dan email aktif. Masuk ke laman utama.',
            visualNotes: 'Infografis ikon 3 langkah',
        },
        {
            id: 's4',
            orderIndex: 4,
            title: 'Slide 4: Call to Action',
            textContent: 'Bagikan ke teman kamu yang butuh informasi ini!',
            visualNotes: 'Ikon save dan share besar di tengah',
        },
    ],
    reelsScript: {
        hookText:
            'Apakah kamu tahu kalau sekarang urus permohonan informasi publik cuma butuh waktu 5 menit dari HP?',
        hookVisualNotes:
            'Talenta tatap kamera dengan ekspresi terkejut, pegang smartphone, teks hook muncul di 3 detik pertama dengan sound effect pop.',
        bodyText:
            'Langkah pertama, buka portal resmi di sparc.humas.go.id lalu klik menu pendaftaran. Masukkan NIK dan unggah kartu identitas kamu. Dalam 1x24 jam, notifikasi verifikasi akan masuk via WhatsApp resmi!',
        bodyVisualNotes:
            'Footage screen record aplikasi di layar HP, diselingi shot talenta menjelaskan dengan bahasa santai dan ramah.',
        ctaText:
            'Simpan video ini sekarang, dan tag teman kamu yang belum tahu ya! Ada pertanyaan? Tulis di kolom komentar!',
        ctaVisualNotes: 'Teks ajakan komentar di bawah, arrow pointing down, logo Humas di penutup.',
    },
};

export default function StudioShow({
    projectId,
    project: initialProject,
    sessionProject,
}: StudioShowProps) {
    const { success, info, warning } = useToast();

    const resolvedInitial = useMemo<StudioProjectDetail>(() => {
        if (initialProject) {
            return initialProject;
        }
        if (sessionProject) {
            return {
                ...DEFAULT_PROJECT,
                id: sessionProject.id ?? projectId ?? DEFAULT_PROJECT.id,
                title: sessionProject.title ?? DEFAULT_PROJECT.title,
                format: sessionProject.format ?? DEFAULT_PROJECT.format,
                pillar: sessionProject.pillar ?? DEFAULT_PROJECT.pillar,
                status: sessionProject.status ?? 'drafting',
                picName: sessionProject.picName ?? DEFAULT_PROJECT.picName,
                targetDate: sessionProject.targetDate ?? undefined,
                haloapuTicketId: undefined,
            };
        }
        if (projectId === 'proj-2') {
            return {
                ...DEFAULT_PROJECT,
                id: 'proj-2',
                title: 'Infografis Capaian Kinerja Triwulan III 2026',
                format: 'carousel_feed',
                pillar: 'sosialisasi_prestasi',
                status: 'in_design',
                picName: 'Designer 1',
                haloapuTicketId: '042-119-002',
            };
        }
        return DEFAULT_PROJECT;
    }, [initialProject, sessionProject, projectId]);

    const [project, setProject] = useState<StudioProjectDetail>(resolvedInitial);
    const [activeSlideIndex, setActiveSlideIndex] = useState(0);
    const [hookModalOpen, setHookModalOpen] = useState(false);
    const [hookSearch, setHookSearch] = useState('');
    const [copiedAll, setCopiedAll] = useState(false);
    const [copiedCaption, setCopiedCaption] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const filteredHooks = SAMPLE_HOOKS.filter(
        (h) =>
            h.text.toLowerCase().includes(hookSearch.toLowerCase()) ||
            h.category.toLowerCase().includes(hookSearch.toLowerCase())
    );

    const handleApplyHook = (hookText: string) => {
        if (project.format === 'reels_shorts') {
            setProject((prev) => ({
                ...prev,
                reelsScript: { ...prev.reelsScript, hookText },
            }));
        } else if (project.slides.length > 0) {
            setProject((prev) => {
                const newSlides = [...prev.slides];
                newSlides[activeSlideIndex] = {
                    ...newSlides[activeSlideIndex],
                    textContent: hookText,
                };
                return { ...prev, slides: newSlides };
            });
        }
        setHookModalOpen(false);
        success('Hook Diterapkan', 'Formula pembuka telah dimasukkan ke editor naskah.');
    };

    const handleAddSlide = () => {
        const nextOrder = project.slides.length + 1;
        const newSlide: ScriptSlide = {
            id: `s-${Date.now()}`,
            orderIndex: nextOrder,
            title: `Slide ${nextOrder}`,
            textContent: '',
            visualNotes: '',
        };
        setProject((prev) => ({ ...prev, slides: [...prev.slides, newSlide] }));
        setActiveSlideIndex(project.slides.length);
        info('Slide Ditambahkan', `Slide ${nextOrder} siap diisi konten.`);
    };

    const handleDeleteSlide = (idx: number) => {
        if (project.slides.length <= 1) {
            return;
        }
        const removedTitle = project.slides[idx]?.title || `Slide ${idx + 1}`;
        const newSlides = project.slides
            .filter((_, i) => i !== idx)
            .map((s, i) => ({ ...s, orderIndex: i + 1, title: `Slide ${i + 1}` }));
        setProject((prev) => ({ ...prev, slides: newSlides }));
        setActiveSlideIndex(Math.max(0, idx - 1));
        warning('Slide Dihapus', `${removedTitle} telah dihapus dari rangkaian carousel.`);
    };

    const handleCopyAllScript = () => {
        let fullText = `JUDUL: ${project.title}\nFORMAT: ${project.format}\n\n`;

        if (project.format === 'reels_shorts') {
            fullText += `[THE HOOK (0-3 Detik)]\n${project.reelsScript.hookText}\nVisual: ${project.reelsScript.hookVisualNotes}\n\n`;
            fullText += `[THE BODY (4-45 Detik)]\n${project.reelsScript.bodyText}\nVisual: ${project.reelsScript.bodyVisualNotes}\n\n`;
            fullText += `[CALL TO ACTION]\n${project.reelsScript.ctaText}\nVisual: ${project.reelsScript.ctaVisualNotes}\n\n`;
        } else {
            project.slides.forEach((slide) => {
                fullText += `[${slide.title}]\n${slide.textContent}\nCatatan Visual: ${slide.visualNotes}\n\n`;
            });
        }

        fullText += `--- CAPTION ---\n${project.caption}\n\n${project.hashtags}`;

        void copyToClipboard(fullText);
        setCopiedAll(true);
        success('Naskah Tersalin', 'Seluruh naskah dan caption berhasil disalin ke clipboard.');
        window.setTimeout(() => setCopiedAll(false), 2000);
    };

    const handleCopyCaptionOnly = () => {
        const fullCaption = `${project.caption}\n\n${project.hashtags}`;
        void copyToClipboard(fullCaption);
        setCopiedCaption(true);
        info('Caption Tersalin', 'Teks caption beserta tagar berhasil disalin.');
        window.setTimeout(() => setCopiedCaption(false), 2000);
    };

    const handleSave = () => {
        setIsSaving(true);
        window.setTimeout(() => {
            setIsSaving(false);
            success(
                'Naskah Berhasil Disimpan',
                `Perubahan pada "${project.title}" telah tersimpan di ruang kerja Studio.`
            );
        }, 320);
    };

    return (
        <AppLayout
            title={project.title}
            subtitle={`Format: ${
                project.format === 'reels_shorts'
                    ? 'Video Reels'
                    : project.format === 'carousel_feed'
                      ? 'Carousel Feed'
                      : 'Single Feed'
            } • PIC: ${project.picName}`}
            actions={
                <div className="flex flex-wrap items-center gap-2">
                    <Link href="/studio">
                        <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-3.5 h-3.5" />}>
                            Kembali
                        </Button>
                    </Link>
                    <Button
                        variant="outline"
                        size="sm"
                        icon={
                            copiedAll ? (
                                <Check className="w-3.5 h-3.5 text-[#00A870] dark:text-emerald-400" />
                            ) : (
                                <Copy className="w-3.5 h-3.5" />
                            )
                        }
                        onClick={handleCopyAllScript}
                    >
                        {copiedAll ? 'Tersalin!' : 'Salin Naskah'}
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        isLoading={isSaving}
                        icon={<Save className="w-3.5 h-3.5" />}
                        onClick={handleSave}
                    >
                        Simpan
                    </Button>
                </div>
            }
        >
            <Head title={`Studio: ${project.title} - SPARC`} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Main Script Editor (8 Cols) */}
                <div className="lg:col-span-8 space-y-6">
                    {/* Top Status & Format Switcher Bar */}
                    <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-4 rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
                                    Status:
                                </span>
                                <select
                                    aria-label="Status proyek naskah"
                                    value={project.status}
                                    onChange={(e) => {
                                        const next = e.target.value as StudioProjectDetail['status'];
                                        setProject({ ...project, status: next });
                                        info('Status Proyek Diubah', `Status naskah diperbarui ke "${next.replace(/_/g, ' ')}".`);
                                    }}
                                    className="h-8 text-xs font-bold bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border border-[var(--md-sys-color-primary)]/30 rounded-xl px-3 focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/30 cursor-pointer"
                                >
                                    <option value="drafting">Drafting</option>
                                    <option value="in_scripting">Naskah Sedang Ditulis</option>
                                    <option value="in_design">Proses Desain Visual</option>
                                    <option value="ready_to_publish">Siap Publikasi</option>
                                    <option value="published">Sudah Tayang (Published)</option>
                                </select>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
                                    Mode Editor:
                                </span>
                                <select
                                    aria-label="Format editor naskah"
                                    value={project.format}
                                    onChange={(e) =>
                                        setProject({
                                            ...project,
                                            format: e.target.value as StudioProjectDetail['format'],
                                        })
                                    }
                                    className="h-8 text-xs font-bold bg-[var(--md-sys-color-surface-container-low)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/30 cursor-pointer"
                                >
                                    <option value="reels_shorts">Video Reels (Hook-Body-CTA)</option>
                                    <option value="carousel_feed">Carousel Multi-Slide</option>
                                </select>
                            </div>
                        </div>

                        {project.haloapuTicketId && (
                            <div className="flex items-center gap-2 text-xs">
                                <span className="text-[var(--md-sys-color-on-surface-variant)]">Tiket:</span>
                                <Link
                                    href="/incoming"
                                    className="font-mono font-bold text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] px-2.5 py-0.5 rounded-lg hover:underline"
                                >
                                    #{project.haloapuTicketId}
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* Editor Format: REELS / SHORTS */}
                    {project.format === 'reels_shorts' ? (
                        <div className="space-y-5">
                            {/* Hook Segment */}
                            <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-5 rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-3.5 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1.5 h-full bg-[#1546D8] dark:bg-blue-500" />
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="primary">0 - 3 Detik</Badge>
                                        <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                            The Hook (Pengait Perhatian)
                                        </h3>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        icon={<Sparkles className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" />}
                                        onClick={() => setHookModalOpen(true)}
                                    >
                                        Pilih dari Hook Bank
                                    </Button>
                                </div>

                                <Textarea
                                    rows={2}
                                    placeholder="Tulis kalimat hook pembuka video..."
                                    value={project.reelsScript.hookText}
                                    onChange={(e) =>
                                        setProject({
                                            ...project,
                                            reelsScript: { ...project.reelsScript, hookText: e.target.value },
                                        })
                                    }
                                />

                                <Input
                                    label="Instruksi Aksi / Visual Hook (Untuk Kreator / Editor)"
                                    placeholder="Contoh: Talenta tatap kamera ekspresi terkejut, sound effect 'pop'..."
                                    value={project.reelsScript.hookVisualNotes}
                                    onChange={(e) =>
                                        setProject({
                                            ...project,
                                            reelsScript: {
                                                ...project.reelsScript,
                                                hookVisualNotes: e.target.value,
                                            },
                                        })
                                    }
                                />
                            </div>

                            {/* Core Body Segment */}
                            <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-5 rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-3.5 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1.5 h-full bg-[#00A870] dark:bg-emerald-500" />
                                <div className="flex items-center gap-2">
                                    <Badge variant="success">4 - 45 Detik</Badge>
                                    <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                        The Core Value (Daging Materi)
                                    </h3>
                                </div>

                                <Textarea
                                    rows={4}
                                    placeholder="Tulis naskah monolog / dialog lengkap isi materi..."
                                    value={project.reelsScript.bodyText}
                                    onChange={(e) =>
                                        setProject({
                                            ...project,
                                            reelsScript: { ...project.reelsScript, bodyText: e.target.value },
                                        })
                                    }
                                />

                                <Input
                                    label="Catatan Footage / B-Roll / Screen Recording"
                                    placeholder="Contoh: Tampilkan screen record cara klik tombol pendaftaran..."
                                    value={project.reelsScript.bodyVisualNotes}
                                    onChange={(e) =>
                                        setProject({
                                            ...project,
                                            reelsScript: {
                                                ...project.reelsScript,
                                                bodyVisualNotes: e.target.value,
                                            },
                                        })
                                    }
                                />
                            </div>

                            {/* CTA Segment */}
                            <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-5 rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-3.5 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1.5 h-full bg-[#F59E0B]" />
                                <div className="flex items-center gap-2">
                                    <Badge variant="warning">Detik Akhir</Badge>
                                    <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                        Call to Action (Ajakan Tindakan)
                                    </h3>
                                </div>

                                <Textarea
                                    rows={2}
                                    placeholder="Tulis kalimat ajakan: simpan, bagikan, atau komen..."
                                    value={project.reelsScript.ctaText}
                                    onChange={(e) =>
                                        setProject({
                                            ...project,
                                            reelsScript: { ...project.reelsScript, ctaText: e.target.value },
                                        })
                                    }
                                />

                                <Input
                                    label="Catatan Visual Outro / Closing Card"
                                    placeholder="Contoh: Tampilkan logo instansi dan tag sosial media..."
                                    value={project.reelsScript.ctaVisualNotes}
                                    onChange={(e) =>
                                        setProject({
                                            ...project,
                                            reelsScript: {
                                                ...project.reelsScript,
                                                ctaVisualNotes: e.target.value,
                                            },
                                        })
                                    }
                                />
                            </div>
                        </div>
                    ) : (
                        /* Editor Format: CAROUSEL FEED (MULTI-SLIDE) */
                        <div className="space-y-5">
                            {/* Slide Navigation Tabs with layoutId */}
                            <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-3 rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] flex items-center justify-between gap-3 overflow-x-auto">
                                <div className="flex items-center gap-1.5">
                                    {project.slides.map((slide, idx) => {
                                        const active = activeSlideIndex === idx;
                                        return (
                                            <button
                                                key={slide.id}
                                                type="button"
                                                onClick={() => setActiveSlideIndex(idx)}
                                                className={`relative px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
                                                    active
                                                        ? 'text-[var(--md-sys-color-on-primary)]'
                                                        : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                                                }`}
                                            >
                                                {active && (
                                                    <motion.span
                                                        layoutId="studio-slide-active-pill"
                                                        transition={MD3_SPRING.indicator}
                                                        className="absolute inset-0 rounded-xl bg-[var(--md-sys-color-primary)] shadow-2xs"
                                                    />
                                                )}
                                                <span className="relative z-10">Slide {idx + 1}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <Button
                                    size="sm"
                                    variant="outline"
                                    icon={<Plus className="w-3.5 h-3.5" />}
                                    onClick={handleAddSlide}
                                    className="shrink-0"
                                >
                                    Tambah Slide
                                </Button>
                            </div>

                            {/* Active Slide Editor Box */}
                            <AnimatePresence mode="wait" initial={false}>
                                {project.slides[activeSlideIndex] && (
                                    <motion.div
                                        key={project.slides[activeSlideIndex].id}
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -3 }}
                                        transition={{ duration: 0.15, ease: MD3_EASING.decelerate }}
                                        className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-6 rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-4"
                                    >
                                        <div className="flex items-center justify-between pb-3 border-b border-[var(--md-sys-color-outline-variant)]">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="primary">
                                                    Slide {activeSlideIndex + 1} / {project.slides.length}
                                                </Badge>
                                                <input
                                                    type="text"
                                                    aria-label="Judul slide"
                                                    value={project.slides[activeSlideIndex].title}
                                                    onChange={(e) => {
                                                        const updated = [...project.slides];
                                                        updated[activeSlideIndex] = {
                                                            ...updated[activeSlideIndex],
                                                            title: e.target.value,
                                                        };
                                                        setProject({ ...project, slides: updated });
                                                    }}
                                                    className="text-sm font-bold text-[var(--md-sys-color-on-surface)] bg-transparent border-b border-transparent hover:border-[var(--md-sys-color-outline)] focus:border-[var(--md-sys-color-primary)] focus:outline-none px-1"
                                                />
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {activeSlideIndex === 0 && (
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        icon={<Sparkles className="w-3.5 h-3.5" />}
                                                        onClick={() => setHookModalOpen(true)}
                                                    >
                                                        Pilih Hook
                                                    </Button>
                                                )}
                                                {project.slides.length > 1 && (
                                                    <button
                                                        type="button"
                                                        aria-label="Hapus slide ini"
                                                        onClick={() => handleDeleteSlide(activeSlideIndex)}
                                                        className="p-1.5 rounded-xl text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-error-container)]/50 transition-colors cursor-pointer"
                                                        title="Hapus Slide Ini"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <Textarea
                                            label="Isi Teks Slide"
                                            rows={4}
                                            placeholder="Tulis naskah yang akan tampil di slide desain ini..."
                                            value={project.slides[activeSlideIndex].textContent}
                                            onChange={(e) => {
                                                const updated = [...project.slides];
                                                updated[activeSlideIndex] = {
                                                    ...updated[activeSlideIndex],
                                                    textContent: e.target.value,
                                                };
                                                setProject({ ...project, slides: updated });
                                            }}
                                        />

                                        <Textarea
                                            label="Instruksi Visual / Catatan untuk Desainer"
                                            rows={2}
                                            placeholder="Contoh: Gunakan latar tonal slate, teks judul dibuat bold di atas..."
                                            value={project.slides[activeSlideIndex].visualNotes}
                                            onChange={(e) => {
                                                const updated = [...project.slides];
                                                updated[activeSlideIndex] = {
                                                    ...updated[activeSlideIndex],
                                                    visualNotes: e.target.value,
                                                };
                                                setProject({ ...project, slides: updated });
                                            }}
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </div>

                {/* Right Sidebar Utility Panel (4 Cols) */}
                <div className="lg:col-span-4 space-y-6">
                    {/* Caption & Hashtags Box */}
                    <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-5 rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-[var(--md-sys-color-outline-variant)]">
                            <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                Caption & Tagar
                            </h3>
                            <button
                                type="button"
                                onClick={handleCopyCaptionOnly}
                                className="text-xs font-bold text-[var(--md-sys-color-primary)] hover:underline flex items-center gap-1 cursor-pointer"
                            >
                                {copiedCaption ? (
                                    <Check className="w-3.5 h-3.5 text-[#00A870] dark:text-emerald-400" />
                                ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                )}
                                {copiedCaption ? 'Tersalin' : 'Salin Caption'}
                            </button>
                        </div>

                        <Textarea
                            label="Teks Caption Publikasi"
                            rows={4}
                            placeholder="Tulis caption postingan..."
                            value={project.caption}
                            onChange={(e) => setProject({ ...project, caption: e.target.value })}
                        />

                        <Textarea
                            label="Kumpulan Tagar (Hashtags)"
                            rows={2}
                            placeholder="#LayananPublik #Humas..."
                            value={project.hashtags}
                            onChange={(e) => setProject({ ...project, hashtags: e.target.value })}
                        />
                    </div>

                    {/* Production Links & Published URL */}
                    <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-5 rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-4">
                        <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] pb-3 border-b border-[var(--md-sys-color-outline-variant)]">
                            Tautan Produksi & Publikasi
                        </h3>

                        <Input
                            label="Tautan Desain Canva / Figma"
                            placeholder="https://canva.com/design/..."
                            value={project.canvaUrl || ''}
                            onChange={(e) => setProject({ ...project, canvaUrl: e.target.value })}
                        />

                        <Input
                            label="Tautan Referensi Moodboard"
                            placeholder="https://instagram.com/..."
                            value={project.referenceUrl || ''}
                            onChange={(e) => setProject({ ...project, referenceUrl: e.target.value })}
                        />

                        <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                            <Input
                                label="Published URL (Medsos Resmi)"
                                placeholder="https://instagram.com/p/..."
                                helperText="Memasukkan URL ini menandai materi siap disinkronkan ke HaloAPU"
                                value={project.publishedUrl || ''}
                                onChange={(e) => setProject({ ...project, publishedUrl: e.target.value })}
                            />
                        </div>

                        <div className="pt-1">
                            <Link href="/grid" className="w-full block">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    icon={<Grid3x3 className="w-3.5 h-3.5" />}
                                    className="w-full"
                                >
                                    Susun di Visual Grid
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hook Bank Modal Picker */}
            <Modal
                isOpen={hookModalOpen}
                onClose={() => setHookModalOpen(false)}
                title="Pilih Formula dari Hook Bank"
                description="Pilih formula hook teruji dan terapkan langsung ke pembuka naskah"
                maxWidth="xl"
            >
                <div className="space-y-4">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--md-sys-color-on-surface-variant)] pointer-events-none" />
                        <input
                            type="text"
                            aria-label="Cari formula hook"
                            placeholder="Cari formula atau kategori hook..."
                            value={hookSearch}
                            onChange={(e) => setHookSearch(e.target.value)}
                            className="w-full h-9 pl-9 pr-3 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/30"
                        />
                    </div>

                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {filteredHooks.map((h) => (
                            <div
                                key={h.id}
                                className="p-3.5 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]/60 hover:border-[var(--md-sys-color-primary)]/60 transition-all flex items-center justify-between gap-3 group"
                            >
                                <div className="space-y-1">
                                    <Badge variant="default">{h.category}</Badge>
                                    <p className="text-xs font-medium text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)] pt-0.5">
                                        &ldquo;{h.text}&rdquo;
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="primary"
                                    onClick={() => handleApplyHook(h.text)}
                                    className="shrink-0"
                                >
                                    Terapkan
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            </Modal>
        </AppLayout>
    );
}
