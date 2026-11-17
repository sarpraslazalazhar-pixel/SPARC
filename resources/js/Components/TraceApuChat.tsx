import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@inertiajs/react';
import {
    AlertCircle,
    ArrowUpRight,
    Bot,
    CheckCircle2,
    Eraser,
    Lightbulb,
    Loader2,
    Send,
    Settings2,
    Sparkles,
    TrendingUp,
} from 'lucide-react';
import { Button } from '@/Components/UI/Button';
import { useToast } from '@/Components/UI/Toast';
import {
    applyTraceApuCaption,
    fetchTraceApuPanel,
    forgetTraceApuHistory,
    historyTurns,
    saveTraceApuInstructions,
    streamTraceApuTurn,
} from '@/lib/traceApu';
import type { CaptionSuggestion, TraceApuHistoryEntry, TraceApuPanelPayload } from '@/types/traceApu';

interface TraceApuChatProps {
    scope?: 'global' | `studio:${string}`;
    onApplyHook?: (hook: string) => void;
    /** Called when the user applies a caption the agent proposed. Without it, the caption is copied. */
    onApplyCaption?: (caption: string, contentRef: string) => void;
    className?: string;
    compact?: boolean;
}

interface ChatTurn {
    role: 'user' | 'assistant';
    content: string;
}

const SUGGESTIONS = [
    'Tren apa yang cocok untuk konten edukasi minggu ini?',
    'Tulis 3 hook untuk konten pengumuman layanan baru.',
    'Caption mana di workspace yang paling berisiko?',
];

