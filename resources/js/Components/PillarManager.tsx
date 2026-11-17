import React, { useState } from 'react';
import { router } from '@inertiajs/react';
import { Check, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
import { PillarTag, usePillars } from '@/Components/UI/Semantics';
import { Select } from '@/Components/UI/Select';
import { useToast } from '@/Components/UI/Toast';

const ACCENT_SWATCH: Record<string, string> = {
    blue: 'bg-blue-500',
    indigo: 'bg-indigo-500',
    violet: 'bg-violet-500',
    emerald: 'bg-emerald-500',
    teal: 'bg-teal-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    slate: 'bg-slate-500',
};

/** Pilar yang sudah dinonaktifkan tetapi masih dipakai konten lama, agar label tetap terbaca saat diedit. */
interface InactivePillar {
    id: number;
    key: string;
    label: string;
    accent: string;
}

interface PillarManagerProps {
    inactivePillars: InactivePillar[];
}

export function PillarManager({ inactivePillars }: PillarManagerProps) {
    const { success, error: toastError } = useToast();
    const pillars = usePillars();
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editLabel, setEditLabel] = useState('');
    const [editAccent, setEditAccent] = useState('slate');
    const [newLabel, setNewLabel] = useState('');
    const [newAccent, setNewAccent] = useState('blue');

    const submit = (
        key: string,
        method: 'post' | 'patch' | 'delete',
        url: string,
        payload: Record<string, string | number | boolean>,
        onDone?: () => void
    ) => {
        setBusyKey(key);
        router[method](url, payload, {
            preserveScroll: true,
            onSuccess: () => {
                success(method === 'post' ? 'Pilar Ditambahkan' : method === 'patch' ? 'Pilar Diperbarui' : 'Pilar Dihapus');
                onDone?.();
            },
            onError: (errors) => toastError('Gagal Menyimpan Pilar', Object.values(errors)[0]),
            onFinish: () => setBusyKey(null),
        });
    };

    const startEdit = (id: number, label: string, accent: string) => {
        setEditingId(id);
        setEditLabel(label);
        setEditAccent(accent);
    };

    return (
        <div className="space-y-3">
            <div className="space-y-2">
                {pillars.map((pillar) => (
                    <div key={pillar.id} className="flex items-center gap-2">
                        {editingId === pillar.id ? (
                            <>
                                <Input
                                    aria-label={`Nama pilar ${pillar.key}`}
                                    value={editLabel}
                                    onChange={(e) => setEditLabel(e.target.value)}
                                    className="h-8 text-xs"
                                />
                                <Select
                                    aria-label={`Warna pilar ${pillar.key}`}
                                    value={editAccent}
                                    onChange={(e) => setEditAccent(e.target.value)}
                                    className="w-28 h-8"
                                >
                                    {Object.keys(ACCENT_SWATCH).map((accent) => (
                                        <option key={accent} value={accent}>
                                            {accent}
                                        </option>
                                    ))}
                                </Select>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    icon={<Check className="w-3.5 h-3.5" />}
                                    isLoading={busyKey === pillar.key}
                                    onClick={() =>
                                        submit(
                                            pillar.key,
                                            'patch',
                                            `/settings/pilars/${pillar.id}`,
                                            { label: editLabel, accent: editAccent, is_active: true },
                                            () => setEditingId(null)
                                        )
                                    }
                                />
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    icon={<X className="w-3.5 h-3.5" />}
                                    onClick={() => setEditingId(null)}
                                />
                            </>
                        ) : (
                            <>
                                <PillarTag pillar={pillar.key} />
                                <span className="text-[11px] font-mono text-[var(--md-sys-color-on-surface-muted)]">
                                    {pillar.key}
                                </span>
                                <span className="flex-1" />
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    aria-label={`Ubah pilar ${pillar.label}`}
                                    onClick={() => startEdit(pillar.id, pillar.label, pillar.accent)}
                                >
                                    Ubah
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    aria-label={`Nonaktifkan pilar ${pillar.label}`}
                                    icon={<EyeOff className="w-3.5 h-3.5" />}
                                    isLoading={busyKey === pillar.key}
                                    onClick={() =>
                                        submit(pillar.key, 'patch', `/settings/pilars/${pillar.id}`, {
                                            label: pillar.label,
                                            accent: pillar.accent,
                                            is_active: false,
                                        })
                                    }
                                />
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    aria-label={`Hapus pilar ${pillar.label}`}
                                    icon={<Trash2 className="w-3.5 h-3.5" />}
                                    isLoading={busyKey === pillar.key}
                                    onClick={() => {
                                        if (!confirm(`Hapus pilar "${pillar.label}"? Pilar yang masih dipakai konten akan ditolak.`)) {
                                            return;
                                        }
                                        submit(pillar.key, 'delete', `/settings/pilars/${pillar.id}`, {});
                                    }}
                                />
                            </>
                        )}
                    </div>
                ))}
            </div>

            {inactivePillars.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                    <span className="sparc-eyebrow block">Dinonaktifkan</span>
                    {inactivePillars.map((pillar) => (
                        <div key={pillar.id} className="flex items-center gap-2">
                            <PillarTag pillar={pillar.key} className="opacity-60" />
                            <span className="text-[11px] font-mono text-[var(--md-sys-color-on-surface-muted)]">
                                {pillar.key}
                            </span>
                            <span className="flex-1" />
                            <Button
                                size="sm"
                                variant="ghost"
                                icon={<Eye className="w-3.5 h-3.5" />}
                                isLoading={busyKey === pillar.key}
                                onClick={() =>
                                    submit(pillar.key, 'patch', `/settings/pilars/${pillar.id}`, {
                                        label: pillar.label,
                                        accent: 'slate',
                                        is_active: true,
                                    })
                                }
                            >
                                Aktifkan
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                <Input
                    aria-label="Nama pilar baru"
                    placeholder="Nama pilar baru"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    className="h-8 text-xs"
                />
                <Select
                    aria-label="Warna pilar baru"
                    value={newAccent}
                    onChange={(e) => setNewAccent(e.target.value)}
                    className="w-28 h-8"
                >
                    {Object.keys(ACCENT_SWATCH).map((accent) => (
                        <option key={accent} value={accent}>
                            {accent}
                        </option>
                    ))}
                </Select>
                <Button
                    size="sm"
                    icon={<Plus className="w-3.5 h-3.5" />}
                    isLoading={busyKey === 'new'}
                    disabled={newLabel.trim() === ''}
                    onClick={() =>
                        submit(
                            'new',
                            'post',
                            '/settings/pilars',
                            { label: newLabel.trim(), accent: newAccent },
                            () => setNewLabel('')
                        )
                    }
                >
                    Tambah
                </Button>
            </div>
        </div>
    );
}
