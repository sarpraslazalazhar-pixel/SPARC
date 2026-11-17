import { jsonHeaders } from '@/lib/traceApu';
import type { AiAnalysisEnvelope, AiDigestResult, AiReviewResult } from '@/types/aiAnalysis';

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
    try {
        const text = await response.text();

        return text ? (JSON.parse(text) as T) : null;
    } catch {
        return null;
    }
}

/** Review a draft caption. Returns the error message on failure instead of throwing. */
export async function analyzeDraft(input: {
    contentItemId?: string;
    title?: string;
    caption: string;
    format?: string;
    pillar?: string;
    brief?: string;
    force?: boolean;
}): Promise<{ analysis: AiAnalysisEnvelope<AiReviewResult>['analysis']; error?: string }> {
    const response = await fetch('/ai/analyze-draft', {
        method: 'POST',
        headers: jsonHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({
            content_item_id: input.contentItemId,
            title: input.title,
            caption: input.caption,
            format: input.format,
            pillar: input.pillar,
            brief: input.brief,
            force: input.force ?? false,
        }),
    });

    const payload = await parseJsonSafe<{ id: number; result: AiReviewResult | null; message?: string }>(response);
    if (!response.ok || !payload) {
        return { analysis: null, error: payload?.message ?? 'Analisis draft gagal diproses.' };
    }

    return {
        analysis: {
            id: payload.id,
            type: 'pre_publish',
            status: 'completed',
            model: '',
            analyzed_at: null,
            result: payload.result,
        },
    };
}

/** Analyze the synced Instagram metrics of one content item. */
export async function analyzePost(
    contentId: string,
    force = false
): Promise<{ analysis: AiAnalysisEnvelope<AiReviewResult>['analysis']; error?: string }> {
    const response = await fetch(`/ai/analyze-post/${encodeURIComponent(contentId)}${force ? '?force=1' : ''}`, {
        method: 'POST',
        headers: jsonHeaders(),
        credentials: 'same-origin',
    });

    const payload = await parseJsonSafe<{ id: number; result: AiReviewResult | null; message?: string }>(response);
    if (!response.ok || !payload) {
        return { analysis: null, error: payload?.message ?? 'Analisis performa gagal diproses.' };
    }

    return {
        analysis: {
            id: payload.id,
            type: 'post_publish',
            status: 'completed',
            model: '',
            analyzed_at: null,
            result: payload.result,
        },
    };
}

/** Cached analysis for one item, no tokens spent. */
export async function fetchAnalysis(
    contentId: string,
    type: 'pre_publish' | 'post_publish' = 'post_publish'
): Promise<AiAnalysisEnvelope<AiReviewResult> | null> {
    const response = await fetch(
        `/ai/analysis/${encodeURIComponent(contentId)}?type=${type}`,
        { headers: jsonHeaders(), credentials: 'same-origin' }
    );

    return response.ok ? parseJsonSafe<AiAnalysisEnvelope<AiReviewResult>>(response) : null;
}

/** Cached period digest, or a fresh one when `refresh` is set. */
export async function fetchDigest(
    refresh = false
): Promise<{ analysis: AiAnalysisEnvelope<AiDigestResult>['analysis']; error?: string }> {
    const response = await fetch(`/ai/digest${refresh ? '?refresh=1' : ''}`, {
        headers: jsonHeaders(),
        credentials: 'same-origin',
    });

    const payload = await parseJsonSafe<{
        analysis: AiAnalysisEnvelope<AiDigestResult>['analysis'];
        message?: string;
    }>(response);

    if (!response.ok || !payload) {
        return { analysis: null, error: payload?.message ?? 'Ringkasan strategi belum tersedia.' };
    }

    return { analysis: payload.analysis };
}
