export type AiReviewStatusLabel = 'Perlu Perbaikan Utama' | 'Cukup Baik' | 'Siap Tayang';

export interface AiSuggestedCaption {
    style: string;
    text: string;
}

export interface AiReviewResult {
    overall_score: number;
    status_label: AiReviewStatusLabel;
    metrics_breakdown: {
        hook_strength: number;
        message_clarity: number;
        cta_effectiveness: number;
    };
    executive_summary: string;
    strengths: string[];
    improvements: string[];
    actionable_next_steps: string[];
    suggested_captions: AiSuggestedCaption[];
}

export interface AiDigestResult {
    headline: string;
    summary: string;
    winning_patterns: string[];
    audience_preferences: string[];
    pillar_recommendations: string[];
}

export interface AiAnalysisPayload<T = AiReviewResult | AiDigestResult> {
    id: number;
    type: 'pre_publish' | 'post_publish' | 'periodic_digest';
    status: 'queued' | 'completed' | 'failed';
    model: string;
    analyzed_at: string | null;
    result: T | null;
}

export interface AiAnalysisEnvelope<T = AiReviewResult | AiDigestResult> {
    configured?: boolean;
    analysis: AiAnalysisPayload<T> | null;
}
