import React, { useMemo, useState } from 'react';
import { Head } from '@inertiajs/react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Sparkles,
    BookOpen,
    Palette,
    Search,
    Copy,
    Check,
    ExternalLink,
    CheckCircle2,
    XCircle,
} from 'lucide-react';
import { AppLayout } from '@/Layouts/AppLayout';
import { Button } from '@/Components/UI/Button';
import { Badge } from '@/Components/UI/Badge';
import { Tabs } from '@/Components/UI/Tabs';
import { useToast } from '@/Components/UI/Toast';
import { MD3_EASING, MD3_SPRING } from '@/lib/motion';
import { copyToClipboard } from '@/lib/utils';

export interface HookItem {
    id: string;
    category: 'pertanyaan' | 'personalisasi' | 'edukasi_rahasia' | 'pain_gain' | 'kontroversial' | 'storytelling';
    categoryLabel: string;
    text: string;
    context: string;
}

export interface PillarGuide {
    key: string;
    title: string;
    objective: string;
    audience: string;
    moodboardImage: string;
    dos: string[];
    donts: string[];
}

export interface DesignTemplateItem {
    id: string;
    title: string;
    category: 'canva_feed' | 'canva_carousel' | 'canva_story' | 'figma_component' | 'drive_assets';
    dimension: string;
    externalUrl: string;
    thumbnailUrl: string;
    description: string;
}

const HOOKS_DATA: HookItem[] = [
    {
        id: 'h1',
        category: 'pertanyaan',
        categoryLabel: 'Pertanyaan Ajakan',
        text: 'Pernahkah kamu bertanya-tanya kenapa urus berkas ini terasa lama?',
        context: 'Gunakan untuk membuka video penjelasan alur pendaftaran baru yang lebih cepat.',
    },
    {
        id: 'h2',
        category: 'pertanyaan',
        categoryLabel: 'Pertanyaan Ajakan',
        text: 'Apakah kamu tahu kalau sekarang ada cara legal urus izin tanpa calo?',
        context: 'Cocok untuk konten edukasi antikorupsi dan transparansi publik.',
    },
    {
        id: 'h3',
        category: 'personalisasi',
        categoryLabel: 'Personalisasi',
        text: 'Kalau kamu sering bolak-balik kantor dinas cuma buat cap stempel, tonton ini sampai habis!',
        context: 'Menyasar langsung audiens masyarakat yang frustrasi dengan birokrasi manual.',
    },
    {
        id: 'h4',
        category: 'personalisasi',
        categoryLabel: 'Personalisasi',
        text: 'Kami paham banget rasanya bingung cari informasi resmi yang valid...',
        context: 'Membangun empati dan keterikatan emosional di Reels format santai.',
    },
    {
        id: 'h5',
        category: 'edukasi_rahasia',
        categoryLabel: 'Edukasi & Rahasia',
        text: '3 Fitur rahasia di website resmi instansi yang jarang dimanfaatkan masyarakat!',
        context: 'Meningkatkan rasa penasaran (curiosity gap) untuk carousel 5 slide.',
    },
    {
        id: 'h6',
        category: 'edukasi_rahasia',
        categoryLabel: 'Edukasi & Rahasia',
        text: 'Jangan lakukan 3 kesalahan fatal ini saat mengunggah KTP di portal pendaftaran!',
        context: 'Hook negatif yang mendorong audiens membaca untuk menghindari kerugian.',
    },
    {
        id: 'h7',
        category: 'pain_gain',
        categoryLabel: 'Pain & Gain',
        text: 'Dari antre berjam-jam jadi selesai dalam 5 menit: Ini solusinya!',
        context: 'Perbandingan tajam antara kondisi lama (pain) dan kemudahan baru (gain).',
    },
    {
        id: 'h8',
        category: 'storytelling',
        categoryLabel: 'Storytelling Opening',
        text: 'Hari ini saya melihat langsung bagaimana tim Humas bekerja 24 jam saat krisis informasi...',
        context: 'Bagus untuk video format Behind The Scenes atau liputan kemanusiaan.',
    },
    {
        id: 'h9',
        category: 'kontroversial',
        categoryLabel: 'Kontroversial Ringan',
        text: 'Banyak yang bilang instansi ini lambat, tapi data resmi ini membuktikan sebaliknya!',
        context: 'Membantah stigma publik dengan data konkret dan infografis capaian.',
    },
];

