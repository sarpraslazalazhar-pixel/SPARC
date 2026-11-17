export interface AiHookIdea {
    hook: string;
    rationale: string;
}

export interface AiAnalysisResult {
    summary: string;
    strengths: string[];
    improvements: string[];
    hook_ideas: AiHookIdea[];
    hashtags: string[];
    engagement_tips: string[];
    readability_score: number;
    risk_flags: string[];
    trend_context?: string | null;
}

export type AiAnalysisStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface AiAnalysisResponse {
    id: number;
    status: AiAnalysisStatus;
    result?: AiAnalysisResult | null;
    error?: string | null;
}