export function TraceApuChat({ scope = 'global', onApplyHook, onApplyCaption, className, compact = false }: TraceApuChatProps) {
    const { success, error: toastError } = useToast();
    const [panel, setPanel] = useState<TraceApuPanelPayload | null>(null);
    const [turns, setTurns] = useState<ChatTurn[]>([]);
    const [input, setInput] = useState('');
    const [pending, setPending] = useState(false);
    const [activity, setActivity] = useState<string | null>(null);
    const [failure, setFailure] = useState<string | null>(null);
    const [showSteering, setShowSteering] = useState(false);
    const [persona, setPersona] = useState('');
    const [rules, setRules] = useState('');
    const [suggestions, setSuggestions] = useState<CaptionSuggestion[]>([]);
    const listRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        void fetchTraceApuPanel(scope).then((payload) => {
            if (cancelled || !payload) {
                return;
            }
            setPanel(payload);
            setPersona(payload.instructions.persona);
            setRules(payload.instructions.rules.join('\n'));
            setTurns(historyTurns(payload.history).map((entry: TraceApuHistoryEntry) => ({
                role: entry.role === 'assistant' ? 'assistant' : 'user',
                content: entry.content,
            })));
        });

        return () => {
            cancelled = true;
        };
    }, [scope]);

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }, [turns, activity]);

    const handleSend = useCallback(
        async (message: string) => {
            const question = message.trim();
            if (!question || pending) {
                return;
            }

            setInput('');
            setFailure(null);
            setPending(true);
            setActivity('Menghubungi TRACE APU...');
            setTurns((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: '' }]);

            const appendDelta = (delta: string) =>
                setTurns((prev) => {
                    const last = prev.at(-1);
                    if (last?.role !== 'assistant') {
                        return prev;
                    }

                    return [...prev.slice(0, -1), { ...last, content: last.content + delta }];
                });

            try {
                const final = await streamTraceApuTurn(
                    { message: question, scope },
                    (event) => {
                        if (event.type === 'delta' && event.content) {
                            setActivity(null);
                            appendDelta(event.content);
                        }
                        if (event.type === 'tool' && event.content) {
                            setActivity(event.content);
                        }
                        if (event.type === 'error') {
                            setFailure(event.message ?? 'TRACE APU gagal menjawab.');
                        }
                    }
                );

                if (final?.answer) {
                    setTurns((prev) =>
                        prev.map((turn, index) => (index === prev.length - 1 ? { ...turn, content: final.answer ?? '' } : turn))
                    );
                }
                setSuggestions(final?.suggestions ?? []);
            } catch {
                setFailure('Koneksi terputus. Periksa jaringan lalu coba lagi.');
            } finally {
                setActivity(null);
                setPending(false);
            }
        },
        [pending, scope]
    );

    const handleSteeringSave = useCallback(async () => {
        const ok = await saveTraceApuInstructions(
            scope,
            persona,
            rules.split('\n').map((rule) => rule.trim()).filter(Boolean)
        );
        if (ok) {
            setPanel((prev) => (prev ? { ...prev, instructions: { persona, rules: rules.split('\n').filter(Boolean) } } : prev));
        }
        setShowSteering(!ok);
    }, [persona, rules, scope]);

    const handleForget = useCallback(async () => {
        if (!(await forgetTraceApuHistory(scope))) {
            return;
        }
        setTurns([]);
        setSuggestions([]);
        setFailure(null);
    }, [scope]);

    const handleApplyCaption = useCallback(
        async (suggestion: CaptionSuggestion) => {
            const applied = await applyTraceApuCaption(suggestion.content_ref, suggestion.caption);
            if (applied.ok) {
                success('Caption Tersimpan', applied.message);
                onApplyCaption?.(suggestion.caption, suggestion.content_ref);
                setSuggestions((prev) => prev.filter((entry) => entry.caption !== suggestion.caption));

                return;
            }
            if (applied.message) {
                toastError('Caption Gagal Disimpan', applied.message);

                return;
            }
            try {
                await navigator.clipboard.writeText(suggestion.caption);
            } catch {
                /* clipboard blocked: caption stays visible in the card */
            }
        },
        [onApplyCaption, success, toastError]
    );

    const hooks = (turns.at(-1)?.content.match(/^[^\n]{15,160}$/gm) ?? []).slice(0, 3);
    const notConfigured = panel !== null && !panel.configured;

    return (
        <div
            className={`rounded-3xl border border-[var(--md-sys-color-outline-variant)]/60 bg-[var(--md-sys-color-surface-container-low)] ${className ?? ''}`}
        >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--md-sys-color-outline-variant)]/60 px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]">
                        <Bot className="h-3.5 w-3.5" />
                    </span>
                    <div>
                        <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">TRACE APU</p>
                        <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                            Social Media Planner, Analytic &amp; Report Content
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        aria-label="Atur instruksi TRACE APU"
                        onClick={() => setShowSteering((prev) => !prev)}
                        className="rounded-lg p-1.5 text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)]"
                    >
                        <Settings2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        aria-label="Hapus riwayat percakapan"
                        onClick={handleForget}
                        className="rounded-lg p-1.5 text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)]"
                    >
                        <Eraser className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            {showSteering && (
                <div className="space-y-2 border-b border-[var(--md-sys-color-outline-variant)]/60 px-4 py-3">
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
                        Persona
                        <textarea
                            rows={2}
                            value={persona}
                            onChange={(event) => setPersona(event.target.value)}
                            className="mt-1 w-full rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-2 text-xs font-normal text-[var(--md-sys-color-on-surface)]"
                        />
                    </label>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
                        Aturan (satu per baris)
                        <textarea
                            rows={3}
                            value={rules}
                            onChange={(event) => setRules(event.target.value)}
                            placeholder={'Selalu sebut sumber.\\nMaksimal 5 poin.'}
                            className="mt-1 w-full rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-2 text-xs font-normal text-[var(--md-sys-color-on-surface)]"
                        />
                    </label>
                    <Button variant="secondary" size="sm" onClick={handleSteeringSave} className="w-full justify-center">
                        Simpan Steering
                    </Button>
                </div>
            )}

            <div
                ref={listRef}
                className={`space-y-2 overflow-y-auto px-4 py-3 ${compact ? 'max-h-56' : 'max-h-96'}`}
            >
                {panel === null && (
                    <div className="flex items-center gap-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Memuat memori TRACE APU...
                    </div>
                )}

                {notConfigured && (
                    <div className="flex items-start gap-2 rounded-2xl border border-[var(--md-sys-color-error)]/30 bg-[var(--md-sys-color-error-container)]/40 p-3 text-xs text-[var(--md-sys-color-on-surface)]">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--md-sys-color-error)]" />
                        <span>Isi <code>GEMINI_API_KEY</code> di server agar TRACE APU bisa menjawab.</span>
                    </div>
                )}

                {turns.length === 0 && panel !== null && !notConfigured && (
                    <p className="text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
                        {panel.greeting}
                    </p>
                )}

                {turns.map((turn, index) => (
                    <div
                        key={`turn-${index}`}
                        className={
                            turn.role === 'user'
                                ? 'ml-auto max-w-[85%] rounded-2xl bg-[var(--md-sys-color-primary-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-primary-container)]'
                                : 'mr-auto max-w-[90%] rounded-2xl border border-[var(--md-sys-color-outline-variant)]/60 bg-[var(--md-sys-color-surface)] px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-[var(--md-sys-color-on-surface)]'
                        }
                    >
                        {turn.content}
                    </div>
                ))}

                {activity && (
                    <div className="flex items-center gap-2 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                        <Loader2 className="h-3 w-3 animate-spin text-[var(--md-sys-color-primary)]" />
                        {activity}
                    </div>
                )}

                {failure && (
                    <div className="flex items-start gap-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--md-sys-color-error)]" />
                        <span>{failure}</span>
                    </div>
                )}

                {suggestions.length > 0 && (
                    <div className="space-y-2 rounded-2xl border border-[var(--md-sys-color-primary)]/30 bg-[var(--md-sys-color-surface)] p-3">
                        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--md-sys-color-primary)]">
                            <Sparkles className="h-3 w-3" />
                            Usulan revisi caption
                        </p>
                        {suggestions.map((suggestion, index) => (
                            <div key={`suggestion-${index}`} className="space-y-1.5">
                                <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--md-sys-color-on-surface)]">
                                    {suggestion.caption}
                                </p>
                                {suggestion.rationale && (
                                    <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{suggestion.rationale}</p>
                                )}
                                <Button
                                    size="sm"
                                    variant="primary"
                                    onClick={() => void handleApplyCaption(suggestion)}
                                    className="h-7 px-2"
                                >
                                    {onApplyCaption ? 'Terapkan caption ini' : 'Salin caption'}
                                </Button>
                            </div>
                        ))}
                    </div>
                )}

                {onApplyHook && hooks.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
                            <Lightbulb className="h-3 w-3 text-[var(--md-sys-color-primary)]" />
                            Pakai sebagai hook
                        </p>
                        {hooks.map((hook, index) => (
                            <button
                                key={`agent-hook-${index}`}
                                type="button"
                                onClick={() => onApplyHook(hook)}
                                className="block w-full rounded-2xl border border-[var(--md-sys-color-outline-variant)]/60 bg-[var(--md-sys-color-surface)] px-3 py-2 text-left text-xs text-[var(--md-sys-color-on-surface)] hover:border-[var(--md-sys-color-primary)]/60"
                            >
                                {hook}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {turns.length === 0 && panel !== null && !notConfigured && (
                <div className="flex flex-wrap gap-1.5 px-4 pb-2">
                    {SUGGESTIONS.map((suggestion) => (
                        <button
                            key={suggestion}
                            type="button"
                            onClick={() => handleSend(suggestion)}
                            className="rounded-full border border-[var(--md-sys-color-outline-variant)]/60 bg-[var(--md-sys-color-surface)] px-2.5 py-1 text-[10px] text-[var(--md-sys-color-on-surface)] hover:border-[var(--md-sys-color-primary)]/60"
                        >
                            {suggestion}
                        </button>
                    ))}
                </div>
            )}

            {panel?.trends && panel.trends.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-4 pb-2">
                    {panel.trends.map((trend) => (
                        <span
                            key={trend.id}
                            className="inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-surface-container)] px-2 py-0.5 text-[10px] text-[var(--md-sys-color-on-surface-variant)]"
                        >
                            <TrendingUp className="h-2.5 w-2.5 text-[var(--md-sys-color-primary)]" />
                            {trend.title}
                        </span>
                    ))}
                    <Link
                        href="/trends"
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--md-sys-color-primary)]"
                    >
                        Semua tren
                        <ArrowUpRight className="h-2.5 w-2.5" />
                    </Link>
                </div>
            )}

            {/* Not a <form>: this component is embedded inside the content detail form,
                and nested forms make the browser drop the outer submit. */}
            <div
                className="flex items-end gap-2 border-t border-[var(--md-sys-color-outline-variant)]/60 p-3"
                onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void handleSend(input);
                    }
                }}
            >
                <input
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Tanya TRACE APU soal konten, tren, atau caption..."
                    aria-label="Pesan untuk TRACE APU"
                    disabled={pending || notConfigured}
                    className="min-w-0 flex-1 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/30"
                />
                <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() => void handleSend(input)}
                    disabled={pending || notConfigured || input.trim() === ''}
                    icon={
                        pending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : turns.length === 0 ? (
                            <Sparkles className="h-3.5 w-3.5" />
                        ) : (
                            <Send className="h-3.5 w-3.5" />
                        )
                    }
                >
                    Kirim
                </Button>
            </div>

            {turns.length > 0 && (
                <div className="flex items-center justify-end px-4 pb-3 text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                    <CheckCircle2 className="mr-1 h-2.5 w-2.5 text-[var(--md-sys-color-success)]" />
                    Memori percakapan tersimpan untuk ruang ini
                </div>
            )}
        </div>
    );
}

export default TraceApuChat;
