import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { backdropVariants, sheetSurfaceVariants } from '@/lib/motion';

export interface SheetProps {
    isOpen: boolean;
    onClose: () => void;
    eyebrow?: React.ReactNode;
    title?: React.ReactNode;
    description?: React.ReactNode;
    headerExtra?: React.ReactNode;
    children: React.ReactNode;
    width?: 'md' | 'lg' | 'xl' | '2xl';
}

export const Sheet: React.FC<SheetProps> = ({
    isOpen,
    onClose,
    eyebrow,
    title,
    description,
    headerExtra,
    children,
    width = 'lg',
}) => {
    const widthMap = {
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
    };

    return (
        <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <AnimatePresence>
                {isOpen && (
                    <Dialog.Portal forceMount>
                        <Dialog.Overlay asChild forceMount>
                            <motion.div
                                variants={backdropVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                className="fixed inset-0 z-50 bg-[var(--md-sys-color-scrim)] backdrop-blur-[2px]"
                            />
                        </Dialog.Overlay>

                        <div className="fixed inset-y-0 right-0 z-50 flex max-w-full pl-6 sm:pl-12 pointer-events-none">
                            <Dialog.Content asChild forceMount>
                                <motion.div
                                    variants={sheetSurfaceVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    className={cn(
                                        'pointer-events-auto w-screen flex flex-col outline-none',
                                        'bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container-low)]',
                                        'border-l border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-4)]',
                                        widthMap[width]
                                    )}
                                >
                                    {/* Sticky Header with Backdrop Blur */}
                                    <div className="px-5 sm:px-6 py-4 border-b border-[var(--md-sys-color-outline-variant)] flex items-start justify-between gap-3 bg-[var(--md-sys-color-surface)]/95 dark:bg-[var(--md-sys-color-surface-container-low)]/95 backdrop-blur-md sticky top-0 z-20">
                                        <div className="min-w-0 flex-1 space-y-1">
                                            {eyebrow && (
                                                <div className="flex items-center gap-2">
                                                    {eyebrow}
                                                </div>
                                            )}
                                            <Dialog.Title className="text-base sm:text-lg font-bold text-[var(--md-sys-color-on-surface)] tracking-tight leading-snug line-clamp-2">
                                                {title || 'Rincian Item'}
                                            </Dialog.Title>
                                            {description && (
                                                <Dialog.Description className="text-xs text-[var(--md-sys-color-on-surface-variant)] line-clamp-1">
                                                    {description}
                                                </Dialog.Description>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {headerExtra}
                                            <Dialog.Close asChild>
                                                <button
                                                    type="button"
                                                    aria-label="Tutup panel"
                                                    className="md-btn-tactile p-2 rounded-xl text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]"
                                                >
                                                    <X className="w-5 h-5" />
                                                </button>
                                            </Dialog.Close>
                                        </div>
                                    </div>

                                    {/* Body */}
                                    <div className="flex-1 overflow-y-auto p-5 sm:p-6 text-[var(--md-sys-color-on-surface)]">
                                        {children}
                                    </div>
                                </motion.div>
                            </Dialog.Content>
                        </div>
                    </Dialog.Portal>
                )}
            </AnimatePresence>
        </Dialog.Root>
    );
};
