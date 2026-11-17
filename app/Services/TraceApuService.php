<?php

namespace App\Services;

use App\Models\AiSetting;
use App\Models\ContentItem;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Prism\Prism\Facades\Prism;
use Prism\Prism\Streaming\Events\TextDeltaEvent;
use Prism\Prism\Streaming\Events\ToolCallEvent;
use Prism\Prism\Streaming\Events\ToolResultEvent;
use Prism\Prism\ValueObjects\Messages\AssistantMessage;
use Prism\Prism\ValueObjects\Messages\ToolResultMessage;
use Prism\Prism\ValueObjects\Messages\UserMessage;
use Prism\Prism\ValueObjects\ToolCall;
use Prism\Prism\ValueObjects\ToolResult;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

/**
 * TRACE APU — the SPARC content analyst agent.
 *
 * Mirrors a standard agent loop: a bounded multi-step tool loop over a
 * conversation transcript, with memory that outlives the request
 * (Cache-backed transcript + per-scope steering instructions).
 */
class TraceApuService
{
    public const MAX_STEPS = 5;

    public const MAX_TURNS = 10;

    private const INSTRUCTIONS_DEFAULT = [
        'persona' => 'Analis konten media sosial tim Humas kepolisian. Bahasa Indonesia santai-profesional, jawaban padat, selalu actionable.',
        'rules' => [],
    ];

    /**
     * Last completed turn: tool calls, focused content, caption proposals.
     *
     * @var array{tools: list<array{name: string, arguments: array<string, mixed>, result: mixed}>, content_ref: string|null, suggestions: list<array{content_ref: string, caption: string, rationale: string}>}
     */
    private array $lastTurn = ['tools' => [], 'content_ref' => null, 'suggestions' => []];

    /**
     * Caption proposals from the last turn, exposed to the frontend as one-click applies.
     *
     * @var list<array{content_ref: string, caption: string, rationale: string}>
     */
    private array $lastSuggestions = [];

    public function __construct(
        private readonly TraceApuCorpusService $corpus,
        private readonly TraceApuToolRegistry $tools,
    ) {}

    public function isConfigured(): bool
    {
        return (bool) config('prism.providers.'.AiSetting::provider().'.api_key');
    }

    /**
     * Persisted steering instructions for a scope (`global` or `studio:<id>`).
     *
     * @return array{persona: string, rules: list<string>}
     */
    public function instructions(string $scope): array
    {
        $stored = (array) Cache::get($this->instructionsKey($scope), []);

        return [
            'persona' => trim((string) ($stored['persona'] ?? '')) ?: self::INSTRUCTIONS_DEFAULT['persona'],
            'rules' => array_values(array_filter(array_map(
                static fn ($rule): string => trim((string) $rule),
                (array) ($stored['rules'] ?? [])
            ))),
        ];
    }

    /**
     * @param  array{persona?: string, rules?: list<string>}  $patch
     * @return array{persona: string, rules: list<string>}
     */
    public function saveInstructions(string $scope, array $patch): array
    {
        $instructions = [
            'persona' => trim((string) ($patch['persona'] ?? '')) ?: self::INSTRUCTIONS_DEFAULT['persona'],
            'rules' => array_values(array_filter(array_map(
                static fn ($rule): string => trim((string) $rule),
                (array) ($patch['rules'] ?? [])
            ))),
        ];

        Cache::forever($this->instructionsKey($scope), $instructions);

        return $instructions;
    }

    /**
     * @return list<array{role: string, content: string}>
     */
    public function history(string $scope): array
    {
        return array_values(array_filter((array) Cache::get($this->historyKey($scope), []), 'is_array'));
    }

    public function forget(string $scope): void
    {
        Cache::forget($this->historyKey($scope));
    }

    /**
     * Persist one exchange. `tools` keeps the calls the agent made so the next
     * turn can rebuild a valid transcript and keep the focused content item.
     *
     * @param  list<array{name: string, arguments: array<string, mixed>, result: mixed}>  $tools
     * @param  list<string|int>  $proposals  References of captions proposed in this turn.
     */
    public function appendTurn(string $scope, string $question, string $answer, array $tools = [], string|int|null $contentRef = null, array $proposals = []): void
    {
        $history = $this->history($scope);
        $history[] = ['role' => 'user', 'content' => mb_substr($question, 0, 2000)];
        $history[] = array_filter([
            'role' => 'assistant',
            'content' => mb_substr($answer, 0, 4000),
            'tools' => $tools !== [] ? $tools : null,
            'content_ref' => $contentRef,
            'suggestions' => $proposals !== [] ? $proposals : null,
        ], static fn ($value): bool => $value !== null);
        $history = array_slice($history, -self::MAX_TURNS * 2);

        Cache::forever($this->historyKey($scope), $history);
    }