const PILLARS_DATA: PillarGuide[] = [
    {
        key: 'edukasi',
        title: 'Pilar 1: Edukasi Publik & Layanan',
        objective:
            'Meningkatkan literasi masyarakat mengenai alur pelayanan, hak keterbukaan informasi, dan regulasi baru.',
        audience: 'Masyarakat umum, pemohon informasi, mahasiswa, dan media massa.',
        moodboardImage:
            'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=60',
        dos: [
            'Gunakan bahasa lugas tanpa istilah hukum yang membingungkan.',
            'Sertakan infografis visual langkah demi langkah (1-2-3).',
            'Cantumkan nomor hotline dan tautan resmi layanan.',
        ],
        donts: [
            'Hindari teks paragraf panjang tanpa poin bullet.',
            'Jangan gunakan warna kontras rendah yang sulit dibaca di HP.',
        ],
    },
    {
        key: 'event_liputan',
        title: 'Pilar 2: Liputan Acara & Seremonial',
        objective:
            'Mendokumentasikan kegiatan pimpinan dan momen strategis instansi secara estetik dan transparan.',
        audience: 'Pegawai internal, instansi mitra, dan pemangku kepentingan.',
        moodboardImage:
            'https://images.unsplash.com/photo-1511578314322-379afb476865?w=600&auto=format&fit=crop&q=60',
        dos: [
            'Pilih foto dengan pencahayaan baik dan framing profesional.',
            'Tulis kutipan penting pimpinan di slide pertama (hook).',
        ],
        donts: [
            'Hindari memposting foto berjejer tanpa narasi konteks acara.',
            'Jangan tayang lebih dari H+2 setelah acara selesai.',
        ],
    },
    {
        key: 'sosialisasi_prestasi',
        title: 'Pilar 3: Sosialisasi Program & Prestasi',
        objective:
            'Membangun reputasi positif lembaga dengan memaparkan bukti kerja nyata dan penghargaan.',
        audience: 'Publik nasional, pengamat kebijakan, dan media partner.',
        moodboardImage:
            'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=600&auto=format&fit=crop&q=60',
        dos: [
            'Gunakan visual angka besar dan statistik persentase pencapaian.',
            'Sebutkan dampak langsung bagi masyarakat, bukan hanya angka anggaran.',
        ],
        donts: ['Jangan terkesan menggurui atau defensif saat memaparkan data.'],
    },
    {
        key: 'pengumuman',
        title: 'Pilar 4: Pengumuman Resmi & Siaran Pers',
        objective:
            'Menyampaikan pemberitahuan penting, hari libur nasional, atau klarifikasi isu mendesak.',
        audience: 'Seluruh masyarakat dan jurnalis.',
        moodboardImage:
            'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=600&auto=format&fit=crop&q=60',
        dos: [
            'Gunakan format single feed yang mudah di-download dan dibagikan di WhatsApp.',
            'Sertakan stempel logo instansi resmi.',
        ],
        donts: ['Jangan memuat informasi yang belum terverifikasi oleh pimpinan.'],
    },
    {
        key: 'human_touch',
        title: 'Pilar 5: Human Touch & Behind the Scenes',
        objective:
            'Memanusiakan birokrasi dengan menampilkan profil pegawai, kerja keras di balik layar, dan budaya kerja.',
        audience: 'Generasi muda, netizen media sosial, dan komunitas lokal.',
        moodboardImage:
            'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&auto=format&fit=crop&q=60',
        dos: [
            'Gunakan gaya Reels dinamis dengan musik tren yang pantas.',
            'Sorot pegawai garda terdepan (frontliner) dan perjuangannya.',
        ],
        donts: ['Hindari settingan kaku yang terlihat seperti iklan komersial.'],
    },
];

