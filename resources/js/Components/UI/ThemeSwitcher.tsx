import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Monitor, Moon, Sun } from 'lucide-react';
import { type ThemePreference, useTheme } from '@/Components/ThemeProvider';
import { ThemeToggle, useThemeToggle } from './ThemeToggle';
export { ThemeToggle, useThemeToggle };
import { cn } from '@/lib/utils';
import { MD3_SPRING } from '@/lib/motion';

const THEME_OPTIONS: Array<{
    value: ThemePreference;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
}> = [
    {
        value: 'light',
        label: 'Light Mode',
        description: 'Tampilan terang bersih & kontras',
        icon: Sun,
    },
    {
        value: 'dark',
        label: 'Dark Mode',
        description: 'Tonal gelap nyaman di mata',
        icon: Moon,
    },
    {
        value: 'system',
        label: 'System Preference',
        description: 'Ikuti pengaturan perangkat',
        icon: Monitor,
    },
];

export const ThemeSwitcher: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
    const { resolvedTheme, toggleTheme } = useTheme();

    const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX || Math.round(rect.left + rect.width / 2);
        const y = e.clientY || Math.round(rect.top + rect.height / 2);
        toggleTheme({ x, y });
    };

    const targetLabel = resolvedTheme === 'dark' ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap';

    return (
        <button
            type="button"
            aria-label={targetLabel}
            title={targetLabel}
            onClick={handleToggle}
            className={cn(
                'md-btn-tactile relative inline-flex items-center justify-center rounded-xl transition-colors',
                'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]',
                'hover:bg-[var(--md-sys-color-surface-container)] active:scale-[0.95]',
                'border border-transparent hover:border-[var(--md-sys-color-outline-variant)]',
                'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]',
                compact ? 'p-2' : 'p-2.5'
            )}
        >
            <AnimatePresence mode="wait" initial={false}>
                {resolvedTheme === 'dark' ? (
                    <motion.span
                        key="moon"
                        initial={{ opacity: 0, rotate: -20, scale: 0.82 }}
                        animate={{ opacity: 1, rotate: 0, scale: 1 }}
                        exit={{ opacity: 0, rotate: 20, scale: 0.82 }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        className="flex items-center justify-center"
                    >
                        <Moon className="w-4 h-4 text-amber-300" />
                    </motion.span>
                ) : (
                    <motion.span
                        key="sun"
                        initial={{ opacity: 0, rotate: 20, scale: 0.82 }}
                        animate={{ opacity: 1, rotate: 0, scale: 1 }}
                        exit={{ opacity: 0, rotate: -20, scale: 0.82 }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        className="flex items-center justify-center"
                    >
                        <Sun className="w-4 h-4 text-amber-500" />
                    </motion.span>
                )}
            </AnimatePresence>
        </button>
    );
};

export const ThemeSegmentedControl: React.FC = () => {
    const { theme, setTheme } = useTheme();

    return (
        <div
            role="radiogroup"
            aria-label="Preferensi Tema"
            className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]"
        >
            {THEME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = theme === opt.value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTheme(opt.value, {
                                x: Math.round(rect.left + rect.width / 2),
                                y: Math.round(rect.top + rect.height / 2),
                            });
                        }}
                        className={cn(
                            'relative flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]',
                            isActive
                                ? 'text-[var(--md-sys-color-on-surface)] font-bold'
                                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                        )}
                    >
                        {isActive && (
                            <motion.span
                                layoutId="settings-theme-pill"
                                transition={MD3_SPRING.indicator}
                                className="absolute inset-0 rounded-xl bg-[var(--md-sys-color-surface)] shadow-[var(--md-elevation-1)] border border-[var(--md-sys-color-outline-variant)]"
                            />
                        )}
                        <span className="relative z-10 flex items-center gap-1.5">
                            <Icon className="w-3.5 h-3.5" />
                            <span>{opt.value === 'system' ? 'System' : opt.value === 'dark' ? 'Dark' : 'Light'}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
};
