import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Theme = 'light' | 'dark';

export interface UseThemeReturn {
    isDark: boolean;
    theme: Theme;
    toggleTheme: (event?: React.MouseEvent | MouseEvent) => void;
    setTheme: (theme: Theme, event?: React.MouseEvent | MouseEvent) => void;
}

const STORAGE_KEY = 'sparc_theme';

function getInitialTheme(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'dark') {
            return true;
        }
        if (saved === 'light') {
            return false;
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
        return false;
    }
}

/**
 * Custom hook implementing Fino-style Circular Ripple / Wipe Transition
 * via document.startViewTransition() and CSS clip-path animation.
 */
export function useThemeToggle(): UseThemeReturn {
    const [isDark, setIsDark] = useState<boolean>(getInitialTheme);

    // Synchronize Tailwind 'dark' class on <html> & color-scheme
    useEffect(() => {
        const root = document.documentElement;
        if (isDark) {
            root.classList.add('dark');
            root.style.colorScheme = 'dark';
        } else {
            root.classList.remove('dark');
            root.style.colorScheme = 'light';
        }
        try {
            localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
        } catch {
            // Ignore storage quota errors
        }
    }, [isDark]);

    const performTransition = useCallback((nextDark: boolean, event?: React.MouseEvent | MouseEvent) => {
        if (typeof document === 'undefined') {
            setIsDark(nextDark);
            return;
        }

        const root = document.documentElement;
        const reducedMotion =
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // Check if View Transitions API is supported by the browser
        const doc = document as Document & {
            startViewTransition?: (callback: () => void) => {
                ready: Promise<void>;
                finished: Promise<void>;
            };
        };

        const supportsViewTransitions =
            typeof doc.startViewTransition === 'function' && !reducedMotion;

        // If not supported or user prefers reduced motion, update immediately without animation
        if (!supportsViewTransitions) {
            setIsDark(nextDark);
            return;
        }

        // 1. Get click coordinates from MouseEvent or fallback to button/screen center
        let x = window.innerWidth / 2;
        let y = window.innerHeight / 2;

        if (event && typeof event.clientX === 'number' && typeof event.clientY === 'number' && (event.clientX !== 0 || event.clientY !== 0)) {
            x = event.clientX;
            y = event.clientY;
        } else if (event) {
            const el = ((event.currentTarget || event.target) as HTMLElement | null);
            if (el?.getBoundingClientRect) {
                const rect = el.getBoundingClientRect();
                x = Math.round(rect.left + rect.width / 2);
                y = Math.round(rect.top + rect.height / 2);
            }
        }

        // 2. Calculate the maximum radius required to reach the furthest screen corner (Pythagoras)
        const maxRadius = Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y)
        );

        // 3. Set CSS variables on <html> for @keyframes fino-theme-wipe
        root.style.setProperty('--theme-origin-x', `${x}px`);
        root.style.setProperty('--theme-origin-y', `${y}px`);
        root.style.setProperty('--theme-origin-r', `${maxRadius}px`);

        // 4. Trigger View Transition
        try {
            const transition = doc.startViewTransition(() => {
                setIsDark(nextDark);
            });

            transition.finished.catch(() => {
                // Ignore aborted transitions from rapid clicking
            });
        } catch {
            setIsDark(nextDark);
        }
    }, []);

    const toggleTheme = useCallback(
        (event?: React.MouseEvent | MouseEvent) => {
            performTransition(!isDark, event);
        },
        [isDark, performTransition]
    );

    const setTheme = useCallback(
        (theme: Theme, event?: React.MouseEvent | MouseEvent) => {
            performTransition(theme === 'dark', event);
        },
        [performTransition]
    );

    return {
        isDark,
        theme: isDark ? 'dark' : 'light',
        toggleTheme,
        setTheme,
    };
}

export interface ThemeToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    size?: 'sm' | 'md' | 'lg';
    showLabel?: boolean;
}

/**
 * Fino-style ThemeToggle component with Circular Wipe transition
 */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({
    className = '',
    size = 'md',
    showLabel = false,
    ...props
}) => {
    const { isDark, toggleTheme } = useThemeToggle();

    const sizeStyles = {
        sm: 'w-8 h-8 text-xs',
        md: 'w-9 h-9 text-sm',
        lg: 'w-11 h-11 text-base',
    };

    const iconSizes = {
        sm: 'w-4 h-4',
        md: 'w-4 h-4',
        lg: 'w-5 h-5',
    };

    const label = isDark ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap';

    return (
        <button
            type="button"
            onClick={(e) => toggleTheme(e)}
            aria-label={label}
            title={label}
            className={cn(
                'relative inline-flex items-center justify-center rounded-xl',
                'bg-[var(--md-sys-color-surface-container)] hover:bg-[var(--md-sys-color-surface-container-high)]',
                'border border-[var(--md-sys-color-outline-variant)]/80',
                'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]',
                'transition-colors duration-150 cursor-pointer select-none outline-none',
                'focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]',
                sizeStyles[size],
                showLabel && 'w-auto px-3 gap-2',
                className
            )}
            {...props}
        >
            <AnimatePresence mode="wait" initial={false}>
                <motion.span
                    key={isDark ? 'dark' : 'light'}
                    initial={{ opacity: 0, rotate: -45, scale: 0.8 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, rotate: 45, scale: 0.8 }}
                    transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                    className="inline-flex items-center justify-center shrink-0"
                >
                    {isDark ? (
                        <Sun className={cn(iconSizes[size], 'text-amber-400')} />
                    ) : (
                        <Moon className={cn(iconSizes[size], 'text-indigo-600')} />
                    )}
                </motion.span>
            </AnimatePresence>

            {showLabel && (
                <span className="font-semibold text-xs text-[var(--md-sys-color-on-surface)]">
                    {isDark ? 'Light Mode' : 'Dark Mode'}
                </span>
            )}
        </button>
    );
};