const DESIGN_TEMPLATES: DesignTemplateItem[] = [
    {
        id: 'tmpl-1',
        title: 'Master Bundle: 50+ Template Feed Instagram Humas',
        category: 'canva_feed',
        dimension: '1080 x 1080 px',
        thumbnailUrl:
            'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60',
        externalUrl: 'https://www.canva.com/design/DAF2sCHhkQU/edit',
        description: 'Kumpulan layout feed resmi dengan palet warna biru royal dan aksen emas.',
    },
    {
        id: 'tmpl-2',
        title: 'Bundle Template Carousel Infografis 10 Slide',
        category: 'canva_carousel',
        dimension: '1080 x 1350 px (Portrait 4:5)',
        thumbnailUrl:
            'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=500&auto=format&fit=crop&q=60',
        externalUrl: 'https://www.canva.com/design/DAF2u8NigDs/edit',
        description:
            'Format carousel potrait untuk keterbacaan optimal di aplikasi mobile Instagram.',
    },
    {
        id: 'tmpl-3',
        title: 'Paket Cover Reels & Story Template',
        category: 'canva_story',
        dimension: '1080 x 1920 px (9:16)',
        thumbnailUrl:
            'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=500&auto=format&fit=crop&q=60',
        externalUrl: 'https://www.canva.com/design/DAF4qczdomg/edit',
        description:
            'Cover video vertikal dengan safe-zone area agar judul tidak tertutup ikon aplikasi.',
    },
    {
        id: 'tmpl-4',
        title: 'Design System & UI Components Humas Figma',
        category: 'figma_component',
        dimension: 'Vector SVG / Figma Tokens',
        thumbnailUrl:
            'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=500&auto=format&fit=crop&q=60',
        externalUrl: 'https://www.figma.com/community/file/example',
        description: 'Berkas kerja Figma berisi komponen tombol, icon set, dan grid layout.',
    },
    {
        id: 'tmpl-5',
        title: 'Google Drive Asset Library Humas Resmi',
        category: 'drive_assets',
        dimension: 'HD Assets & Vectors',
        thumbnailUrl:
            'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&auto=format&fit=crop&q=60',
        externalUrl: 'https://drive.google.com/drive/folders/example',
        description:
            'Folder logo instansi resmi resolusi tinggi, font standar, dan foto pimpinan.',
    },
];

const HOOK_CATEGORIES = [
    { id: 'all', label: 'Semua Kategori' },
    { id: 'pertanyaan', label: 'Pertanyaan' },
    { id: 'personalisasi', label: 'Personalisasi' },
    { id: 'edukasi_rahasia', label: 'Edukasi & Rahasia' },
    { id: 'pain_gain', label: 'Pain & Gain' },
    { id: 'storytelling', label: 'Storytelling' },
    { id: 'kontroversial', label: 'Kontroversial' },
];

