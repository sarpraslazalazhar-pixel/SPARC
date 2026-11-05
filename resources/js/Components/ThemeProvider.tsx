import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeCoordinates {
    x: number;
    y: number;
}

export interface ThemeContextValue {
    theme: ThemePreference;
    resolvedTheme: ResolvedTheme;
    isDark: boolean;
    setTheme: (nextTheme: ThemePreference, coords?: ThemeCoordinates) => void;
    toggleTheme: (coords?: ThemeCoordinates) => void;
}

const STORAGE_KEY = 'sparc_theme';

function getInitialPreference(): ThemePreference {
    if (typeof window === 'undefined') {
        return 'system';
    }
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
            return stored;
        }
    } catch {
        // Ignore storage errors in restricted environments
    }
    return 'system';
}

function resolveEffectiveTheme(preference: ThemePreference): ResolvedTheme {
    if (preference === 'light' || preference === 'dark') {
        return preference;
    }
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<ThemePreference>(getInitialPreference);
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
        resolveEffectiveTheme(getInitialPreference())
    );
    const transitionTimerRef = useRef<number | null>(null);
    const lastCoordsRef = useRef<ThemeCoordinates | null>(null);

    // Track pointerdown coordinates globally as a fallback origin for circular reveals
    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        const handlePointerDown = (e: PointerEvent) => {
            if (e.clientX || e.clientY) {
                lastCoordsRef.current = { x: Math.round(e.clientX), y: Math.round(e.clientY) };
            }
        };
        window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true });
        return () => {
            window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
        };
    }, []);

    const applyDomTheme = useCallback(
        (
            effective: ResolvedTheme,
            pref: ThemePreference,
            animate: boolean,
            coords?: ThemeCoordinates
        ) => {
            if (typeof document === 'undefined') {
                return;
            }
            const root = document.documentElement;
            const reducedMotion =
                typeof window !== 'undefined' &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            const currentlyDark = root.classList.contains('dark');
            const nextIsDark = effective === 'dark';
            const isVisualChange = currentlyDark !== nextIsDark;

            const updateDomState = () => {
                if (nextIsDark) {
                    root.classList.add('dark');
                    root.style.colorScheme = 'dark';
                } else {
                    root.classList.remove('dark');
                    root.style.colorScheme = 'light';
                }
                root.dataset.themePreference = pref;
                setResolvedTheme(effective);
            };

            // If no visual change or no animation requested, update immediately
            if (!animate || !isVisualChange) {
                updateDomState();
                return;
            }

            // Check for View Transitions API support (Chrome, Edge, Safari 18+)
            const doc = document as Document & {
                startViewTransition?: (callback: () => void) => {
                    ready: Promise<void>;
                    finished: Promise<void>;
                };
            };

            const supportsViewTransitions =
                typeof doc.startViewTransition === 'function' && !reducedMotion;

            if (supportsViewTransitions) {
                const targetCoords = coords || lastCoordsRef.current || {
                    x: Math.round(window.innerWidth - 64),
                    y: 32,
                };
                const x = targetCoords.x;
                const y = targetCoords.y;

                const maxRadius = Math.hypot(
                    Math.max(x, window.innerWidth - x),
                    Math.max(y, window.innerHeight - y)
                );

                root.style.setProperty('--theme-origin-x', `${x}px`);
                root.style.setProperty('--theme-origin-y', `${y}px`);
                root.style.setProperty('--theme-origin-r', `${maxRadius}px`);

                try {
                    const transition = doc.startViewTransition(() => {
                        updateDomState();
                    });

                    transition.finished.catch(() => {
                        // Suppress transition abort errors if user rapidly switches
                    });
                    return;
                } catch {
                    // Fall back to CSS transition if startViewTransition throws
                }
            }

            // High-end CSS transition fallback for browsers without View Transitions
            if (!reducedMotion) {
                root.classList.add('theme-transitioning');
                if (transitionTimerRef.current) {
                    window.clearTimeout(transitionTimerRef.current);
                }
                transitionTimerRef.current = window.setTimeout(() => {
                    root.classList.remove('theme-transitioning');
                    transitionTimerRef.current = null;
                }, 240);
            }

            updateDomState();
        },
        []
    );

    // Synchronize on mount without animation and subscribe to OS color-scheme changes
    useEffect(() => {
        const effective = resolveEffectiveTheme(theme);
        applyDomTheme(effective, theme, false);

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleSystemChange = () => {
            if (theme === 'system') {
                const nextEffective = mediaQuery.matches ? 'dark' : 'light';
                applyDomTheme(nextEffective, 'system', true);
            }
        };

        mediaQuery.addEventListener('change', handleSystemChange);
        return () => {
            mediaQuery.removeEventListener('change', handleSystemChange);
        };
    }, [theme, applyDomTheme]);

    // Clean up transition timer on unmount
    useEffect(() => {
        return () => {
            if (transitionTimerRef.current) {
                window.clearTimeout(transitionTimerRef.current);
            }
        };
    }, []);

    const setTheme = useCallback(
        (nextTheme: ThemePreference, coords?: ThemeCoordinates) => {
            try {
                localStorage.setItem(STORAGE_KEY, nextTheme);
            } catch {
                // Ignore storage write errors
            }
            setThemeState(nextTheme);
            const effective = resolveEffectiveTheme(nextTheme);
            applyDomTheme(effective, nextTheme, true, coords);
        },
        [applyDomTheme]
    );

    const toggleTheme = useCallback(
        (coords?: ThemeCoordinates) => {
            const next: ThemePreference = resolvedTheme === 'dark' ? 'light' : 'dark';
            setTheme(next, coords);
        },
        [resolvedTheme, setTheme]
    );

    const value = useMemo<ThemeContextValue>(
        () => ({
            theme,
            resolvedTheme,
            isDark: resolvedTheme === 'dark',
            setTheme,
            toggleTheme,
        }),
        [theme, resolvedTheme, setTheme, toggleTheme]
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
