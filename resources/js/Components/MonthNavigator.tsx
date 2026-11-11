import React from 'react';
import { Link, router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, Images } from 'lucide-react';

interface MonthNavigatorProps {
    month: string;
    currentMonth: string;
    basePath: '/content' | '/planner';
    extraQuery?: Record<string, string>;
    carryOverCount: number;
}

export function shiftMonth(month: string, delta: number): string {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));

    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(month: string): string {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) {
        return month;
    }

    return new Intl.DateTimeFormat('id-ID', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function MonthNavigator({
    month,
    currentMonth,
    basePath,
    extraQuery,
    carryOverCount,
}: MonthNavigatorProps): React.JSX.Element {
    const goToMonth = (target: string) => {
        router.get(
            basePath,
            { ...(extraQuery ?? {}), month: target },
            { preserveState: true, preserveScroll: true }
        );
    };

    const isCurrentMonth = month === currentMonth;

    return (
        <div className="bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] p-3 flex flex-wrap items-center justify-between gap-3 shadow-[var(--md-elevation-1)]">
            <div className="flex flex-wrap items-center gap-2.5">
                <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-0.5">
                    <button
                        type="button"
                        aria-label="Bulan sebelumnya"
                        onClick={() => goToMonth(shiftMonth(month, -1))}
                        className="p-1.5 rounded-lg text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface)] hover:text-[var(--md-sys-color-on-surface)] transition-colors cursor-pointer"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-2.5 text-xs font-extrabold text-[var(--md-sys-color-on-surface)] min-w-[130px] text-center capitalize">
                        {formatMonthLabel(month)}
                    </span>
                    <button
                        type="button"
                        aria-label="Bulan berikutnya"
                        onClick={() => goToMonth(shiftMonth(month, 1))}
                        className="p-1.5 rounded-lg text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface)] hover:text-[var(--md-sys-color-on-surface)] transition-colors cursor-pointer"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                {!isCurrentMonth && (
                    <button
                        type="button"
                        onClick={() => goToMonth(currentMonth)}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] hover:opacity-90 transition-opacity cursor-pointer"
                    >
                        Bulan Ini
                    </button>
                )}

                {carryOverCount > 0 && (
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/15 px-2.5 py-1 rounded-lg">
                        {carryOverCount} konten belum terbit dari bulan lalu
                    </span>
                )}
            </div>

            <Link
                href="/instagram/library"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--md-sys-color-primary)] hover:underline"
            >
                <Images className="w-3.5 h-3.5" />
                Semua Konten Instagram &amp; Statistik →
            </Link>
        </div>
    );
}
