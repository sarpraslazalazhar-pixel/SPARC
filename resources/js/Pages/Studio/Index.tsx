import React, { useMemo, useState } from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import { motion } from 'framer-motion';
import {
    Plus,
    Search,
    FileText,
    Video,
    Layers,
    Calendar,
    User,
    ArrowUpRight,
} from 'lucide-react';
import { AppLayout } from '@/Layouts/AppLayout';
import { Button } from '@/Components/UI/Button';
import { Badge } from '@/Components/UI/Badge';
import { Modal } from '@/Components/UI/Modal';
import { Input } from '@/Components/UI/Input';
import { Select } from '@/Components/UI/Select';
import { useToast } from '@/Components/UI/Toast';
import { MD3_SPRING, staggerContainerVariants, staggerItemVariants } from '@/lib/motion';

export interface CreativeProject {
    id: string;
    title: string;
    format: 'reels_shorts' | 'carousel_feed' | 'single_feed';
    pillar: 'edukasi' | 'event_liputan' | 'sosialisasi_prestasi' | 'pengumuman' | 'human_touch';
    status: 'drafting' | 'in_scripting' | 'in_design' | 'ready_to_publish' | 'published';
    picName: string;
    targetDate?: string;
    haloapuTicketId?: string;
    slideCount?: number;
    publishedUrl?: string;
    updatedAt: string;
}

interface StudioIndexProps {
    projects?: CreativeProject[];
    sessionProjects?: CreativeProject[];
}

const DEFAULT_PROJECTS: CreativeProject[] = [];

const STATUS_PILLS = [
    { id: 'all', label: 'Semua Status' },
    { id: 'drafting', label: 'Drafting' },
    { id: 'in_scripting', label: 'Naskah' },
    { id: 'in_design', label: 'Desain' },
    { id: 'ready_to_publish', label: 'Siap Tayang' },
    { id: 'published', label: 'Published' },
];

