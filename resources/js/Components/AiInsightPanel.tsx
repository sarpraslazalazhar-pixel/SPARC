import React from 'react';
import { AlertTriangle, Check, Copy, Lightbulb, Rocket, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AiReviewResult } from '@/types/aiAnalysis';

export function aiScoreTone(score: number): { label: string; className: string } {
    if (score >= 80) {
        return {
            label: 'Siap Tayang',
            className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
        };
    }
    if (score >= 60) {
        return {
            label: 'Cukup Baik',
            className: 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/40',
        };
    }

    return {
        label: 'Perlu Perbaikan Utama',
        className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40',
    };
}

export const AiScoreBadge: React.FC<{ score: number; className?: string }> = ({ score, className }) => {
    const tone = aiScoreTone(score);

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold',
                tone.className,
                className
            )}
        >
            <Sparkles className="w-3 h-3" />
            {score}/100 · {tone.label}
        </span>
    );
};

const BulletList: React.FC<{ title: string; icon: React.ReactNode; items: string[]; tone?: string }> = ({
    title,
    icon,
    items,
    tone,
}) => {
    if (items.length === 0) {
        return null;
    }

    return (
        <div className="space-y-1.5">
            <p className={cn('text-[11px] font-bold uppercase tracking-wide flex items-center gap-1.5', tone)}>
                {icon}
                {title}
            </p>
            <ul className="space-y-1">
                {items.map((item) => (
                    <li
                        key={item}
                        className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-1 before:text-[var(--md-sys-color-on-surface-muted)]"
                    >
                        {item}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export const AiInsightPanel: React.FC<{
    result: AiReviewResult;
    onApplyCaption?: (caption: string) => void;
    className?: string;
}> = ({ result, onApplyCaption, className }) => {
    const [copied, setCopied] = React.useState<string | null>(null);

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(text);
            window.setTimeout(() => setCopied(null), 1600);
        } catch {
            setCopied(null);
        }
    };

    return (
        <div className={cn('space-y-4', className)}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <AiScoreBadge score={result.overall_score} />
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--md-sys-color-on-surface-muted)]">
                    <span>Hook {result.metrics_breakdown.hook_strength}</span>
                    <span>·</span>
                    <span>Pesan {result.metrics_breakdown.message_clarity}</span>
                    <span>·</span>
                    <span>CTA {result.metrics_breakdown.cta_effectiveness}</span>
                    {result.metrics_breakdown.visual_readability !== null && (
                        <>
                            <span>·</span>
                            <span>Visual {result.metrics_breakdown.visual_readability}</span>
                        </>
                    )}
                </div>
            </div>

            {result.executive_summary !== '' && (
                <p className="text-xs leading-relaxed text-[var(--md-sys-color-on-surface)] p-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]/60">
                    {result.executive_summary}
                </p>
            )}

            <BulletList
                title="Kelebihan"
                icon={<Check className="w-3 h-3" />}
                items={result.strengths}
                tone="text-emerald-700 dark:text-emerald-300"
            />
            <BulletList
                title="Area Perbaikan"
                icon={<AlertTriangle className="w-3 h-3" />}
                items={result.improvements}
                tone="text-amber-700 dark:text-amber-300"
            />
            <BulletList
                title="Rekomendasi Aksi"
                icon={<Rocket className="w-3 h-3" />}
                items={result.actionable_next_steps}
                tone="text-[var(--md-sys-color-primary)]"
            />

            {result.suggested_captions.length > 0 && (
                <div className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide flex items-center gap-1.5 text-[var(--md-sys-color-primary)]">
                        <Lightbulb className="w-3 h-3" />
                        Alternatif Caption
                    </p>
                    {result.suggested_captions.map((caption) => (
                        <div
                            key={caption.text}
                            className="p-3 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] space-y-2"
                        >
                            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--md-sys-color-on-surface-muted)]">
                                {caption.style}
                            </p>
                            <p className="text-xs leading-relaxed whitespace-pre-wrap text-[var(--md-sys-color-on-surface)]">
                                {caption.text}
                            </p>
                            <div className="flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => copy(caption.text)}
                                    className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] cursor-pointer"
                                >
                                    {copied === caption.text ? (
                                        <Check className="w-3 h-3" />
                                    ) : (
                                        <Copy className="w-3 h-3" />
                                    )}
                                    {copied === caption.text ? 'Tersalin' : 'Salin'}
                                </button>
                                {onApplyCaption && (
                                    <button
                                        type="button"
                                        onClick={() => onApplyCaption(caption.text)}
                                        className="text-[11px] font-bold px-2 py-1 rounded-lg bg-[var(--md-sys-color-primary-filled)] text-[var(--md-sys-color-on-primary)] cursor-pointer"
                                    >
                                        Terapkan ke Draft
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
