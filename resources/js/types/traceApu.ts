import type { AiAnalysisResult } from '@/types/ai';

export interface TraceApuSource {
    title: string;
    url: string;
}

export interface TrendInsightItem {
    id: number;
    title: string;
    summary: string;
    category: 'format' | 'topic' | 'hashtag' | 'audio' | 'news' | string;
    momentum: 'rising' | 'steady' | 'declining' | string;
    relevance_score: number;
    hook_ideas: Array<{ hook: string; rationale: string }>;
    content_ideas: string[];
    sources: TraceApuSource[];
    refreshed_at: string | null;
}

export interface TrendHook {
    id: string;
    category: string;
    text: string;
    rationale: string;
    trend: string;
}

export interface TraceApuHistoryEntry {
    role: 'user' | 'assistant' | string;
    content: string;
}

export interface TraceApuInstructions {
    persona: string;
    rules: string[];
}

export interface TraceApuPanelPayload {
    configured: boolean;
    scope: string;
    greeting: string;
    trends: Array<{ id: number; title: string; momentum: string; category: string }>;
    history: TraceApuHistoryEntry[];
    instructions: TraceApuInstructions;
}

export interface CaptionSuggestion {
    content_ref: string;
    caption: string;
    rationale: string;
}

export interface TraceApuStreamEvent {
    type: 'delta' | 'tool' | 'done' | 'error';
    content?: string;
    answer?: string;
    message?: string;
    suggestions?: CaptionSuggestion[];
}

export interface TrendFeed {
    trends: TrendInsightItem[];
    hooks: TrendHook[];
    configured: boolean;
    lastRefreshed: string | null;
}

export interface TraceApuDraft {
    draft: Partial<AiAnalysisResult> & {
        hook?: string;
        body?: string;
        cta?: string;
        relevance_score?: number;
    };
}
