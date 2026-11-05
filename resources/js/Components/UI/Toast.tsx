import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MD3_DURATION, MD3_EASING } from '@/lib/motion';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface ToastItem {
    id: string;
    type: ToastType;
    title: string;
    message?: string;
    duration?: number;
    createdAt: number;
}

export interface FlashToastPayload {
    id?: string;
    type: ToastType;
    title: string;
    message?: string;
}

export interface ToastContextValue {
    showToast: (type: ToastType, title: string, message?: string, duration?: number, customId?: string) => string;
    updateToast: (id: string, patch: Partial<Omit<ToastItem, 'id' | 'createdAt'>>) => void;
    dismiss: (id?: string) => void;
    success: (title: string, message?: string, duration?: number) => string;
    error: (title: string, message?: string, duration?: number) => string;
    warning: (title: string, message?: string, duration?: number) => string;
    info: (title: string, message?: string, duration?: number) => string;
    loading: (title: string, message?: string) => string;
}

const MAX_VISIBLE_TOASTS = 4;
const DEFAULT_DURATION_MS = 4000;

const defaultToastContext: ToastContextValue = {
    showToast: () => '',
    updateToast: () => {},
    dismiss: () => {},
    success: () => '',
    error: () => '',
    warning: () => '',
    info: () => '',
    loading: () => '',
};

const ToastContext = createContext<ToastContextValue>(defaultToastContext);

interface IndividualToastProps {
    toast: ToastItem;
    onDismiss: (id: string) => void;
}

