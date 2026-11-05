import React, { useMemo, useState } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    Copy,
    ExternalLink,
    FileImage,
    FileText,
    Film,
    FolderOpen,
    LayoutTemplate,
    Plus,
    RotateCcw,
    Search,
    Tag,
    Trash2,
} from 'lucide-react';
import { AppLayout, type SharedWorkspaceProps } from '@/Layouts/AppLayout';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
import { Modal } from '@/Components/UI/Modal';
import { Select } from '@/Components/UI/Select';
import { ContentIdBadge } from '@/Components/UI/Semantics';
import { Sheet } from '@/Components/UI/Sheet';
import { useToast } from '@/Components/UI/Toast';
import { copyToClipboard } from '@/lib/utils';
import type { SparcContentItem, SparcVisualAsset } from '@/types/sparc';

interface AssetsPageProps {
    assets?: SparcVisualAsset[];
    contentItems?: SparcContentItem[];
}

const ASSET_CATEGORIES: Array<{
    key: 'all' | SparcVisualAsset['category'];
    label: string;
}> = [
    { key: 'all', label: 'Semua Kategori' },
    { key: 'foto', label: 'Foto Liputan' },
    { key: 'video', label: 'Footage Video' },
    { key: 'infografis', label: 'Infografis' },
    { key: 'template_desain', label: 'Template Desain' },
    { key: 'ilustrasi', label: 'Ilustrasi' },
    { key: 'dokumen', label: 'Dokumen' },
];

function categoryLabel(cat: SparcVisualAsset['category']): string {
    return ASSET_CATEGORIES.find((c) => c.key === cat)?.label ?? cat;
}

