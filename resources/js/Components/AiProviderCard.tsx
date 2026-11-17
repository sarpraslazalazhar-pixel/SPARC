import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, Loader2, RefreshCw, Server, Sparkles } from 'lucide-react';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
import { useToast } from '@/Components/UI/Toast';
import { fetchAiProviderModels, saveAiProvider, type AiProviderModel, type AiProviderName } from '@/lib/traceApu';
import type { SparcSystemSettings } from '@/types/sparc';

interface AiProviderCardProps {
    ai?: SparcSystemSettings['ai'];
    onSaved?: (payload: NonNullable<SparcSystemSettings['ai']>) => void;
}

const PROVIDERS: Array<{ value: AiProviderName; label: string; hint: string }> = [
    { value: 'gemini', label: 'Google Gemini', hint: 'gemini-2.5-flash, gemini-embedding-001' },
    { value: 'openai', label: 'OpenAI-compatible', hint: 'gateway /v1 apa pun: 9router, OpenRouter, LM Studio' },
];

const KEY_SOURCE_LABEL: Record<string, string> = {
    database: 'API key tersimpan di database',
    env: 'API key dari .env',
    none: 'API key belum diisi',
};

export function AiProviderCard({ ai, onSaved }: AiProviderCardProps) {
    const { success, error: toastError } = useToast();
    const [provider, setProvider] = useState<AiProviderName>(ai?.provider ?? 'gemini');
    const [baseUrl, setBaseUrl] = useState(ai?.base_url ?? '');
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState(ai?.model ?? '');
    const [embeddingModel, setEmbeddingModel] = useState(ai?.embedding_model ?? '');
    const [saved, setSaved] = useState(ai);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [models, setModels] = useState<AiProviderModel[]>([]);
    const [modelsError, setModelsError] = useState<string | null>(null);
    const [fetchedAt, setFetchedAt] = useState<string | null>(null);

    const generateModels = useMemo(() => models.filter((entry) => entry.supports_generate), [models]);
    const embedModels = useMemo(() => models.filter((entry) => entry.supports_embedding), [models]);

    const loadModels = useCallback(async () => {
        setIsLoadingModels(true);
        setModelsError(null);

        const result = await fetchAiProviderModels();

        if (!result.ok) {
            setModelsError(result.message ?? 'Gagal mengambil daftar model.');
            setModels([]);
        } else {
            setModels(result.models);
            setFetchedAt(new Date().toLocaleTimeString('id-ID'));
            if (result.models.length === 0) {
                setModelsError('Endpoint tidak mengembalikan model apa pun untuk key ini.');
            }
        }
        setIsLoadingModels(false);
    }, []);

    useEffect(() => {
        // Auto-discover once when a key already exists, so admins see real options.
        if (ai?.has_api_key) {
            void loadModels();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsSaving(true);

        const result = await saveAiProvider({
            provider,
            base_url: baseUrl.trim(),
            api_key: apiKey.trim(),
            model: model.trim(),
            embedding_model: embeddingModel.trim(),
        });

        setIsSaving(false);

        if (!result.ok || !result.aiProvider) {
            toastError('Gagal Menyimpan', result.message ?? 'Periksa URL endpoint.');
            return;
        }

        setSaved(result.aiProvider);
        setApiKey('');
        onSaved?.(result.aiProvider);
        success('Konfigurasi AI Disimpan', 'Kunci dan model langsung dipakai TRACE APU.');
        void loadModels();
    };

    const hasKey = saved?.has_api_key ?? ai?.has_api_key ?? false;

    return (
        <div className="p-5 rounded-2xl bg-[var(--md-sys-color-surface)] dark:bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-elevation-1)] space-y-4">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--md-sys-color-outline-variant)]">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] flex items-center justify-center shrink-0">
                        <Bot className="w-4 h-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">Konfigurasi TRACE APU</h3>
                        <p className="text-xs text-[var(--md-sys-color-on-surface-muted)]">
                            Endpoint, API key, dan model AI yang dipakai analisis konten
                        </p>
                    </div>
                </div>
                <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                        hasKey
                            ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]'
                            : 'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]'
                    }`}
                >
                    <CheckCircle2 className="w-3 h-3" />
                    {KEY_SOURCE_LABEL[saved?.key_source ?? ai?.key_source ?? 'none'] ?? 'Belum aktif'}
                </span>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5">
                <div className="space-y-1.5">
                    <span className="sparc-eyebrow block">Format API</span>
                    <div className="flex flex-wrap gap-1.5">
                        {PROVIDERS.map((entry) => (
                            <button
                                key={entry.value}
                                type="button"
                                title={entry.hint}
                                onClick={() => setProvider(entry.value)}
                                className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${
                                    provider === entry.value
                                        ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
                                        : 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-muted)] hover:border-[var(--md-sys-color-primary)]/60'
                                }`}
                            >
                                {entry.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                        {PROVIDERS.find((entry) => entry.value === provider)?.hint}
                    </p>
                </div>

                <Input
                    label="Base URL Endpoint"
                    placeholder={
                        provider === 'openai'
                            ? 'http://localhost:20128/v1'
                            : 'https://generativelanguage.googleapis.com/v1beta'
                    }
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                />
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-muted)] -mt-2">
                    Kosongkan untuk memakai default {saved?.resolved_base_url ?? ai?.resolved_base_url ?? (provider === 'openai' ? 'endpoint OpenAI-compatible' : 'endpoint Gemini')}.
                </p>

                <Input
                    type="password"
                    label="API Key"
                    placeholder={hasKey ? '•••••••• (tersimpan — isi untuk mengganti)' : 'Tempelkan API key provider'}
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    helperText="Disimpan terenkripsi. Kosongkan bila tidak ingin mengganti key yang ada."
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                        label="Model Analisis"
                        placeholder={provider === 'openai' ? 'comboGanas' : 'gemini-2.5-flash'}
                        value={model}
                        onChange={(event) => setModel(event.target.value)}
                    />
                    <Input
                        label="Model Embedding"
                        placeholder={provider === 'openai' ? 'model embedding gateway' : 'gemini-embedding-001'}
                        value={embeddingModel}
                        onChange={(event) => setEmbeddingModel(event.target.value)}
                    />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        isLoading={isLoadingModels}
                        icon={<RefreshCw className="w-3.5 h-3.5" />}
                        onClick={() => void loadModels()}
                    >
                        Cek Model Tersedia
                    </Button>
                    <Button type="submit" variant="primary" size="sm" isLoading={isSaving}>
                        Simpan Konfigurasi
                    </Button>
                </div>
            </form>

            <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)] space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <span className="sparc-eyebrow block">Model dari endpoint</span>
                    <span className="text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                        {fetchedAt ? `${models.length} model • ${fetchedAt}` : 'Belum dicek'}
                    </span>
                </div>

                {isLoadingModels && (
                    <div className="flex items-center gap-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Menanyakan daftar model...
                    </div>
                )}

                {modelsError && !isLoadingModels && (
                    <p className="text-xs text-[var(--md-sys-color-error)]">{modelsError}</p>
                )}

                {generateModels.length > 0 && (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                        {generateModels.map((entry) => (
                            <button
                                key={entry.id}
                                type="button"
                                onClick={() => setModel(entry.id)}
                                className={`w-full text-left p-2.5 rounded-xl border text-xs transition-colors ${
                                    (model || saved?.model) === entry.id
                                        ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]/40'
                                        : 'border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] hover:border-[var(--md-sys-color-primary)]/60'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-[var(--md-sys-color-on-surface)]">{entry.label || entry.id}</span>
                                    <span className="sparc-code-id text-[10px] text-[var(--md-sys-color-on-surface-muted)]">{entry.id}</span>
                                </div>
                                {entry.input_tokens && (
                                    <p className="text-[10px] text-[var(--md-sys-color-on-surface-muted)] mt-0.5">
                                        Input {entry.input_tokens.toLocaleString('id-ID')} token
                                        {entry.output_tokens ? ` · Output ${entry.output_tokens.toLocaleString('id-ID')}` : ''}
                                    </p>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {embedModels.length > 0 && (
                    <div className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--md-sys-color-on-surface-muted)]">
                            Model embedding ({embedModels.length})
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                            {embedModels.map((entry) => (
                                <button
                                    key={entry.id}
                                    type="button"
                                    onClick={() => setEmbeddingModel(entry.id)}
                                    className="px-2 py-0.5 rounded-full border border-[var(--md-sys-color-outline-variant)] text-[10px] sparc-code-id hover:border-[var(--md-sys-color-primary)]/60"
                                >
                                    {entry.id}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex items-start gap-2 p-2.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                    <Server className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                        Pemeriksaan memakai endpoint dan key yang <b>sudah tersimpan</b>. Simpan dulu bila baru mengubahnya.
                        {provider === 'openai'
                            ? 'Semua model gateway dipakai untuk analisis; pencarian konten butuh model embedding terpisah.'
                            : 'Hanya model dengan dukungan generateContent yang cocok untuk analisis, dan embedContent untuk pencarian konten.'}
                    </span>
                </div>

                {(saved ?? ai)?.model && (
                    <p className="flex items-center gap-1.5 text-[11px] text-[var(--md-sys-color-on-surface-muted)]">
                        <Sparkles className="w-3 h-3" />
                        Aktif: {(saved ?? ai)?.model} · embedding {(saved ?? ai)?.embedding_model}
                    </p>
                )}
            </div>
        </div>
    );
}

export default AiProviderCard;