const IndividualToastCard: React.FC<IndividualToastProps> = ({ toast, onDismiss }) => {
    const [paused, setPaused] = useState(false);
    const remainingRef = useRef<number>(
        toast.type === 'loading' ? 0 : (toast.duration ?? DEFAULT_DURATION_MS)
    );
    const startTimeRef = useRef<number>(Date.now());
    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        remainingRef.current = toast.type === 'loading' ? 0 : (toast.duration ?? DEFAULT_DURATION_MS);
    }, [toast.type, toast.duration]);

    useEffect(() => {
        if (toast.type === 'loading' || remainingRef.current <= 0) {
            return;
        }
        if (paused) {
            if (timerRef.current) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            return;
        }

        startTimeRef.current = Date.now();
        timerRef.current = window.setTimeout(() => {
            onDismiss(toast.id);
        }, remainingRef.current);

        return () => {
            if (timerRef.current) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [paused, toast.id, toast.type, toast.duration, onDismiss]);

    const handleMouseEnter = () => {
        if (toast.type === 'loading') {
            return;
        }
        const elapsed = Date.now() - startTimeRef.current;
        remainingRef.current = Math.max(600, remainingRef.current - elapsed);
        setPaused(true);
    };

    const handleMouseLeave = () => {
        if (toast.type === 'loading') {
            return;
        }
        setPaused(false);
    };

    const meta = (() => {
        switch (toast.type) {
            case 'success':
                return {
                    icon: <CheckCircle2 className="w-4 h-4 text-[#00A870] dark:text-emerald-400" />,
                    iconBg: 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-200/80 dark:border-emerald-800/70',
                    accentBar: 'bg-[#00A870] dark:bg-emerald-400',
                    border: 'border-emerald-200/90 dark:border-emerald-800/70',
                    badgeText: 'Berhasil',
                };
            case 'error':
                return {
                    icon: <AlertCircle className="w-4 h-4 text-[#D61F45] dark:text-rose-400" />,
                    iconBg: 'bg-rose-50 dark:bg-rose-950/80 border-rose-200/80 dark:border-rose-800/70',
                    accentBar: 'bg-[#D61F45] dark:bg-rose-400',
                    border: 'border-rose-200/90 dark:border-rose-800/70',
                    badgeText: 'Kesalahan',
                };
            case 'warning':
                return {
                    icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
                    iconBg: 'bg-amber-50 dark:bg-amber-950/80 border-amber-200/80 dark:border-amber-800/70',
                    accentBar: 'bg-[#F59E0B] dark:bg-amber-400',
                    border: 'border-amber-200/90 dark:border-amber-800/70',
                    badgeText: 'Perhatian',
                };
            case 'loading':
                return {
                    icon: <Loader2 className="w-4 h-4 text-[#1546D8] dark:text-blue-400 animate-spin" />,
                    iconBg: 'bg-blue-50 dark:bg-blue-950/80 border-blue-200/80 dark:border-blue-800/70',
                    accentBar: 'bg-[#1546D8] dark:bg-blue-400',
                    border: 'border-blue-200/90 dark:border-blue-800/70',
                    badgeText: 'Memproses',
                };
            case 'info':
            default:
                return {
                    icon: <Info className="w-4 h-4 text-[#1546D8] dark:text-blue-400" />,
                    iconBg: 'bg-blue-50 dark:bg-blue-950/80 border-blue-200/80 dark:border-blue-800/70',
                    accentBar: 'bg-[#1546D8] dark:bg-blue-400',
                    border: 'border-blue-200/90 dark:border-blue-800/70',
                    badgeText: 'Informasi',
                };
        }
    })();

    const isUrgent = toast.type === 'error' || toast.type === 'warning';

    return (
        <motion.div
            layout
            role={isUrgent ? 'alert' : 'status'}
            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
            aria-atomic="true"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onFocus={handleMouseEnter}
            onBlur={handleMouseLeave}
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, scale: 0.96, transition: { duration: MD3_DURATION.toastExit, ease: MD3_EASING.accelerate } }}
            transition={{
                duration: MD3_DURATION.toastEnter,
                ease: MD3_EASING.decelerate,
            }}
            className={cn(
                'pointer-events-auto relative overflow-hidden w-full rounded-2xl border px-3.5 py-3 flex items-start gap-3',
                'bg-[var(--md-sys-color-surface)]/95 dark:bg-[var(--md-sys-color-surface-container-high)]/95 backdrop-blur-md',
                'shadow-[var(--md-elevation-3)]',
                meta.border
            )}
        >
            {/* Left MD3 Semantic Accent Strip */}
            <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', meta.accentBar)} />

            {/* Status Icon Container (Non-color-only semantic cue) */}
            <div
                className={cn(
                    'mt-0.5 w-8 h-8 rounded-xl border flex items-center justify-center shrink-0',
                    meta.iconBg
                )}
            >
                {meta.icon}
                <span className="sr-only">{meta.badgeText}:</span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pr-1">
                <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] tracking-tight leading-snug">
                    {toast.title}
                </h4>
                {toast.message && (
                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed mt-0.5 break-words">
                        {toast.message}
                    </p>
                )}
            </div>

            {/* Accessible Dismiss Button */}
            <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label={`Tutup notifikasi: ${toast.title}`}
                className="shrink-0 p-1 rounded-lg text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)] transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </motion.div>
    );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const dismiss = useCallback((id?: string) => {
        if (!id) {
            setToasts([]);
            return;
        }
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const showToast = useCallback(
        (
            type: ToastType,
            title: string,
            message?: string,
            duration = type === 'error' ? 5000 : DEFAULT_DURATION_MS,
            customId?: string
        ): string => {
            const id = customId || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const newToast: ToastItem = {
                id,
                type,
                title,
                message,
                duration: type === 'loading' ? 0 : duration,
                createdAt: Date.now(),
            };

            setToasts((prev) => {
                const withoutDuplicate = prev.filter((item) => item.id !== id);
                return [newToast, ...withoutDuplicate].slice(0, MAX_VISIBLE_TOASTS);
            });

            return id;
        },
        []
    );

    const updateToast = useCallback(
        (id: string, patch: Partial<Omit<ToastItem, 'id' | 'createdAt'>>) => {
            setToasts((prev) =>
                prev.map((item) => {
                    if (item.id !== id) {
                        return item;
                    }
                    const nextType = patch.type ?? item.type;
                    const nextDuration =
                        patch.duration !== undefined
                            ? patch.duration
                            : nextType === 'loading'
                              ? 0
                              : DEFAULT_DURATION_MS;
                    return {
                        ...item,
                        ...patch,
                        type: nextType,
                        duration: nextDuration,
                    };
                })
            );
        },
        []
    );

    const success = useCallback(
        (title: string, message?: string, duration?: number) =>
            showToast('success', title, message, duration),
        [showToast]
    );
    const error = useCallback(
        (title: string, message?: string, duration?: number) =>
            showToast('error', title, message, duration ?? 5000),
        [showToast]
    );
    const warning = useCallback(
        (title: string, message?: string, duration?: number) =>
            showToast('warning', title, message, duration ?? 4500),
        [showToast]
    );
    const info = useCallback(
        (title: string, message?: string, duration?: number) =>
            showToast('info', title, message, duration),
        [showToast]
    );
    const loading = useCallback(
        (title: string, message?: string) => showToast('loading', title, message, 0),
        [showToast]
    );

    const contextValue = useMemo<ToastContextValue>(
        () => ({
            showToast,
            updateToast,
            dismiss,
            success,
            error,
            warning,
            info,
            loading,
        }),
        [showToast, updateToast, dismiss, success, error, warning, info, loading]
    );

    return (
        <ToastContext.Provider value={contextValue}>
            {children}

            {/* Global MD3 Floating Toast Viewport:
                - Desktop (md+): Top-Right just below topbar controls (top-[5.25rem] right-6) so topbar actions stay unobstructed
                - Mobile (<md): Responsive top below mobile header (top-16 inset-x-4) avoiding primary navigation & bottom buttons
                - Elevation & Z-Index: z-[100] above Modals/Sheets (z-50) */}
            <div
                role="region"
                aria-label="Notifikasi Sistem"
                className="fixed z-[100] pointer-events-none top-16 inset-x-4 sm:left-auto sm:right-5 sm:w-[23rem] md:top-[5.25rem] md:right-6 flex flex-col gap-2.5"
            >
                <AnimatePresence mode="popLayout" initial={false}>
                    {toasts.map((toast) => (
                        <IndividualToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
};

export function useToast(): ToastContextValue {
    const context = useContext(ToastContext);
    return context || defaultToastContext;
}