export default function ResourcesIndex() {
    const { success } = useToast();
    const [activeTab, setActiveTab] = useState<'hooks' | 'guides' | 'designs'>('hooks');

    const [hookSearch, setHookSearch] = useState('');
    const [hookCategory, setHookCategory] = useState('all');
    const [copiedHookId, setCopiedHookId] = useState<string | null>(null);

    const filteredHooks = useMemo(() => {
        return HOOKS_DATA.filter((h) => {
            if (hookCategory !== 'all' && h.category !== hookCategory) {
                return false;
            }
            if (hookSearch.trim()) {
                const q = hookSearch.toLowerCase();
                const matchText = h.text.toLowerCase().includes(q);
                const matchCat = h.categoryLabel.toLowerCase().includes(q);
                const matchCtx = h.context.toLowerCase().includes(q);
                if (!matchText && !matchCat && !matchCtx) {
                    return false;
                }
            }
            return true;
        });
    }, [hookCategory, hookSearch]);

    const handleCopyHook = (id: string, text: string) => {
        void copyToClipboard(text);
        setCopiedHookId(id);
        success('Formula Hook Tersalin', `"${text.slice(0, 56)}..." siap ditempel ke naskah.`);
        window.setTimeout(() => setCopiedHookId(null), 1800);
    };

    const tabsData = [
        {
            id: 'hooks',
            label: 'Bank 200+ Hook Konten',
            icon: <Sparkles className="w-4 h-4 text-[var(--md-sys-color-primary)]" />,
        },
        {
            id: 'guides',
            label: 'Panduan Pilar & Moodboard',
            icon: <BookOpen className="w-4 h-4 text-[#00A870] dark:text-emerald-400" />,
        },
        {
            id: 'designs',
            label: 'Direktori Template Canva & Figma',
            icon: <Palette className="w-4 h-4 text-[#F59E0B]" />,
        },
    ];

    return (
        <AppLayout
            title="Creative Resource Library"
            subtitle="Pusat formula hook, panduan pilar konten Humas, dan direktori template desain"
        >
            <Head title="Resource Library - SPARC" />

            <div className="space-y-6">
                {/* Navigation Tabs */}
                <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-3.5 rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] flex flex-wrap items-center justify-between gap-3">
                    <Tabs
                        tabs={tabsData}
                        activeTab={activeTab}
                        onChange={(id) => setActiveTab(id as typeof activeTab)}
                    />
                </div>

                <AnimatePresence mode="wait" initial={false}>
                    {/* TAB 1: BANK HOOK KONTEN */}
                    {activeTab === 'hooks' && (
                        <motion.div
                            key="tab-hooks"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.16, ease: MD3_EASING.decelerate }}
                            className="space-y-5"
                        >
                            {/* Search & Category Filter */}
                            <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-4 rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                <div className="flex flex-wrap items-center gap-1.5 bg-[var(--md-sys-color-surface-container-low)] p-1 rounded-2xl border border-[var(--md-sys-color-outline-variant)]/60">
                                    {HOOK_CATEGORIES.map((cat) => {
                                        const active = hookCategory === cat.id;
                                        return (
                                            <button
                                                key={cat.id}
                                                type="button"
                                                onClick={() => setHookCategory(cat.id)}
                                                className={`relative px-3 py-1.5 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                                                    active
                                                        ? 'text-[var(--md-sys-color-on-primary)]'
                                                        : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                                                }`}
                                            >
                                                {active && (
                                                    <motion.span
                                                        layoutId="resource-hook-category-pill"
                                                        transition={MD3_SPRING.indicator}
                                                        className="absolute inset-0 rounded-xl bg-[var(--md-sys-color-primary)] shadow-2xs"
                                                    />
                                                )}
                                                <span className="relative z-10">{cat.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="relative w-full sm:w-72">
                                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--md-sys-color-on-surface-variant)] pointer-events-none" />
                                    <input
                                        type="text"
                                        aria-label="Cari formula hook"
                                        placeholder="Cari formula hook..."
                                        value={hookSearch}
                                        onChange={(e) => setHookSearch(e.target.value)}
                                        className="w-full h-9 pl-9 pr-3 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/30 focus:border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)]/70"
                                    />
                                </div>
                            </div>

                            {/* Hooks Cards List */}
                            {filteredHooks.length === 0 ? (
                                <div className="py-12 text-center bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-3xl border border-dashed border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                    Tidak ditemukan formula hook yang cocok dengan kata kunci pencarian.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filteredHooks.map((hook) => (
                                        <div
                                            key={hook.id}
                                            className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-5 rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] hover:border-[var(--md-sys-color-primary)]/60 hover:shadow-[var(--md-elevation-2)] hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between space-y-3 group"
                                        >
                                            <div className="space-y-2.5">
                                                <div className="flex items-center justify-between">
                                                    <Badge variant="primary">{hook.categoryLabel}</Badge>
                                                    <button
                                                        type="button"
                                                        aria-label={`Salin hook ${hook.categoryLabel}`}
                                                        onClick={() => handleCopyHook(hook.id, hook.text)}
                                                        className="p-1.5 rounded-xl text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary-container)]/60 transition-colors cursor-pointer"
                                                        title="Salin Teks Hook"
                                                    >
                                                        {copiedHookId === hook.id ? (
                                                            <Check className="w-4 h-4 text-[#00A870] dark:text-emerald-400" />
                                                        ) : (
                                                            <Copy className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>

                                                <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)] transition-colors leading-snug">
                                                    &ldquo;{hook.text}&rdquo;
                                                </p>
                                            </div>

                                            <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)]/70">
                                                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] italic">
                                                    Tips: {hook.context}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* TAB 2: PANDUAN PILAR HUMAS */}
                    {activeTab === 'guides' && (
                        <motion.div
                            key="tab-guides"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.16, ease: MD3_EASING.decelerate }}
                            className="space-y-6"
                        >
                            {PILLARS_DATA.map((pillar) => (
                                <div
                                    key={pillar.key}
                                    className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] overflow-hidden grid grid-cols-1 md:grid-cols-12"
                                >
                                    <div className="md:col-span-4 relative aspect-video md:aspect-auto bg-[var(--md-sys-color-surface-container-high)]">
                                        <img
                                            src={pillar.moodboardImage}
                                            alt={pillar.title}
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 to-transparent flex items-end p-4 text-white">
                                            <span className="text-xs font-semibold">Moodboard Acuan</span>
                                        </div>
                                    </div>

                                    <div className="md:col-span-8 p-6 space-y-4">
                                        <div>
                                            <h3 className="text-base font-extrabold text-[var(--md-sys-color-on-surface)]">
                                                {pillar.title}
                                            </h3>
                                            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1 leading-relaxed">
                                                {pillar.objective}
                                            </p>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                            <span className="font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                                                Target Audiens:
                                            </span>
                                            <span className="bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] px-2.5 py-0.5 rounded-lg font-medium">
                                                {pillar.audience}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[var(--md-sys-color-outline-variant)] text-xs">
                                            <div className="space-y-2">
                                                <span className="font-bold text-[#00A870] dark:text-emerald-400 flex items-center gap-1.5">
                                                    <CheckCircle2 className="w-4 h-4" /> Praktik Terbaik (Do&apos;s)
                                                </span>
                                                <ul className="space-y-1 text-[var(--md-sys-color-on-surface-variant)] list-disc list-inside">
                                                    {pillar.dos.map((item, idx) => (
                                                        <li key={idx} className="leading-relaxed">
                                                            {item}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>

                                            <div className="space-y-2">
                                                <span className="font-bold text-[#D61F45] dark:text-rose-400 flex items-center gap-1.5">
                                                    <XCircle className="w-4 h-4" /> Hal yang Dihindari (Don&apos;ts)
                                                </span>
                                                <ul className="space-y-1 text-[var(--md-sys-color-on-surface-variant)] list-disc list-inside">
                                                    {pillar.donts.map((item, idx) => (
                                                        <li key={idx} className="leading-relaxed">
                                                            {item}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    )}

                    {/* TAB 3: DIREKTORI TEMPLATE DESAIN */}
                    {activeTab === 'designs' && (
                        <motion.div
                            key="tab-designs"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.16, ease: MD3_EASING.decelerate }}
                            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
                        >
                            {DESIGN_TEMPLATES.map((template) => (
                                <div
                                    key={template.id}
                                    className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-3xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] overflow-hidden hover:border-[var(--md-sys-color-primary)]/60 hover:shadow-[var(--md-elevation-2)] hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between"
                                >
                                    <div>
                                        <div className="aspect-video relative bg-[var(--md-sys-color-surface-container-high)] overflow-hidden">
                                            <img
                                                src={template.thumbnailUrl}
                                                alt={template.title}
                                                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                                            />
                                            <span className="absolute bottom-2.5 left-2.5 bg-black/75 backdrop-blur-xs text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg">
                                                {template.dimension}
                                            </span>
                                        </div>

                                        <div className="p-5 space-y-2">
                                            <h4 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] line-clamp-2">
                                                {template.title}
                                            </h4>
                                            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed line-clamp-2">
                                                {template.description}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="p-5 pt-0">
                                        <a
                                            href={template.externalUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="w-full block"
                                        >
                                            <Button variant="primary" size="sm" className="w-full">
                                                Buka Template <ExternalLink className="w-3.5 h-3.5" />
                                            </Button>
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </AppLayout>
    );
}
