import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'success';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    isLoading?: boolean;
    icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            className,
            variant = 'primary',
            size = 'md',
            isLoading = false,
            icon,
            children,
            disabled,
            onClick,
            ...props
        },
        ref
    ) => {
        const isDisabled = Boolean(disabled || isLoading);

        const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
            primary:
                'bg-[var(--md-sys-color-primary-filled)] text-[var(--md-sys-color-on-primary)] hover:bg-[var(--md-sys-color-primary-hover)] shadow-[var(--md-elevation-1)] hover:shadow-[var(--md-elevation-2)]',
            secondary:
                'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)]/60',
            outline:
                'border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container-low)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)] hover:border-[var(--md-sys-color-outline)]',
            danger:
                'bg-[#D61F45] dark:bg-rose-600 text-white hover:bg-[#B81839] dark:hover:bg-rose-500 shadow-[var(--md-elevation-1)] hover:shadow-[var(--md-elevation-2)]',
            ghost:
                'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]',
            success:
                'bg-[#009965] dark:bg-emerald-600 text-white hover:bg-[#007F54] dark:hover:bg-emerald-500 shadow-[var(--md-elevation-1)] hover:shadow-[var(--md-elevation-2)]',
        };

        const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
            sm: 'h-8 px-3 text-xs rounded-xl gap-1.5 font-semibold',
            md: 'h-9 px-3.5 text-xs rounded-xl gap-2 font-semibold',
            lg: 'h-11 px-5 text-sm rounded-2xl gap-2.5 font-bold',
            icon: 'h-9 w-9 p-0 rounded-xl justify-center',
        };

        const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
            if (isDisabled) {
                e.preventDefault();
                return;
            }
            onClick?.(e);
        };

        return (
            <button
                ref={ref}
                disabled={isDisabled}
                aria-busy={isLoading || undefined}
                onClick={handleClick}
                className={cn(
                    'md-btn-tactile inline-flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed select-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-sys-color-surface)]',
                    variantStyles[variant],
                    sizeStyles[size],
                    className
                )}
                {...props}
            >
                {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-current" />
                ) : icon ? (
                    <span className="shrink-0 inline-flex items-center">{icon}</span>
                ) : null}
                {children}
            </button>
        );
    }
);

Button.displayName = 'Button';
