import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'purple' | 'slate';
}

export const Badge: React.FC<BadgeProps> = ({
    className,
    variant = 'default',
    children,
    ...props
}) => {
    const variantStyles: Record<NonNullable<BadgeProps['variant']>, string> = {
        default:
            'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] border-[var(--md-sys-color-outline-variant)]',
        primary:
            'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border-blue-200/80 dark:border-blue-800/70 font-semibold',
        success:
            'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] border-emerald-200/80 dark:border-emerald-800/70 font-semibold',
        warning:
            'bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] border-amber-200/80 dark:border-amber-800/70 font-semibold',
        danger:
            'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] border-rose-200/80 dark:border-rose-800/70 font-semibold',
        purple:
            'bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-200 border-purple-200 dark:border-purple-800/70 font-semibold',
        slate:
            'bg-slate-800 dark:bg-slate-700 text-slate-100 border-slate-700 dark:border-slate-600',
    };

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-colors select-none',
                variantStyles[variant],
                className
            )}
            {...props}
        >
            {children}
        </span>
    );
};
