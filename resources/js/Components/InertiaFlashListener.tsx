import React, { useEffect, useRef } from 'react';
import { router, usePage } from '@inertiajs/react';
import { type FlashToastPayload, type ToastType, useToast } from '@/Components/UI/Toast';

interface SharedFlashProps {
    flash?: {
        toast?: FlashToastPayload | null;
    };
    [key: string]: unknown;
}

const SEEN_STORAGE_KEY = 'sparc_seen_flash_ids';

function loadSeenIds(): Set<string> {
    if (typeof window === 'undefined') {
        return new Set();
    }
    try {
        const raw = sessionStorage.getItem(SEEN_STORAGE_KEY);
        if (!raw) {
            return new Set();
        }
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
            return new Set(parsed.filter((v): v is string => typeof v === 'string'));
        }
    } catch {
        // Ignore storage errors
    }
    return new Set();
}

function persistSeenIds(seen: Set<string>): void {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        const recent = Array.from(seen).slice(-40);
        sessionStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(recent));
    } catch {
        // Ignore storage errors
    }
}

/**
 * Bridges Laravel/Inertia shared flash props and global network errors into the MD3 Toast system.
 * Deduplicates by flash ID across React rerenders and browser Back/Forward cache restores.
 */
export const InertiaFlashListener: React.FC = () => {
    const { props } = usePage<SharedFlashProps>();
    const { showToast, error } = useToast();
    const seenIdsRef = useRef<Set<string> | null>(null);

    if (seenIdsRef.current === null) {
        seenIdsRef.current = loadSeenIds();
    }

    const flashToast = props.flash?.toast;

    useEffect(() => {
        if (!flashToast || !flashToast.title) {
            return;
        }

        const id = flashToast.id || `${flashToast.type}:${flashToast.title}:${flashToast.message ?? ''}`;
        if (seenIdsRef.current?.has(id)) {
            return;
        }

        seenIdsRef.current?.add(id);
        if (seenIdsRef.current) {
            persistSeenIds(seenIdsRef.current);
        }

        const validTypes: ToastType[] = ['success', 'error', 'warning', 'info', 'loading'];
        const resolvedType: ToastType = validTypes.includes(flashToast.type) ? flashToast.type : 'info';

        showToast(resolvedType, flashToast.title, flashToast.message, undefined, id);
    }, [flashToast, showToast]);

    // Global network/HTTP error fallback for unexpected Inertia request failures
    useEffect(() => {
        const removeNetworkListener = router.on('networkError', () => {
            error(
                'Data Tidak Dapat Dimuat',
                'Gagal terhubung ke server. Periksa koneksi jaringan Anda lalu coba kembali.'
            );
        });

        return () => {
            removeNetworkListener();
        };
    }, [error]);

    return null;
};