export default function StudioIndex({
    projects: initialProjects,
    sessionProjects = [],
}: StudioIndexProps) {
    const { error } = useToast();

    const projects = useMemo(
        () => [...sessionProjects, ...(initialProjects || DEFAULT_PROJECTS)],
        [sessionProjects, initialProjects]
    );

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [formatFilter, setFormatFilter] = useState('all');
    const [createModalOpen, setCreateModalOpen] = useState(false);

    const createForm = useForm({
        title: '',
        format: 'reels_shorts' as CreativeProject['format'],
        pillar: 'edukasi' as CreativeProject['pillar'],
        pic_name: 'Aldwin (Writer)',
        target_date: '2026-11-12',
    });

    const filteredProjects = useMemo(() => {
        return projects.filter((p) => {
            if (statusFilter !== 'all' && p.status !== statusFilter) {
                return false;
            }
            if (formatFilter !== 'all' && p.format !== formatFilter) {
                return false;
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchTitle = p.title.toLowerCase().includes(q);
                const matchPic = p.picName.toLowerCase().includes(q);
                const matchTicket = p.haloapuTicketId?.toLowerCase().includes(q);
                if (!matchTitle && !matchPic && !matchTicket) {
                    return false;
                }
            }
            return true;
        });
    }, [projects, statusFilter, formatFilter, searchQuery]);

    const handleCreateProject = (e: React.FormEvent) => {
        e.preventDefault();
        createForm.post('/studio/projects', {
            onSuccess: () => {
                setCreateModalOpen(false);
                createForm.reset();
            },
            onError: () => {
                error('Validasi Proyek Gagal', 'Mohon isi judul proyek minimal 3 karakter.');
            },
        });
    };

    const getFormatBadge = (format: CreativeProject['format']) => {
        switch (format) {
            case 'reels_shorts':
                return (
                    <Badge variant="primary" className="gap-1">
                        <Video className="w-3 h-3" /> Reels
                    </Badge>
                );
            case 'carousel_feed':
                return (
                    <Badge variant="success" className="gap-1">
                        <Layers className="w-3 h-3" /> Carousel
                    </Badge>
                );
            case 'single_feed':
                return (
                    <Badge variant="default" className="gap-1">
                        <FileText className="w-3 h-3" /> Single Feed
                    </Badge>
                );
        }
    };

    const getStatusBadge = (status: CreativeProject['status']) => {
        switch (status) {
            case 'drafting':
                return <Badge variant="default">Drafting</Badge>;
            case 'in_scripting':
                return <Badge variant="warning">Naskah Ditulis</Badge>;
            case 'in_design':
                return <Badge variant="primary">Proses Desain</Badge>;
            case 'ready_to_publish':
                return <Badge variant="purple">Siap Tayang</Badge>;
            case 'published':
                return <Badge variant="success">Published</Badge>;
        }
    };

    const getPillarLabel = (pillar: CreativeProject['pillar']) => {
        switch (pillar) {
            case 'edukasi':
                return 'Edukasi Publik';
            case 'event_liputan':
                return 'Liputan Event';
            case 'sosialisasi_prestasi':
                return 'Sosialisasi & Prestasi';
            case 'pengumuman':
                return 'Pengumuman Resmi';
            case 'human_touch':
                return 'Human Touch';
        }
    };

    return (
        <AppLayout
            title="Script Studio"
            subtitle="Studio penulisan naskah video Reels (Hook-Body-CTA) dan struktur slide Carousel"
            actions={
                <Button
                    size="sm"
                    variant="primary"
                    icon={<Plus className="w-3.5 h-3.5" />}
                    onClick={() => {
                        createForm.clearErrors();
                        setCreateModalOpen(true);
                    }}
                >
                    Buat Naskah Baru
                </Button>
            }
        >
            <Head title="Script Studio - SPARC" />

            <div className="space-y-6">
                {/* Search & Filter Header */}
                <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-4 rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-1.5 bg-[var(--md-sys-color-surface-container-low)] p-1 rounded-2xl border border-[var(--md-sys-color-outline-variant)]/60">
                        {STATUS_PILLS.map((st) => {
                            const active = statusFilter === st.id;
                            return (
                                <button
                                    key={st.id}
                                    type="button"
                                    onClick={() => setStatusFilter(st.id)}
                                    className={`relative px-3 py-1.5 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                                        active
                                            ? 'text-[var(--md-sys-color-on-primary)]'
                                            : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                                    }`}
                                >
                                    {active && (
                                        <motion.span
                                            layoutId="studio-status-filter-pill"
                                            transition={MD3_SPRING.indicator}
                                            className="absolute inset-0 rounded-xl bg-[var(--md-sys-color-primary)] shadow-2xs"
                                        />
                                    )}
                                    <span className="relative z-10">{st.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <select
                            aria-label="Filter format proyek naskah"
                            value={formatFilter}
                            onChange={(e) => setFormatFilter(e.target.value)}
                            className="h-9 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 text-[var(--md-sys-color-on-surface)] font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/30 cursor-pointer"
                        >
                            <option value="all">Semua Format</option>
                            <option value="reels_shorts">Reels / Shorts</option>
                            <option value="carousel_feed">Carousel Feed</option>
                            <option value="single_feed">Single Feed</option>
                        </select>

                        <div className="relative w-full sm:w-60">
                            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--md-sys-color-on-surface-variant)] pointer-events-none" />
                            <input
                                type="text"
                                aria-label="Cari naskah"
                                placeholder="Cari naskah atau PIC..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-9 pl-9 pr-3 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/30 focus:border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)]/70 transition-colors"
                            />
                        </div>
                    </div>
                </div>

                {/* Projects Grid Cards */}
                {filteredProjects.length === 0 ? (
                    <div className="py-16 text-center bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-3xl border border-dashed border-[var(--md-sys-color-outline-variant)] space-y-2">
                        <FileText className="w-10 h-10 text-[var(--md-sys-color-on-surface-variant)]/50 mx-auto mb-2" />
                        <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                            Tidak ada proyek naskah yang cocok
                        </p>
                        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                            Buat proyek naskah baru atau konversi pengajuan dari halaman Incoming Requests.
                        </p>
                    </div>
                ) : (
                    <motion.div
                        variants={staggerContainerVariants}
                        initial="hidden"
                        animate="show"
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
                    >
                        {filteredProjects.map((project) => (
                            <motion.div key={project.id} variants={staggerItemVariants}>
                                <Link
                                    href={`/studio/${project.id}`}
                                    className="h-full bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-3xl border border-[var(--md-sys-color-outline-variant)] p-5 shadow-[var(--md-elevation-1)] hover:border-[var(--md-sys-color-primary)]/60 hover:shadow-[var(--md-elevation-2)] hover:-translate-y-0.5 transition-all duration-200 group flex flex-col justify-between"
                                >
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1.5">
                                                {getFormatBadge(project.format)}
                                                {project.haloapuTicketId && (
                                                    <span className="font-mono text-[10px] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] px-1.5 py-0.5 rounded font-bold">
                                                        #{project.haloapuTicketId}
                                                    </span>
                                                )}
                                            </div>
                                            {getStatusBadge(project.status)}
                                        </div>

                                        <div>
                                            <h3 className="font-bold text-sm text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)] transition-colors line-clamp-2 flex items-start justify-between gap-2">
                                                <span>{project.title}</span>
                                                <ArrowUpRight className="w-4 h-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[var(--md-sys-color-primary)]" />
                                            </h3>
                                            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1 font-medium">
                                                Pilar: {getPillarLabel(project.pillar)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="pt-4 mt-4 border-t border-[var(--md-sys-color-outline-variant)]/70 flex items-center justify-between text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                        <div className="flex items-center gap-1.5">
                                            <User className="w-3.5 h-3.5" />
                                            <span className="truncate max-w-[130px] font-medium text-[var(--md-sys-color-on-surface)]">
                                                {project.picName}
                                            </span>
                                        </div>

                                        {project.targetDate ? (
                                            <div className="flex items-center gap-1 text-[11px]">
                                                <Calendar className="w-3 h-3" />
                                                <span>{project.targetDate}</span>
                                            </div>
                                        ) : (
                                            <span className="text-[11px]">{project.updatedAt}</span>
                                        )}
                                    </div>
                                </Link>
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </div>

            {/* Create Project Modal connected to Laravel Validation */}
            <Modal
                isOpen={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
                title="Buat Proyek Naskah Baru"
                description="Mulai rancang naskah video Reels atau struktur slide Carousel"
                maxWidth="md"
            >
                <form onSubmit={handleCreateProject} className="space-y-4" noValidate>
                    <Input
                        label="Judul Konten"
                        required
                        placeholder="Contoh: 5 Tips Efektif Komunikasi Pelayanan Publik"
                        value={createForm.data.title}
                        onChange={(e) => createForm.setData('title', e.target.value)}
                        error={createForm.errors.title}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Select
                            label="Format Konten"
                            required
                            value={createForm.data.format}
                            onChange={(e) =>
                                createForm.setData('format', e.target.value as CreativeProject['format'])
                            }
                            error={createForm.errors.format}
                        >
                            <option value="reels_shorts">Reels / Shorts (Hook-Body-CTA)</option>
                            <option value="carousel_feed">Carousel Feed (Multi-Slide)</option>
                            <option value="single_feed">Single Feed</option>
                        </Select>

                        <Select
                            label="Pilar Konten Humas"
                            required
                            value={createForm.data.pillar}
                            onChange={(e) =>
                                createForm.setData('pillar', e.target.value as CreativeProject['pillar'])
                            }
                            error={createForm.errors.pillar}
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
                            value={createForm.data.pic_name}
                            onChange={(e) => createForm.setData('pic_name', e.target.value)}
                            error={createForm.errors.pic_name}
                        >
                            <option value="Aldwin (Writer)">Aldwin (Writer)</option>
                            <option value="Designer 1">Designer 1</option>
                            <option value="Designer 2">Designer 2</option>
                            <option value="Editor Video">Editor Video</option>
                        </Select>

                        <Input
                            label="Target Tanggal Tayang"
                            type="date"
                            value={createForm.data.target_date}
                            onChange={(e) => createForm.setData('target_date', e.target.value)}
                            error={createForm.errors.target_date}
                        />
                    </div>

                    <div className="pt-4 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2.5">
                        <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            onClick={() => setCreateModalOpen(false)}
                            disabled={createForm.processing}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            isLoading={createForm.processing}
                        >
                            Buka Studio Editor
                        </Button>
                    </div>
                </form>
            </Modal>
        </AppLayout>
    );
}
