export type InstagramSyncMode = 'smart' | 'archive';

export interface ChunkedInstagramSyncProgress {
    fetchedCount: number;
    syncedCount: number;
    importedCount: number;
    batchCount: number;
    nextCursor?: string | null;
}

export interface ChunkedInstagramSyncResult {
    success: boolean;
    syncedCount: number;
    importedCount: number;
    fetchedCount: number;
    rateLimited?: boolean;
    savedArchiveCursor?: string | null;
    error?: string;
}

interface SyncBatchResponse {
    success?: boolean;
    fetched_count?: number;
    synced_count?: number;
    imported_count?: number;
    all_existing?: boolean;
    next_cursor?: string | null;
    has_more?: boolean;
    rate_limited?: boolean;
    saved_archive_cursor?: string | null;
    error?: string;
    message?: string;
}

function resolveXsrfToken(): string {
    if (typeof document === 'undefined') {
        return '';
    }
    const cookieMatch = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    if (cookieMatch) {
        return decodeURIComponent(cookieMatch[1]);
    }
    const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');

    return meta?.content ?? '';
}

async function sleepMs(ms: number): Promise<void> {
    const delay = Promise.withResolvers<void>();
    setTimeout(delay.resolve, ms);
    await delay.promise;
}

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
    try {
        const text = await response.text();
        if (!text) {
            return null;
        }

        return JSON.parse(text) as T;
    } catch {
        return null;
    }
}

/**
 * Sync Instagram posts in cPanel-safe sequential batches:
 * - `smart` (default): pulls newest posts first with insights and stops immediately once reaching posts already in DB (~2-4s for new posts).
 * - `archive`: pulls all historical posts (`100` per single HTTP call, skips heavy per-post `/insights`) with persistent resumable cursor.
 */
export async function runChunkedInstagramSync(options?: {
    mode?: InstagramSyncMode;
    batchSize?: number;
    includeProfile?: boolean;
    resetCursor?: boolean;
    onProgress?: (progress: ChunkedInstagramSyncProgress) => void;
}): Promise<ChunkedInstagramSyncResult> {
    const mode: InstagramSyncMode = options?.mode ?? 'smart';
    const batchSize = options?.batchSize ?? (mode === 'archive' ? 100 : 50);
    const includeProfile = options?.includeProfile ?? true;
    const maxBatches = mode === 'archive' ? 2000 : 35;

    let cursor: string | null = null;
    let hasMore = true;
    let batchCount = 0;
    let totalFetched = 0;
    let totalSynced = 0;
    let totalImported = 0;
    let lastSavedCursor: string | null = null;
    const seenCursors = new Set<string>();

    while (hasMore && batchCount < maxBatches) {
        batchCount += 1;
        const xsrf = resolveXsrfToken();

        let data: SyncBatchResponse | null = null;
        let response: Response;
        try {
            response = await fetch('/content/instagram/sync-batch', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}),
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    mode,
                    after: cursor,
                    batch_size: batchSize,
                    sync_insights: mode === 'smart',
                    resume: mode === 'archive' && batchCount === 1 && !options?.resetCursor,
                    reset_cursor: mode === 'archive' && batchCount === 1 && Boolean(options?.resetCursor),
                }),
            });

            data = await parseJsonSafe<SyncBatchResponse>(response);
            if (!response.ok || !data?.success) {
                const isRateLimited = response.status === 429 || Boolean(data?.rate_limited);

                return {
                    success: false,
                    syncedCount: totalSynced,
                    importedCount: totalImported,
                    fetchedCount: totalFetched,
                    rateLimited: isRateLimited,
                    savedArchiveCursor: data?.saved_archive_cursor ?? lastSavedCursor,
                    error:
                        data?.error ||
                        data?.message ||
                        (isRateLimited
                            ? 'Batas rate-limit Meta Graph API tercapai sementara. Posisi terakhir sudah tersimpan; tunggu beberapa menit lalu klik Lanjutkan.'
                            : `Gagal menyinkronkan batch #${batchCount} (HTTP ${response.status}).`),
                };
            }
        } catch (err) {
            return {
                success: false,
                syncedCount: totalSynced,
                importedCount: totalImported,
                fetchedCount: totalFetched,
                savedArchiveCursor: lastSavedCursor,
                error: err instanceof Error ? err.message : 'Koneksi ke server terputus saat menyinkronkan Instagram.',
            };
        }

        totalFetched += Number(data.fetched_count ?? 0);
        totalSynced += Number(data.synced_count ?? 0);
        totalImported += Number(data.imported_count ?? 0);
        if (typeof data.saved_archive_cursor === 'string' && data.saved_archive_cursor !== '') {
            lastSavedCursor = data.saved_archive_cursor;
        }

        const nextCursor = typeof data.next_cursor === 'string' && data.next_cursor !== '' ? data.next_cursor : null;
        options?.onProgress?.({
            fetchedCount: totalFetched,
            syncedCount: totalSynced,
            importedCount: totalImported,
            batchCount,
            nextCursor,
        });

        // In smart mode, stop immediately once we hit a page whose posts are all already stored in SPARC
        if (mode === 'smart' && data.all_existing) {
            hasMore = false;
            break;
        }

        if (data.has_more && nextCursor && !seenCursors.has(nextCursor)) {
            seenCursors.add(nextCursor);
            cursor = nextCursor;
            await sleepMs(mode === 'archive' ? 120 : 200);
            hasMore = true;
        } else {
            hasMore = false;
        }
    }

    if (includeProfile) {
        try {
            const xsrf = resolveXsrfToken();
            await fetch('/content/instagram/sync-batch', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}),
                },
                credentials: 'same-origin',
                body: JSON.stringify({ finish: true }),
            });
        } catch {
            // Account profile refresh is best-effort after posts have already synced
        }
    }

    return {
        success: true,
        syncedCount: totalSynced,
        importedCount: totalImported,
        fetchedCount: totalFetched,
        savedArchiveCursor: lastSavedCursor,
    };
}

