import React, { useId } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { MD3_SPRING } from '@/lib/motion';

export interface TabItem {
    id: string;
    label: string;
    icon?: React.ReactNode;
    count?: number;
}

export interface TabsProps {
    tabs: TabItem[];
    activeTab: string;
    onChange: (id: string) => void;
    className?: string;
    variant?: 'pills' | 'underline';
    ariaLabel?: string;
}

export const Tabs: React.FC<TabsProps> = ({
    tabs,
    activeTab,
    onChange,
    className,
    variant = 'pills',
    ariaLabel = 'Navigasi Tab',
}) => {
    const groupId = useId();

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') {
            return;
        }
        e.preventDefault();
        const currentIndex = tabs.findIndex((t) => t.id === activeTab);
        if (currentIndex === -1) {
            return;
        }
        const delta = e.key === 'ArrowRight' ? 1 : -1;
        const nextIndex = (currentIndex + delta + tabs.length) % tabs.length;
        onChange(tabs[nextIndex].id);
    };

    if (variant === 'underline') {
        return (
            <div
                role="tablist"
                aria-label={ariaLabel}
                onKeyDown={handleKeyDown}
                className={cn(
                    'border-b border-[var(--md-sys-color-outline-variant)] flex items-center gap-6 overflow-x-auto',
                    className
                )}
            >
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            tabIndex={isActive ? 0 : -1}
                            onClick={() => onChange(tab.id)}
                            className={cn(
                                'pb-3 text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors relative cursor-pointer whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] rounded-t-lg',
                                isActive
                                    ? 'text-[var(--md-sys-color-primary)]'
                                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                            )}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                            {typeof tab.count === 'number' && (
                                <span
                                    className={cn(
                                        'px-1.5 py-0.5 rounded-full text-[10px] font-bold transition-colors',
                                        isActive
                                            ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
                                            : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)]'
                                    )}
                                >
                                    {tab.count}
                                </span>
                            )}
                            {isActive && (
                                <motion.span
                                    layoutId={`tab-underline-${groupId}`}
                                    transition={MD3_SPRING.indicator}
                                    className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[var(--md-sys-color-primary)]"
                                />
                            )}
                        </button>
                    );
                })}
            </div>
        );
    }

    return (
        <div
            role="tablist"
            aria-label={ariaLabel}
            onKeyDown={handleKeyDown}
            className={cn(
                'inline-flex flex-wrap items-center p-1 bg-[var(--md-sys-color-surface-container)] rounded-2xl gap-1 border border-[var(--md-sys-color-outline-variant)]',
                className
            )}
        >
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => onChange(tab.id)}
                        className={cn(
                            'relative px-3.5 py-1.5 text-xs rounded-xl flex items-center gap-2 transition-colors cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]',
                            isActive
                                ? 'text-[var(--md-sys-color-on-surface)] font-bold'
                                : 'text-[var(--md-sys-color-on-surface-variant)] font-medium hover:text-[var(--md-sys-color-on-surface)]'
                        )}
                    >
                        {isActive && (
                            <motion.span
                                layoutId={`tab-pill-${groupId}`}
                                transition={MD3_SPRING.indicator}
                                className="absolute inset-0 rounded-xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container-highest)] shadow-[var(--md-elevation-1)] border border-[var(--md-sys-color-outline-variant)]/70"
                            />
                        )}
                        <span className="relative z-10 flex items-center gap-2">
                            {tab.icon}
                            <span>{tab.label}</span>
                            {typeof tab.count === 'number' && (
                                <span
                                    className={cn(
                                        'px-1.5 py-0.5 rounded-full text-[10px] font-bold transition-colors',
                                        isActive
                                            ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
                                            : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]'
                                    )}
                                >
                                    {tab.count}
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};