    /**
     * Stream one agent turn as NDJSON events (`tool`, `done`, `error`).
     */
    public function stream(string $scope, string $question, bool $fresh = false): StreamedResponse
    {
        return response()->stream(function () use ($scope, $question, $fresh): void {
            $emit = static function (array $event): void {
                echo json_encode($event, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), "\n";

                if (ob_get_level() > 0) {
                    @ob_flush();
                }

                @flush();
            };

            try {
                $answer = $this->run($scope, $question, $fresh, static function (array $event) use ($emit): void {
                    $emit($event);
                });

                $turn = $this->lastTurn;
                $this->appendTurn($scope, $question, $answer, $turn['tools'], $turn['content_ref'], $turn['suggestions']);
                $emit([
                    'type' => 'done',
                    'answer' => $answer,
                    'suggestions' => $this->lastSuggestions,
                ]);
            } catch (Throwable $exception) {
                report($exception);
                $emit(['type' => 'error', 'message' => 'TRACE APU gagal menjawab: '.$exception->getMessage()]);
            }
        }, 200, [
            'Content-Type' => 'application/x-ndjson; charset=utf-8',
            'Cache-Control' => 'no-cache, no-transform',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    /**
     * Draft a Studio script with structured output (no tools).
     *
     * @return array<string, mixed>
     */
    public function draft(string $scope, string $question): array
    {
        $response = Prism::structured()
            ->using(AiSetting::provider(), $this->model())
            ->withSchema($this->tools->draftSchema())
            ->withSystemPrompt($this->systemPrompt($scope))
            ->withPrompt($question)
            ->withMaxTokens(1500)
            ->withClientOptions(['timeout' => $this->timeout()])
            ->asStructured();

        return (array) ($response->structured ?? []);
    }

    /**
     * Run one agent turn and collect everything the transcript needs.
     *
     * Tokens are streamed through `$onStep` as `delta` events while tool calls,
     * the focused content and caption proposals are accumulated side by side.
     *
     * @param  (callable(array{type: string, content?: string}): void)|null  $onStep
     */
    public function run(string $scope, string $question, bool $fresh, ?callable $onStep = null): string
    {
        [$messages, $focus] = $this->restoreMessages($fresh ? [] : $this->history($scope));
        $messages[] = new UserMessage(trim($question) !== '' ? $question : 'Halo TRACE APU');

        $logged = [];
        $suggestions = [];
        $focused = $focus instanceof ContentItem ? (string) ($focus->content_id ?: $focus->getKey()) : null;
        $answer = '';

        $stream = Prism::text()
            ->using(AiSetting::provider(), $this->model())
            ->withSystemPrompt($this->systemPrompt($scope, $question, $focus))
            ->withMessages($messages)
            ->withTools($this->tools->tools())
            ->withMaxSteps(self::MAX_STEPS)
            ->withMaxTokens(2048)
            ->withClientOptions(['timeout' => $this->timeout()])
            ->asStream();

        foreach ($stream as $event) {
            if ($event instanceof TextDeltaEvent) {
                $answer .= $event->delta;
                $onStep?->__invoke(['type' => 'delta', 'content' => $event->delta]);

                continue;
            }

            if ($event instanceof ToolCallEvent) {
                $arguments = $event->toolCall->arguments();
                $onStep?->__invoke(['type' => 'tool', 'content' => 'Memanggil '.$this->toolLabel($event->toolCall->name).'...']);
                $logged[] = ['name' => $event->toolCall->name, 'arguments' => $arguments, 'result' => null];

                continue;
            }

            if (! $event instanceof ToolResultEvent) {
                continue;
            }

            $name = $event->toolResult->toolName;
            $result = $event->toolResult->result;

            foreach ($logged as $key => $entry) {
                if ($entry['name'] === $name && $entry['result'] === null) {
                    $logged[$key]['result'] = $result;
                    break;
                }
            }

            $decoded = is_string($result) ? json_decode($result, true) : $result;

            if ($name === 'get_content' && ! empty($event->toolResult->args['content_ref'])) {
                $focused = (string) $event->toolResult->args['content_ref'];
            }

            if ($name === 'search_content' && is_array($decoded) && isset($decoded[0]['ref'])) {
                $focused = (string) $decoded[0]['ref'];
            }

            if ($name === 'suggest_caption' && is_array($decoded) && ! empty($decoded['caption'])) {
                $suggestions[] = [
                    'content_ref' => (string) ($decoded['content_ref'] ?? ''),
                    'caption' => (string) $decoded['caption'],
                    'rationale' => (string) ($decoded['rationale'] ?? ''),
                ];
                $focused = (string) ($decoded['content_ref'] ?? $focused ?? '');
            }

            $onStep?->__invoke(['type' => 'tool', 'content' => $this->toolLabel($name).' selesai']);
        }

        $this->lastTurn = [
            'tools' => array_map(static fn (array $entry): array => [
                'name' => $entry['name'],
                'arguments' => $entry['arguments'],
                'result' => $entry['result'],
            ], $logged),
            'content_ref' => $focused !== null && $focused !== '' ? $focused : null,
            'suggestions' => $suggestions,
        ];
        $this->lastSuggestions = $suggestions;

        $answer = trim($answer);

        return $answer !== ''
            ? $answer
            : 'TRACE APU belum menghasilkan jawaban. Coba pertanyaan yang lebih spesifik.';
    }

    /**
     * Human-readable step label for the streaming UI.
     */
    private function toolLabel(string $name): string
    {
        return match ($name) {
            'search_content' => 'mencari konten workspace',
            'get_content' => 'membaca isi konten',
            'content_performance' => 'menghitung performa konten',
            'find_trends' => 'mencari tren terbaru',
            'build_hook_bank' => 'menyusun hook bank',
            'suggest_caption' => 'menyiapkan revisi caption',
            default => $name,
        };
    }

    /**
     * Rebuild the provider transcript from stored turns.
     *
     * TRACE APU turns persist their tool calls so follow-up questions keep the
     * content references the agent already resolved (e.g. suggest_caption).
     *
     * @param  list<array{role: string, content: string, tools?: list<array{name: string, arguments: array<string, mixed>, result: mixed}>}>  $history
     * @return array{0: list<AssistantMessage|UserMessage|ToolResultMessage>, 1: ContentItem|null}
     */
    private function restoreMessages(array $history): array
    {
        $messages = [];
        $focus = null;

        foreach ($history as $turn) {
            if (($turn['role'] ?? 'user') !== 'assistant') {
                $messages[] = new UserMessage((string) ($turn['content'] ?? ''));

                continue;
            }

            $calls = [];
            $results = [];

            foreach ((array) ($turn['tools'] ?? []) as $index => $tool) {
                $name = (string) ($tool['name'] ?? '');
                $arguments = (array) ($tool['arguments'] ?? []);
                $calls[] = new ToolCall(id: 'call_'.$index, name: $name, arguments: $arguments);
                $results[] = new ToolResult(toolCallId: 'call_'.$index, toolName: $name, args: $arguments, result: $tool['result'] ?? '');
            }

            if (! empty($turn['content_ref'])) {
                $focus = (string) $turn['content_ref'];
            }

            $messages[] = new AssistantMessage((string) ($turn['content'] ?? ''), $calls);

            if ($results !== []) {
                $messages[] = new ToolResultMessage($results);
            }
        }

        return [$messages, $focus !== null ? $this->corpus->findItem($focus) : null];
    }

    /**
     * Compose the system prompt: persona + steering rules + workspace context.
     */
    private function systemPrompt(string $scope, string $question = '', ?ContentItem $focus = null): string
    {
        $instructions = $this->instructions($scope);
        $items = $this->corpus->scopedItems($question);

        $lines = [
            'Kamu TRACE APU, asisten konten SPARC untuk tim Humas kepolisian.',
            $instructions['persona'],
        ];

        if ($instructions['rules'] !== []) {
            $lines[] = 'Aturan tetap dari pengguna:';
            foreach ($instructions['rules'] as $rule) {
                $lines[] = '- '.$rule;
            }
        }

        $lines[] = 'Alur kerja analisis konten:';
        $lines[] = '1. Cari konten dengan search_content, buka isinya dengan get_content sebelum menilai apa pun.';
        $lines[] = '2. Kutip judul/ID konten yang dianalisis; jangan mengarang caption atau angka.';
        $lines[] = '3. Analisis wajib konkret: kekuatan, kelemahan dengan kutipan kalimat aslinya, saran perbaikan yang bisa langsung dipakai, dan skor keterbacaan 1-10.';
        $lines[] = '4. Untuk pertanyaan performa, panggil content_performance dan sebut angka apa adanya.';
        $lines[] = 'Pilar konten yang aktif saat ini (pakai persis kunci ini saat memfilter): '.implode(', ', $this->tools->pillarKeys()).'.';
        $lines[] = '5. Bila kamu merevisi caption, WAJIB akhiri dengan memanggil suggest_caption agar pengguna bisa menerapkannya sekali klik.';
        $lines[] = '6. Revisi caption harus mempertahankan fakta, nama layanan, dan hashtag relevan; jangan menambah klaim yang tidak ada di brief.';
        $lines[] = 'Jawab dalam Bahasa Indonesia yang ringkas, pakai poin-poin, selalu actionable.';
        $lines[] = $this->corpus->contextBlock($items, $focus);

        return implode("\n", $lines);
    }

    private function model(): string
    {
        return (string) config('services.gemini.model', 'gemini-2.5-flash');
    }

    private function timeout(): int
    {
        return (int) config('services.gemini.timeout', 120);
    }

    private function instructionsKey(string $scope): string
    {
        return 'traceapu:instructions:'.str_replace(':', '_', $scope);
    }

    private function historyKey(string $scope): string
    {
        return 'traceapu:history:'.str_replace(':', '_', $scope);
    }

    /**
     * Cache keys are per authenticated user so transcripts never leak across accounts.
     */
    public function scopeFor(string $base, User|int|null $user): string
    {
        $id = $user instanceof User ? $user->getKey() : $user;

        return $base.(is_numeric($id) ? ':u'.$id : ':guest');
    }
}
