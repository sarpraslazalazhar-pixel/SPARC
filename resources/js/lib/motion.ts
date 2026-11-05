import type { Transition, Variants } from 'framer-motion';

/**
 * Material Design 3 — Centralized Motion System
 * Provides consistent durations, cubic-bezier easings, spring physics, and variants.
 */
export const MD3_EASING = {
    standard: [0.2, 0, 0, 1] as const,
    decelerate: [0.05, 0.7, 0.1, 1] as const,
    accelerate: [0.3, 0, 0.8, 0.15] as const,
};

export const MD3_DURATION = {
    fastFeedback: 0.12, // 120ms (hover/press micro-feedback)
    standard: 0.18, // 180ms (standard UI & page entrance)
    pageExit: 0.11, // 110ms (snappy page exit without feeling sluggish)
    dialogEnter: 0.22, // 220ms
    dialogExit: 0.16, // 160ms
    toastEnter: 0.22, // 220ms
    toastExit: 0.18, // 180ms
};

export const MD3_SPRING = {
    snappy: {
        type: 'spring',
        stiffness: 420,
        damping: 32,
        mass: 0.8,
    } satisfies Transition,
    gentle: {
        type: 'spring',
        stiffness: 320,
        damping: 28,
        mass: 0.9,
    } satisfies Transition,
    indicator: {
        type: 'spring',
        stiffness: 460,
        damping: 36,
    } satisfies Transition,
};

/**
 * Page transition variants for Inertia navigation inside persistent AppLayout.
 * Subtle 6px vertical entrance and -4px exit with MD3 standard/decelerate curves.
 */
export const pageTransitionVariants: Variants = {
    initial: {
        opacity: 0,
        y: 6,
    },
    animate: {
        opacity: 1,
        y: 0,
        transition: {
            duration: MD3_DURATION.standard,
            ease: MD3_EASING.decelerate,
        },
    },
    exit: {
        opacity: 0,
        y: -4,
        transition: {
            duration: MD3_DURATION.pageExit,
            ease: MD3_EASING.accelerate,
        },
    },
};

export const backdropVariants: Variants = {
    initial: { opacity: 0 },
    animate: {
        opacity: 1,
        transition: { duration: 0.18, ease: MD3_EASING.standard },
    },
    exit: {
        opacity: 0,
        transition: { duration: 0.14, ease: MD3_EASING.accelerate },
    },
};

export const modalSurfaceVariants: Variants = {
    initial: {
        opacity: 0,
        scale: 0.96,
        y: 8,
    },
    animate: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: {
            duration: MD3_DURATION.dialogEnter,
            ease: MD3_EASING.decelerate,
        },
    },
    exit: {
        opacity: 0,
        scale: 0.97,
        y: 4,
        transition: {
            duration: MD3_DURATION.dialogExit,
            ease: MD3_EASING.accelerate,
        },
    },
};

export const sheetSurfaceVariants: Variants = {
    initial: { x: '100%' },
    animate: {
        x: 0,
        transition: {
            duration: 0.24,
            ease: MD3_EASING.decelerate,
        },
    },
    exit: {
        x: '100%',
        transition: {
            duration: 0.18,
            ease: MD3_EASING.accelerate,
        },
    },
};

export const staggerContainerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.035,
            delayChildren: 0.02,
        },
    },
};

export const staggerItemVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    show: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.18,
            ease: MD3_EASING.decelerate,
        },
    },
};
