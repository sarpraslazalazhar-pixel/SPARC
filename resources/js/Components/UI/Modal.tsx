import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { backdropVariants, modalSurfaceVariants } from '@/lib/motion';

export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
    children: React.ReactNode;
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    description,
    children,
    maxWidth = 'md',
}) => {
    const maxWidthMap = {
        sm: 'max-w-sm',
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

                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto pointer-events-none">
                            <Dialog.Content
                                asChild
                                forceMount
                                aria-describedby={description ? undefined : undefined}
                            >
                                <motion.div
                                    variants={modalSurfaceVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    className={cn(
                                        'pointer-events-auto relative w-full my-auto rounded-3xl overflow-hidden outline-none',
                                        'bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)]',
                                        'border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-4)]',
                                        maxWidthMap[maxWidth]
                                    )}
                                >
                                    {(title || description) ? (
                                        <div className="px-6 pt-5 pb-4 border-b border-[var(--md-sys-color-outline-variant)] flex items-start justify-between gap-4 bg-[var(--md-sys-color-surface-container-low)]/40 dark:bg-[var(--md-sys-color-surface-container)]/40">
                                            <div className="min-w-0 flex-1">
                                                {title ? (
                                                    <Dialog.Title className="text-base font-bold text-[var(--md-sys-color-on-surface)] tracking-tight">
                                                        {title}
                                                    </Dialog.Title>
                                                ) : (
                                                    <Dialog.Title className="sr-only">Dialog</Dialog.Title>
                                                )}
                                                {description ? (
                                                    <Dialog.Description className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                                                        {description}
                                                    </Dialog.Description>
                                                ) : (
                                                    <Dialog.Description className="sr-only">
                                                        Jendela dialog aplikasi
                                                    </Dialog.Description>
                                                )}
                                            </div>
                                            <Dialog.Close asChild>
                                                <button
                                                    type="button"
                                                    aria-label="Tutup dialog"
                                                    className="md-btn-tactile p-1.5 rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] shrink-0"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </Dialog.Close>
                                        </div>
                                    ) : (
                                        <>
                                            <Dialog.Title className="sr-only">Dialog</Dialog.Title>
                                            <Dialog.Description className="sr-only">
                                                Jendela dialog aplikasi
                                            </Dialog.Description>
                                        </>
                                    )}
                                    <div className="p-6 text-[var(--md-sys-color-on-surface)]">{children}</div>
                                </motion.div>
                            </Dialog.Content>
                        </div>
                    </Dialog.Portal>
                )}
            </AnimatePresence>
        </Dialog.Root>
    );
};
