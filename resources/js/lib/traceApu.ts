import type { TraceApuHistoryEntry, TraceApuPanelPayload, TraceApuStreamEvent, TrendFeed } from '@/types/traceApu';

export function resolveXsrfToken(): string {
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

export function jsonHeaders(): HeadersInit {
    return {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-TOKEN': resolveXsrfToken(),
    };
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

/** Fresh panel state: greeting, active trends, transcript and steering instructions. */
export async function fetchTraceApuPanel(scope = 'global'): Promise<TraceApuPanelPayload | null> {
    const response = await fetch(`/trace-apu/panel?scope=${encodeURIComponent(scope)}`, {
        headers: jsonHeaders(),
        credentials: 'same-origin',
    });

    if (!response.ok) {
        return null;
    }

    return parseJsonSafe<TraceApuPanelPayload>(response);
}

/**
 * POST one turn and consume the NDJSON stream.
 * Calls `onEvent` per line; resolves with the final event (answer + caption suggestions).
 */
export async function streamTraceApuTurn(
    payload: { message: string; scope?: string; fresh?: boolean },
    onEvent?: (event: TraceApuStreamEvent) => void
): Promise<TraceApuStreamEvent | null> {
    const response = await fetch('/trace-apu/chat', {
        method: 'POST',
        headers: jsonHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const body = await parseJsonSafe<{ message?: string }>(response);

        onEvent?.({ type: 'error', message: body?.message ?? 'TRACE APU tidak tersedia saat ini.' });

        return null;
    }

    if (!response.body) {
        const body = await parseJsonSafe<{ message?: string }>(response);
        onEvent?.({ type: 'error', message: body?.message ?? 'Streaming tidak didukung browser ini.' });

        return null;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let final: TraceApuStreamEvent | null = null;

    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        buffer += decoder.decode(value, { stream: true });

        let newline = buffer.indexOf('\n');
        while (newline >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf('\n');

            if (!line) {
                continue;
            }

            let event: TraceApuStreamEvent;
            try {
                event = JSON.parse(line) as TraceApuStreamEvent;
            } catch {
                continue;
            }

            onEvent?.(event);
            if (event.type === 'done') {
                final = event;
            }
        }
    }

    return final;
}

export async function saveTraceApuInstructions(scope: string, persona: string, rules: string[]) {
    const response = await fetch('/trace-apu/instructions', {
        method: 'PUT',
        headers: jsonHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ scope, persona, rules }),
    });

    return response.ok;
}

/** Trends page payload without a full Inertia reload. */
/**
 * Persist one TRACE APU caption proposal to the content item.
 * `message` is set when the server refuses (permission) — otherwise the caption was re-read from the DB.
 */
export async function applyTraceApuCaption(
    contentRef: string,
    caption: string
): Promise<{ ok: boolean; message: string }> {
    const response = await fetch('/trace-apu/caption', {
        method: 'POST',
        headers: jsonHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ content_ref: contentRef, caption }),
    });
    const body = await parseJsonSafe<{ message?: string; content_ref?: string }>(response);

    if (!response.ok || !body?.content_ref) {
        return { ok: false, message: body?.message ?? '' };
    }

    return { ok: true, message: body.message ?? `Caption ${body.content_ref} tersimpan.` };
}

export async function fetchTrends(category?: string): Promise<TrendFeed | null> {
    const query = category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : '';
    const response = await fetch(`/trace-apu/trends${query}`, {
        headers: jsonHeaders(),
        credentials: 'same-origin',
    });

    return response.ok ? parseJsonSafe<TrendFeed>(response) : null;
}

export async function forgetTraceApuHistory(scope: string): Promise<boolean> {
    const response = await fetch('/trace-apu/history', {
        method: 'DELETE',
        headers: jsonHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ scope }),
    });

    return response.ok;
}

export async function refreshTrends(): Promise<{ saved: number } | { message: string }> {
    const response = await fetch('/trends/refresh', {
        method: 'POST',
        headers: jsonHeaders(),
        credentials: 'same-origin',
    });
    const body = await parseJsonSafe<{ saved?: number; message?: string }>(response);

    if (!response.ok) {
        return { message: body?.message ?? 'Pencarian tren gagal dimulai.' };
    }

    return { saved: body?.saved ?? 0 };
}

export function historyTurns(history: TraceApuHistoryEntry[]): TraceApuHistoryEntry[] {
    return history.filter((entry) => entry.content.trim() !== '');
}

export interface AiProviderModel {
    id: string;
    label: string;
    description: string;
    input_tokens: number | null;
    output_tokens: number | null;
    supports_generate: boolean;
    supports_embedding: boolean;
}

export type AiProviderName = 'gemini' | 'openai';

export interface AiProviderPayload {
    provider: AiProviderName;
    base_url: string;
    resolved_base_url: string;
    model: string;
    embedding_model: string;
    has_api_key: boolean;
    key_source: string;
}

/** Save endpoint/key/model. Empty api_key keeps the stored key. */
export async function saveAiProvider(payload: {
    provider: AiProviderName;
    base_url: string;
    api_key: string;
    model: string;
    embedding_model: string;
}): Promise<{ ok: boolean; message?: string; aiProvider?: AiProviderPayload }> {
    const response = await fetch('/trace-apu/provider', {
        method: 'PUT',
        headers: jsonHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify(payload),
    });
    const body = await parseJsonSafe<{
        message?: string;
        aiProvider?: AiProviderPayload;
        errors?: Record<string, string[]>;
    }>(response);

    if (!response.ok) {
        return { ok: false, message: body?.message ?? Object.values(body?.errors ?? {})[0]?.[0] ?? 'Gagal menyimpan.' };
    }

    return { ok: true, message: body?.message, aiProvider: body?.aiProvider };
}

/** List models the configured key can actually use. */
export async function fetchAiProviderModels(): Promise<{
    ok: boolean;
    message?: string;
    models: AiProviderModel[];
    count?: number;
}> {
    const response = await fetch('/trace-apu/provider/models', {
        headers: jsonHeaders(),
        credentials: 'same-origin',
    });
    const body = await parseJsonSafe<{ message?: string; models?: AiProviderModel[]; count?: number }>(response);

    return {
        ok: response.ok,
        message: body?.message,
        models: body?.models ?? [],
        count: body?.count,
    };
}
