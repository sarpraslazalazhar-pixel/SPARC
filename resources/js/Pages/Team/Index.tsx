import React, { useMemo, useState } from 'react';
import { Head, useForm, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    CheckCircle2,
    Mail,
    Search,
    Shield,
    UserPlus,
    Users,
} from 'lucide-react';
import { AppLayout, type SharedWorkspaceProps } from '@/Layouts/AppLayout';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
import { Modal } from '@/Components/UI/Modal';
import {
    ROLE_META,
    RoleBadge,
    type UserRoleKey,
} from '@/Components/UI/Semantics';
import { useToast } from '@/Components/UI/Toast';
import type { SparcContentItem, SparcTeamMember } from '@/types/sparc';

interface TeamPageProps {
    team?: SparcTeamMember[];
    contentItems?: SparcContentItem[];
}

const ROLE_KEYS: UserRoleKey[] = [
    'admin',
    'manager',
    'planner',
    'creator',
    'publisher',
    'viewer',
];

export default function TeamIndex({ team = [], contentItems = [] }: TeamPageProps) {
    const { props } = usePage<SharedWorkspaceProps>();
    const can = props.auth?.can;
    const { error: toastError } = useToast();

    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<'all' | UserRoleKey>('all');
    const [inviteModalOpen, setInviteModalOpen] = useState(false);

    const filteredTeam = useMemo(() => {
        return team.filter((member) => {
            if (roleFilter !== 'all' && !member.roles.includes(roleFilter)) {
                return false;
            }
            if (searchQuery.trim() !== '') {
                const q = searchQuery.toLowerCase();
                const inName = member.name.toLowerCase().includes(q);
                const inEmail = member.email.toLowerCase().includes(q);
                if (!inName && !inEmail) {
                    return false;
                }
            }
            return true;
        });
    }, [team, roleFilter, searchQuery]);

    const inviteForm = useForm({
        name: '',
        email: '',
        roles: ['creator'] as UserRoleKey[],
    });

    const toggleRoleSelection = (roleKey: UserRoleKey) => {
        const current = inviteForm.data.roles;
        if (current.includes(roleKey)) {
            if (current.length > 1) {
                inviteForm.setData(
                    'roles',
                    current.filter((r) => r !== roleKey)
                );
            }
        } else {
            inviteForm.setData('roles', [...current, roleKey]);
        }
    };

    const handleInviteSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        inviteForm.post('/team/invite', {
            preserveScroll: true,
            onSuccess: () => {
                setInviteModalOpen(false);
                inviteForm.reset();
            },
            onError: () => {
                toastError(
                    'Validasi Undangan Gagal',
                    'Periksa nama lengkap, format email kedinasan, dan pilihan peran.'
                );
            },
        });
    };

    const totalOverdue = useMemo(
        () => team.reduce((sum, m) => sum + m.overdueTasks, 0),
        [team]
    );

    return (
        <AppLayout
            title="Team & Integration"
            subtitle="Direktori anggota tim HUMAS, matriks otorisasi 6-peran SPARC v3, dan pemantauan kapasitas produksi mingguan"
            actions={
                can?.inviteTeam ? (
                    <Button
                        variant="primary"
                        size="sm"
                        icon={<UserPlus className="w-3.5 h-3.5" />}
                        onClick={() => {
                            inviteForm.clearErrors();
                            setInviteModalOpen(true);
                        }}
                    >
                        Undang Anggota
                    </Button>
                ) : undefined
            }
        >
            <Head title="Team & Integration - SPARC" />

            <div className="space-y-5">
                {/* Summary KPI Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                        <span className="sparc-eyebrow block">Anggota Tim Terdaftar</span>
                        <span className="sparc-code-id text-2xl font-black text-[var(--md-sys-color-on-surface)] mt-1 block">
                            {team.length} personel
                        </span>
                    </div>
                    <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                        <span className="sparc-eyebrow block">Konten Dalam Alur Aktif</span>
                        <span className="sparc-code-id text-2xl font-black text-[var(--md-sys-color-primary)] mt-1 block">
                            {contentItems.filter((c) => c.status !== 'published').length} rencana
                        </span>
                    </div>
                    <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)]">
                        <span className="sparc-eyebrow block">Beban Tugas Melewati Tenggat</span>
                        <span
                            className={`sparc-code-id text-2xl font-black mt-1 block ${
                                totalOverdue > 0
                                    ? 'text-[var(--md-sys-color-error)]'
                                    : 'text-[var(--md-sys-color-secondary)]'
                            }`}
                        >
                            {totalOverdue} tugas
                        </span>
                    </div>
                </div>

                {/* Manager/Admin Workload Capacity Overview */}
                {can?.viewTeamWorkload && (
                    <div className="p-5 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                                    Kapasitas Beban Kerja Tim Minggu Ini (Khusus Pimpinan & Admin)
                                </h3>
                                <p className="text-xs text-[var(--md-sys-color-on-surface-muted)]">
                                    Deteksi dini anggota yang membutuhkan realokasi PIC produksi
                                </p>
                            </div>
                            <Shield className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {team
                                .filter((m) => m.primaryRole !== 'viewer')
                                .map((member) => {
                                    const pct = Math.min(
                                        100,
                                        Math.round(
                                            (member.effortHours / Math.max(1, member.capacityHours)) * 100
                                        )
                                    );
                                    const overloaded = pct >= 88 || member.overdueTasks > 0;
                                    return (
                                        <div
                                            key={member.id}
                                            className="p-3.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] space-y-2.5"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <img
                                                        src={member.avatar}
                                                        alt={member.name}
                                                        className="w-7 h-7 rounded-full object-cover border border-[var(--md-sys-color-outline-variant)]"
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate">
                                                            {member.name}
                                                        </p>
                                                        <p className="text-[10px] text-[var(--md-sys-color-on-surface-muted)]">
                                                            {ROLE_META[member.primaryRole]?.label}
                                                        </p>
                                                    </div>
                                                </div>
                                                {overloaded ? (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]">
                                                        <AlertTriangle className="w-3 h-3" /> Padat
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]">
                                                        <CheckCircle2 className="w-3 h-3" /> Optimal
                                                    </span>
                                                )}
                                            </div>

                                            <div>
                                                <div className="flex items-center justify-between text-[11px] mb-1">
                                                    <span className="text-[var(--md-sys-color-on-surface-variant)]">
                                                        Estimasi {member.effortHours}j / {member.capacityHours}j
                                                    </span>
                                                    <span className="sparc-code-id font-bold text-[var(--md-sys-color-on-surface)]">
                                                        {pct}%
                                                    </span>
                                                </div>
                                                <div className="h-1.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${
                                                            overloaded
                                                                ? 'bg-[var(--md-sys-color-error)]'
                                                                : 'bg-[var(--md-sys-color-primary)]'
                                                        }`}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                )}

                {/* Search & Role Filter */}
                <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] p-3.5 rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--md-sys-color-on-surface-muted)] pointer-events-none" />
                        <input
                            type="search"
                            aria-label="Cari nama atau email anggota tim"
                            placeholder="Cari nama atau email kedinasan..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-9 pl-9 pr-3 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/25 text-[var(--md-sys-color-on-surface)]"
                        />
                    </div>

                    <select
                        aria-label="Filter berdasarkan peran RBAC"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRoleKey)}
                        className="h-9 text-xs bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 text-[var(--md-sys-color-on-surface)] font-medium cursor-pointer"
                    >
                        <option value="all">Peran: Semua Anggota</option>
                        {ROLE_KEYS.map((rk) => (
                            <option key={rk} value={rk}>
                                {ROLE_META[rk].label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Team Directory Table */}
                <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">
                                    <th className="py-3 px-4">Personel HUMAS</th>
                                    <th className="py-3 px-3">Peran RBAC</th>
                                    <th className="py-3 px-3 text-right">Tugas Aktif</th>
                                    <th className="py-3 px-3 text-right">Tenggat Minggu Ini</th>
                                    <th className="py-3 px-3 text-right">Terlambat</th>
                                    <th className="py-3 px-4 text-right">Status Sesi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]/60">
                                {filteredTeam.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-10 text-center text-[var(--md-sys-color-on-surface-muted)]">
                                            <Users className="w-7 h-7 mx-auto mb-2 opacity-60" />
                                            Tidak ada personel yang sesuai filter pencarian.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTeam.map((member) => (
                                        <tr key={member.id} className="notion-row">
                                            <td className="py-3.5 px-4">
                                                <div className="flex items-center gap-3">
                                                    <img
                                                        src={member.avatar}
                                                        alt={member.name}
                                                        className="w-8 h-8 rounded-full object-cover border border-[var(--md-sys-color-outline-variant)]"
                                                    />
                                                    <div>
                                                        <div className="font-bold text-[var(--md-sys-color-on-surface)]">
                                                            {member.name}
                                                        </div>
                                                        <div className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] flex items-center gap-1">
                                                            <Mail className="w-3 h-3" />
                                                            {member.email}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-3">
                                                <div className="flex flex-wrap gap-1">
                                                    {member.roles.map((r) => (
                                                        <RoleBadge key={r} role={r} />
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-3 text-right sparc-code-id font-bold text-[var(--md-sys-color-on-surface)]">
                                                {member.activeTasks}
                                            </td>
                                            <td className="py-3.5 px-3 text-right sparc-code-id text-[var(--md-sys-color-on-surface-variant)]">
                                                {member.dueThisWeek}
                                            </td>
                                            <td
                                                className={`py-3.5 px-3 text-right sparc-code-id font-bold ${
                                                    member.overdueTasks > 0
                                                        ? 'text-[var(--md-sys-color-error)]'
                                                        : 'text-[var(--md-sys-color-on-surface-muted)]'
                                                }`}
                                            >
                                                {member.overdueTasks}
                                            </td>
                                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]">
                                                    {member.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Invite Member Modal (`POST /team/invite`) */}
            <Modal
                isOpen={inviteModalOpen}
                onClose={() => setInviteModalOpen(false)}
                title="Undang Personel Baru ke Ruang Kerja HUMAS"
                description="Tetapkan satu atau beberapa peran sesuai tanggung jawab produksi"
                maxWidth="md"
            >
                <form onSubmit={handleInviteSubmit} className="space-y-4" noValidate>
                    <Input
                        label="Nama Lengkap"
                        required
                        placeholder="Contoh: Sinta Maharani"
                        value={inviteForm.data.name}
                        onChange={(e) => inviteForm.setData('name', e.target.value)}
                        error={inviteForm.errors.name}
                    />

                    <Input
                        type="email"
                        label="Email Kedinasan"
                        required
                        placeholder="sinta.humas@instansi.go.id"
                        value={inviteForm.data.email}
                        onChange={(e) => inviteForm.setData('email', e.target.value)}
                        error={inviteForm.errors.email}
                    />

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-[var(--md-sys-color-on-surface)] block">
                            Penugasan Peran RBAC
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {ROLE_KEYS.map((rk) => {
                                const checked = inviteForm.data.roles.includes(rk);
                                return (
                                    <button
                                        key={rk}
                                        type="button"
                                        onClick={() => toggleRoleSelection(rk)}
                                        className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                                            checked
                                                ? 'bg-[var(--md-sys-color-primary-container)]/50 border-[var(--md-sys-color-primary)]'
                                                : 'bg-[var(--md-sys-color-surface-container-low)] border-[var(--md-sys-color-outline-variant)]'
                                        }`}
                                    >
                                        <div className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                                            {ROLE_META[rk].label}
                                        </div>
                                        <div className="text-[10px] text-[var(--md-sys-color-on-surface-muted)] mt-0.5">
                                            {ROLE_META[rk].description}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            disabled={inviteForm.processing}
                            onClick={() => setInviteModalOpen(false)}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            isLoading={inviteForm.processing}
                            icon={<UserPlus className="w-3.5 h-3.5" />}
                        >
                            Kirim Undangan
                        </Button>
                    </div>
                </form>
            </Modal>
        </AppLayout>
    );
}
