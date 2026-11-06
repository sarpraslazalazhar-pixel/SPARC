import React, { useRef, useState } from 'react';
import { router, useForm } from '@inertiajs/react';
import { motion } from 'framer-motion';
import {
    Camera,
    CheckCircle2,
    Eye,
    EyeOff,
    KeyRound,
    Loader2,
    Lock,
    Phone,
    RotateCcw,
    Shield,
    User,
} from 'lucide-react';
import { Modal } from '@/Components/UI/Modal';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
import { RoleBadge, type UserRoleKey } from '@/Components/UI/Semantics';
import { useToast } from '@/Components/UI/Toast';
import { cn } from '@/lib/utils';

export interface ProfileModalUser {
    id: string | number;
    name: string;
    email: string;
    role: string;
    roleLabel?: string;
    no_wa?: string | null;
    avatar?: string | null;
    notify_browser?: boolean;
    notify_inapp?: boolean;
    notify_sound?: boolean;
    [key: string]: unknown;
}

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: ProfileModalUser;
}

export function ProfileModal({ isOpen, onClose, user }: ProfileModalProps) {
    const { success: toastSuccess, error: toastError } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const { data, setData, patch, processing, errors, reset } = useForm({
        name: user?.name || '',
        email: user?.email || '',
        no_wa: (user?.no_wa as string) || '',
        password: '',
        password_confirmation: '',
    });

    React.useEffect(() => {
        if (user && isOpen) {
            setData({
                name: user.name || '',
                email: user.email || '',
                no_wa: (user.no_wa as string) || '',
                password: '',
                password_confirmation: '',
            });
        }
    }, [user, isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        patch('/profile', {
            preserveScroll: true,
            onSuccess: () => {
                onClose();
            },
            onError: () => {
                toastError('Pembaruan Gagal', 'Mohon periksa kembali kolom isian.');
            },
        });
    };

    const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            toastError('Ukuran Terlalu Besar', 'Maksimal ukuran foto adalah 5 MB.');
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        setUploadingAvatar(true);
        router.post(
            '/profile/avatar',
            {
                avatar_file: file,
                action: 'upload',
            },
            {
                forceFormData: true,
                preserveScroll: true,
                onSuccess: () => {
                    if (fileInputRef.current) fileInputRef.current.value = '';
                },
                onError: () => {
                    toastError('Unggah Gagal', 'Format foto harus berupa JPG, PNG, atau WebP.');
                },
                onFinish: () => setUploadingAvatar(false),
            }
        );
    };

    const handleResetAvatar = () => {
        setUploadingAvatar(true);
        router.post(
            '/profile/avatar',
            { action: 'remove' },
            {
                preserveScroll: true,
                onFinish: () => setUploadingAvatar(false),
            }
        );
    };

    const avatarUrl = user?.avatar || (user?.name
        ? `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=1546D8&color=fff&size=128&bold=true`
        : null);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Edit Profil & Pengaturan Akun"
            description="Perbarui informasi akun, foto avatar, dan preferensi notifikasi SPARC"
            maxWidth="md"
        >
            <div className="space-y-4 max-h-[80vh] overflow-y-auto px-1 pr-2">
                {/* 1. HaloAPU-Style Circular Avatar with Camera Button Overlay */}
                <div className="flex flex-col items-center gap-2.5 py-2">
                    <div className="relative group">
                        <div className="w-24 h-24 rounded-full border-2 border-[var(--md-sys-color-primary)]/20 overflow-hidden bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-center shadow-[var(--md-elevation-1)]">
                            {avatarUrl ? (
                                <img
                                    src={avatarUrl}
                                    alt={user?.name || 'Avatar'}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <User className="h-12 w-12 text-[var(--md-sys-color-on-surface-muted)]" />
                            )}
                        </div>

                        <motion.button
                            type="button"
                            whileHover={{ scale: 1.15 }}
                            whileTap={{ scale: 0.9 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                            onClick={() => fileInputRef.current?.click()}
                            className="absolute bottom-0 right-0 p-2 rounded-full bg-[var(--md-sys-color-primary-filled)] text-white shadow-md hover:brightness-110 transition-all cursor-pointer"
                            disabled={uploadingAvatar}
                            title="Ganti Foto Profil"
                            aria-label="Ganti Foto Profil"
                        >
                            {uploadingAvatar ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Camera className="h-4 w-4" />
                            )}
                        </motion.button>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpg,image/jpeg,image/webp"
                            className="hidden"
                            onChange={handleAvatarSelect}
                        />
                    </div>

                    <div className="flex items-center gap-2 text-center">
                        <p className="text-xs text-[var(--md-sys-color-on-surface-muted)]">
                            Klik ikon kamera untuk ganti foto
                        </p>
                        {user?.avatar && (
                            <button
                                type="button"
                                onClick={handleResetAvatar}
                                className="text-xs text-red-500 hover:underline cursor-pointer font-medium"
                            >
                                • Hapus Foto
                            </button>
                        )}
                    </div>
                </div>

                {/* Form Input */}
                <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
                    <Input
                        label="Nama Lengkap"
                        required
                        value={data.name}
                        onChange={(e) => setData('name', e.target.value)}
                        error={errors.name}
                        placeholder="Contoh: Aldwin NV"
                    />

                    <Input
                        type="email"
                        label="Email Kedinasan"
                        required
                        value={data.email}
                        onChange={(e) => setData('email', e.target.value)}
                        error={errors.email}
                        placeholder="nama@humas.instansi.go.id"
                    />

                    <Input
                        label="Nomor WhatsApp"
                        value={data.no_wa}
                        onChange={(e) => setData('no_wa', e.target.value)}
                        error={errors.no_wa}
                        placeholder="08123456789 (untuk koordinasi cepat)"
                    />

                    {/* Peran Sistem Badge */}
                    <div className="p-3 rounded-2xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] flex items-center justify-between text-xs">
                        <span className="text-[var(--md-sys-color-on-surface-muted)] font-medium">Peran Sistem:</span>
                        <RoleBadge role={(user?.role as UserRoleKey) || 'creator'} />
                    </div>

                    {/* Ubah Password (Opsional) */}
                    <div className="border-t border-[var(--md-sys-color-outline-variant)] pt-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)] flex items-center gap-1.5">
                                <KeyRound className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" />
                                Ubah Kata Sandi <span className="text-[10px] text-[var(--md-sys-color-on-surface-muted)] font-normal">(opsional)</span>
                            </span>
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="text-[11px] text-[var(--md-sys-color-primary)] hover:underline flex items-center gap-1 cursor-pointer"
                            >
                                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                {showPassword ? 'Sembunyikan' : 'Tampilkan'}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Input
                                label="Password Baru"
                                type={showPassword ? 'text' : 'password'}
                                value={data.password}
                                onChange={(e) => setData('password', e.target.value)}
                                error={errors.password}
                                placeholder="Kosongkan jika tidak diubah"
                                autoComplete="new-password"
                            />
                            <Input
                                label="Konfirmasi Password"
                                type={showPassword ? 'text' : 'password'}
                                value={data.password_confirmation}
                                onChange={(e) => setData('password_confirmation', e.target.value)}
                                error={errors.password_confirmation}
                                placeholder="Ulangi password baru"
                                autoComplete="new-password"
                            />
                        </div>
                    </div>


                    <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2">
                        <Button type="button" variant="secondary" size="md" onClick={onClose} disabled={processing}>
                            Batal
                        </Button>
                        <Button type="submit" variant="primary" size="md" isLoading={processing}>
                            Simpan Perubahan
                        </Button>
                    </div>
                </form>
            </div>
        </Modal>
    );
}
