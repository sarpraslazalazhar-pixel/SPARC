import React, { useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MD3_EASING } from '@/lib/motion';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    error?: string;
    helperText?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
    ({ className, label, error, helperText, id, required, children, ...props }, ref) => {
        const generatedId = useId();
        const selectId =
            id || (label ? `select-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${generatedId}` : generatedId);
        const descriptionId = `${selectId}-desc`;

        return (
            <div className="w-full space-y-1.5">
                {label && (
                    <label
                        htmlFor={selectId}
                        className={cn(
                            'block text-xs font-bold transition-colors',
                            error
                                ? 'text-[var(--md-sys-color-error)]'
                                : 'text-[var(--md-sys-color-on-surface)]'
                        )}
                    >
                        {label}
                        {required && <span className="text-[var(--md-sys-color-error)] ml-0.5">*</span>}
                    </label>
                )}
                <select
                    id={selectId}
                    ref={ref}
                    required={required}
                    aria-invalid={Boolean(error) || undefined}
                    aria-describedby={error || helperText ? descriptionId : undefined}
                    className={cn(
                        'w-full h-9 rounded-xl border px-3 text-xs font-medium cursor-pointer transition-all duration-150',
                        'bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)]',
                        'text-[var(--md-sys-color-on-surface)]',
                        'focus:outline-none focus:ring-2',
                        error
                            ? 'border-[var(--md-sys-color-error)] focus:ring-[var(--md-sys-color-error)]/30 focus:border-[var(--md-sys-color-error)]'
                            : 'border-[var(--md-sys-color-outline-variant)] hover:border-[var(--md-sys-color-outline)] focus:ring-[var(--md-sys-color-primary)]/25 focus:border-[var(--md-sys-color-primary)]',
                        className
                    )}
                    {...props}
                >
                    {children}
                </select>

                <AnimatePresence mode="wait" initial={false}>
                    {error ? (
                        <motion.p
                            key="error"
                            id={descriptionId}
                            role="alert"
                            initial={{ opacity: 0, y: -3 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -2 }}
                            transition={{ duration: 0.14, ease: MD3_EASING.decelerate }}
                            className="flex items-center gap-1 text-[11px] font-medium text-[var(--md-sys-color-error)]"
                        >
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span>{error}</span>
                        </motion.p>
                    ) : helperText ? (
                        <motion.p
                            key="helper"
                            id={descriptionId}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.12 }}
                            className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]"
                        >
                            {helperText}
                        </motion.p>
                    ) : null}
                </AnimatePresence>
            </div>
        );
    }
);

Select.displayName = 'Select';