export default function AssetsIndex({ assets = [], contentItems = [] }: AssetsPageProps) {
    const { props } = usePage<SharedWorkspaceProps>();
    const can = props.auth?.can;
    const { success: toastSuccess, error: toastError } = useToast();

    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] =
        useState<'all' | SparcVisualAsset['category']>('all');

    const [selectedAsset, setSelectedAsset] = useState<SparcVisualAsset | null>(null);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const filteredAssets = useMemo(() => {
        return assets.filter((asset) => {
            if (categoryFilter !== 'all' && asset.category !== categoryFilter) {
                return false;
            }
            if (searchQuery.trim() !== '') {
                const q = searchQuery.toLowerCase();
                const inTitle = asset.title.toLowerCase().includes(q);
                const inTags = asset.tags.some((t) => t.toLowerCase().includes(q));
                const inContent = asset.contentId?.toLowerCase().includes(q) ?? false;
                if (!inTitle && !inTags && !inContent) {
                    return false;
                }
            }
            return true;
        });
    }, [assets, categoryFilter, searchQuery]);

    const createForm = useForm({
        title: '',
        category: 'infografis' as SparcVisualAsset['category'],
        external_url: '',
        tags: 'humas, resmi, 2026',
        content_id: '',
    });

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createForm.post('/assets', {
            preserveScroll: true,
            onSuccess: () => {
                setCreateModalOpen(false);
                createForm.reset();
            },
            onError: () => {
                toastError(
                    'Validasi Aset Visual Gagal',
                    'Pastikan judul dan URL sumber aset (https://...) telah diisi.'
                );
            },
        });
    };

    const handleCopyLink = async (url: string) => {
        const ok = await copyToClipboard(url);
        if (ok) {
            toastSuccess('Tautan Aset Disalin', 'URL sumber aset siap ditempelkan ke brief produksi.');
        }
    };

    const handleConfirmDelete = () => {
        if (!selectedAsset) {
            return;
        }
        setIsDeleting(true);
        router.delete(`/assets/${selectedAsset.id}`, {
            preserveScroll: true,
            onSuccess: () => {
                setIsDeleting(false);
                setDeleteModalOpen(false);
                setSelectedAsset(null);
            },
            onError: () => {
                setIsDeleting(false);
                toastError('Gagal Menghapus Aset', 'Peran Anda tidak memiliki izin kelola aset.');
            },
        });
    };

    const renderCategoryIcon = (cat: SparcVisualAsset['category']) => {
        if (cat === 'video') {
            return <Film className="w-3.5 h-3.5" />;
        }
        if (cat === 'template_desain') {
            return <LayoutTemplate className="w-3.5 h-3.5" />;
        }
        if (cat === 'dokumen') {
            return <FileText className="w-3.5 h-3.5" />;
        }
        return <FileImage className="w-3.5 h-3.5" />;
    };

    return (
        <AppLayout
            title="Visual Assets"
            subtitle="Katalog terpusat dokumentasi foto, footage video, template desain, dan infografis resmi HUMAS"
            actions={
                can?.manageAssets ? (
                    <Button
                        variant="primary"
                        size="sm"
                        icon={<Plus className="w-3.5 h-3.5" />}
                        onClick={() => {
                            createForm.clearErrors();
                            setCreateModalOpen(true);
                        }}
                    >
                        Tambah Aset Visual
                    </Button>
                ) : undefined
            }
        >
            <Head title="Visual Assets - SPARC" />

            <div className="space-y-5">
                {/* Search & Category Filter */}
                <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-3.5 rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="relative flex-1 max-w-md">
                            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--md-sys-color-on-surface-muted)] pointer-events-none" />
                            <input
                                type="search"
                                aria-label="Cari judul aset, tag, atau kode SPARC"
                                placeholder="Cari judul aset, kata kunci tag, atau SPARC-2026-XXXX..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-9 pl-9 pr-3 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 text-[var(--md-sys-color-on-surface)]"
                            />
                        </div>

                        <div className="flex items-center gap-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                            <span>
                                Menampilkan{' '}
                                <strong className="sparc-code-id text-[var(--md-sys-color-on-surface)]">
                                    {filteredAssets.length}
                                </strong>{' '}
                                dari {assets.length} aset
                            </span>
                            {(searchQuery !== '' || categoryFilter !== 'all') && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    icon={<RotateCcw className="w-3.5 h-3.5" />}
                                    onClick={() => {
                                        setSearchQuery('');
                                        setCategoryFilter('all');
                                    }}
                                >
                                    Reset
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[var(--md-sys-color-outline-variant)]/60">
                        {ASSET_CATEGORIES.map((cat) => {
                            const active = categoryFilter === cat.key;
                            return (
                                <button
                                    key={cat.key}
                                    type="button"
                                    onClick={() => setCategoryFilter(cat.key)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                        active
                                            ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border-[var(--md-sys-color-primary)]/40'
                                            : 'bg-[var(--md-sys-color-surface-container-low)] text-[var(--md-sys-color-on-surface-variant)] border-[var(--md-sys-color-outline-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                                    }`}
                                >
                                    {cat.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Asset Grid */}
                {filteredAssets.length === 0 ? (
                    <div className="p-12 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] text-center space-y-2">
                        <FolderOpen className="w-9 h-9 text-[var(--md-sys-color-on-surface-muted)] mx-auto" />
                        <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                            Tidak ada aset visual yang cocok
                        </p>
                        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                            Coba kata kunci lain atau pilih kategori Semua Kategori.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredAssets.map((asset) => (
                            <div
                                key={asset.id}
                                onClick={() => setSelectedAsset(asset)}
                                className="group bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] hover:shadow-[var(--md-elevation-2)] hover:border-[var(--md-sys-color-primary)]/50 overflow-hidden flex flex-col cursor-pointer transition-all"
                            >
                                <div className="relative aspect-[16/10] bg-[var(--md-sys-color-surface-container-low)] overflow-hidden">
                                    <img
                                        src={asset.thumbnailUrl}
                                        alt={asset.title}
                                        loading="lazy"
                                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                                    />
                                    <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--md-sys-color-surface)]/90 dark:bg-[var(--md-sys-color-surface-container-highest)]/90 text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] backdrop-blur-xs">
                                        {renderCategoryIcon(asset.category)}
                                        {categoryLabel(asset.category)}
                                    </span>
                                </div>

                                <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2.5">
                                    <div className="space-y-1.5">
                                        {asset.contentId && (
                                            <ContentIdBadge contentId={asset.contentId} />
                                        )}
                                        <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)] transition-colors line-clamp-2">
                                            {asset.title}
                                        </h3>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-1">
                                            {asset.tags.slice(0, 3).map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[var(--md-sys-color-surface-container-low)] text-[10px] text-[var(--md-sys-color-on-surface-muted)]"
                                                >
                                                    #{tag}
                                                </span>
                                            ))}
                                        </div>

                                        <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)]/60 flex items-center justify-between text-[10px] text-[var(--md-sys-color-on-surface-muted)]">
                                            <span>{asset.uploadedBy}</span>
                                            <span className="sparc-code-id">{asset.createdAt}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Asset Detail Sheet */}
            <Sheet
                isOpen={Boolean(selectedAsset)}
                onClose={() => setSelectedAsset(null)}
                title={selectedAsset?.title || 'Detail Aset Visual'}
                description={selectedAsset ? categoryLabel(selectedAsset.category) : ''}
                width="md"
            >
                {selectedAsset && (
                    <div className="space-y-4">
                        <div className="rounded-2xl overflow-hidden border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] aspect-[16/10]">
                            <img
                                src={selectedAsset.thumbnailUrl}
                                alt={selectedAsset.title}
                                className="w-full h-full object-cover"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]">
                                <span className="sparc-eyebrow block">Pengunggah</span>
                                <p className="font-bold text-[var(--md-sys-color-on-surface)] mt-1">
                                    {selectedAsset.uploadedBy}
                                </p>
                            </div>
                            <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]">
                                <span className="sparc-eyebrow block">Dimensi / Format</span>
                                <p className="sparc-code-id font-bold text-[var(--md-sys-color-on-surface)] mt-1">
                                    {selectedAsset.dimensions || 'Resolusi Tinggi'}
                                </p>
                            </div>
                        </div>

                        {selectedAsset.contentId && (
                            <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] flex items-center justify-between text-xs">
                                <span className="text-[var(--md-sys-color-on-surface-variant)]">
                                    Tertaut ke Konten:
                                </span>
                                <ContentIdBadge contentId={selectedAsset.contentId} />
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-[var(--md-sys-color-on-surface-muted)]" />
                            {selectedAsset.tags.map((t) => (
                                <span
                                    key={t}
                                    className="px-2 py-0.5 rounded-md bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface-variant)]"
                                >
                                    #{t}
                                </span>
                            ))}
                        </div>

                        <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    icon={<Copy className="w-3.5 h-3.5" />}
                                    onClick={() => handleCopyLink(selectedAsset.externalUrl)}
                                >
                                    Salin Link
                                </Button>
                                {can?.manageAssets && (
                                    <Button
                                        type="button"
                                        variant="danger"
                                        size="sm"
                                        icon={<Trash2 className="w-3.5 h-3.5" />}
                                        onClick={() => setDeleteModalOpen(true)}
                                    >
                                        Hapus
                                    </Button>
                                )}
                            </div>

                            <a
                                href={selectedAsset.externalUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] text-xs font-bold hover:brightness-105 transition"
                            >
                                Buka Sumber Aset <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                        </div>
                    </div>
                )}
            </Sheet>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                title="Hapus Aset Visual?"
                description={`"${selectedAsset?.title ?? ''}" akan dipindahkan ke Trash & Recovery.`}
                maxWidth="sm"
            >
                <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={isDeleting}
                        onClick={() => setDeleteModalOpen(false)}
                    >
                        Batal
                    </Button>
                    <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        isLoading={isDeleting}
                        onClick={handleConfirmDelete}
                    >
                        Ya, Pindahkan ke Trash
                    </Button>
                </div>
            </Modal>

            {/* Add Asset Modal (`POST /assets`) */}
            <Modal
                isOpen={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
                title="Tambah Aset Visual ke Katalog"
                description="Daftarkan tautan master aset (Drive, Figma, Canva, atau Storage Humas)"
                maxWidth="md"
            >
                <form onSubmit={handleCreateSubmit} className="space-y-4" noValidate>
                    <Input
                        label="Judul Aset Visual"
                        required
                        placeholder="Contoh: Master Key Visual Hari Keterbukaan Informasi 2026"
                        value={createForm.data.title}
                        onChange={(e) => createForm.setData('title', e.target.value)}
                        error={createForm.errors.title}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Select
                            label="Kategori Aset"
                            value={createForm.data.category}
                            onChange={(e) =>
                                createForm.setData(
                                    'category',
                                    e.target.value as SparcVisualAsset['category']
                                )
                            }
                        >
                            <option value="foto">Foto Liputan</option>
                            <option value="video">Footage Video</option>
                            <option value="infografis">Infografis</option>
                            <option value="template_desain">Template Desain</option>
                            <option value="ilustrasi">Ilustrasi</option>
                            <option value="dokumen">Dokumen</option>
                        </Select>

                        <Select
                            label="Tautkan ke Kode Konten (Opsional)"
                            value={createForm.data.content_id}
                            onChange={(e) => createForm.setData('content_id', e.target.value)}
                        >
                            <option value="">— Aset Umum —</option>
                            {contentItems.map((item) => (
                                <option key={item.id} value={item.contentId}>
                                    {item.contentId} — {item.title}
                                </option>
                            ))}
                        </Select>
                    </div>

                    <Input
                        type="url"
                        label="URL Sumber Master Aset"
                        required
                        placeholder="https://drive.google.com/... atau https://figma.com/..."
                        value={createForm.data.external_url}
                        onChange={(e) => createForm.setData('external_url', e.target.value)}
                        error={createForm.errors.external_url}
                    />

                    <Input
                        label="Kata Kunci Tag (Pisahkan dengan koma)"
                        placeholder="liputan, pimpinan, infografis"
                        value={createForm.data.tags}
                        onChange={(e) => createForm.setData('tags', e.target.value)}
                    />

                    <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            disabled={createForm.processing}
                            onClick={() => setCreateModalOpen(false)}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            isLoading={createForm.processing}
                        >
                            Simpan Aset
                        </Button>
                    </div>
                </form>
            </Modal>
        </AppLayout>
    );
}
