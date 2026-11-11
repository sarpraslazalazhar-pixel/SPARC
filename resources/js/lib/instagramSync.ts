export interface ChunkedInstagramSyncProgress {
    fetchedCount: number;
    syncedCount: number;
    importedCount: number;
    batchCount: number;
}

export interface ChunkedInstagramSyncResult {
    success: boolean;
    syncedCount: number;
    importedCount: number;
    fetchedCount: number;
    error?: string;
}

interface SyncBatchResponse {
    success?: boolean;
    fetched_count?: number;
    synced_count?: number;
    imported_count?: number;
    next_cursor?: string | null;
    has_more?: boolean;
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

/**
 * Pull every Instagram post across all cursor pages via short resumable cPanel-safe batches.
 */
export async function runChunkedInstagramSync(options?: {
    batchSize?: number;
    includeProfile?: boolean;
    onProgress?: (progress: ChunkedInstagramSyncProgress) => void;
}): Promise<ChunkedInstagramSyncResult> {
    const batchSize = options?.batchSize ?? 100;
    const includeProfile = options?.includeProfile ?? true;
    const maxBatches = 250;

    let cursor: string | null = null;
    let hasMore = true;
    let batchCount = 0;
    let totalFetched = 0;
    let totalSynced = 0;
    let totalImported = 0;
    const seenCursors = new Set<string>();

    while (hasMore && batchCount < maxBatches) {
        batchCount += 1;
        const xsrf = resolveXsrfToken();

        let data: SyncBatchResponse;
        try {
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
                    after: cursor,
                    batch_size: batchSize,
                }),
            });

            data = (await response.json()) as SyncBatchResponse;
            if (!response.ok || !data.success) {
                return {
                    success: false,
                    syncedCount: totalSynced,
                    importedCount: totalImported,
                    fetchedCount: totalFetched,
                    error: data.error || data.message || `Gagal menyinkronkan batch #${batchCount} (HTTP ${response.status}).`,
                };
            }
        } catch (err) {
            return {
                success: false,
                syncedCount: totalSynced,
                importedCount: totalImported,
                fetchedCount: totalFetched,
                error: err instanceof Error ? err.message : 'Koneksi ke server terputus saat menyinkronkan Instagram.',
            };
        }

        totalFetched += Number(data.fetched_count ?? 0);
        totalSynced += Number(data.synced_count ?? 0);
        totalImported += Number(data.imported_count ?? 0);

        options?.onProgress?.({
            fetchedCount: totalFetched,
            syncedCount: totalSynced,
            importedCount: totalImported,
            batchCount,
        });

        const nextCursor = typeof data.next_cursor === 'string' && data.next_cursor !== '' ? data.next_cursor : null;
        if (data.has_more && nextCursor && !seenCursors.has(nextCursor)) {
            seenCursors.add(nextCursor);
            cursor = nextCursor;
            const delay = Promise.withResolvers<void>();
            setTimeout(delay.resolve, 200);
            await delay.promise;
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
    };
}