/**
 * Silent 1-request background check for new IG posts (throttled once per 3 minutes per browser tab session).
 */
export async function runQuickNewPostCheck(): Promise<{ importedCount: number }> {
    if (typeof window === 'undefined') {
        return { importedCount: 0 };
    }
    const key = 'sparc_ig_quick_check_ts';
    try {
        const lastTs = Number(window.sessionStorage.getItem(key) ?? '0');
        if (lastTs > 0 && Date.now() - lastTs < 180_000) {
            return { importedCount: 0 };
        }
        window.sessionStorage.setItem(key, String(Date.now()));
    } catch {
        // Ignore sessionStorage errors
    }

    try {
        const xsrf = resolveXsrfToken();
        const response = await fetch('/content/instagram/sync-batch', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}),
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                mode: 'smart',
                batch_size: 20,
                sync_insights: true,
            }),
        });
        const data = await parseJsonSafe<SyncBatchResponse>(response);
        if (!response.ok || !data?.success) {
            return { importedCount: 0 };
        }

        return { importedCount: Number(data.imported_count ?? 0) };
    } catch {
        return { importedCount: 0 };
    }
}

/**
 * Backfill missing `/insights` (`reach`, `views`, `shares`, `saves`) for archived IG posts in safe small chunks.
 */
export async function runMissingInsightsBackfill(options?: {
    maxBatches?: number;
    onProgress?: (updatedCount: number, remainingCount: number) => void;
}): Promise<{ success: boolean; updatedCount: number; remainingCount: number; error?: string }> {
    const maxBatches = options?.maxBatches ?? 25;
    let totalUpdated = 0;
    let remaining = 0;

    for (let i = 0; i < maxBatches; i++) {
        const xsrf = resolveXsrfToken();
        try {
            const response = await fetch('/content/instagram/sync-insights-batch', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}),
                },
                credentials: 'same-origin',
                body: JSON.stringify({ batch_size: 30 }),
            });
            const data = await parseJsonSafe<{
                success?: boolean;
                updated_count?: number;
                remaining_count?: number;
                error?: string;
            }>(response);
            if (!response.ok || !data?.success) {
                return {
                    success: false,
                    updatedCount: totalUpdated,
                    remainingCount: remaining,
                    error: data?.error || `HTTP ${response.status} saat mengambil insights.`,
                };
            }
            const updated = Number(data.updated_count ?? 0);
            remaining = Number(data.remaining_count ?? 0);
            totalUpdated += updated;
            options?.onProgress?.(totalUpdated, remaining);
            if (updated === 0 || remaining === 0) {
                break;
            }
            await sleepMs(250);
        } catch (err) {
            return {
                success: false,
                updatedCount: totalUpdated,
                remainingCount: remaining,
                error: err instanceof Error ? err.message : 'Koneksi terputus saat melengkapi insights.',
            };
        }
    }

    return {
        success: true,
        updatedCount: totalUpdated,
        remainingCount: remaining,
    };
}
