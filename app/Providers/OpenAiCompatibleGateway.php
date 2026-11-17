<?php

namespace App\Providers;

use Generator;
use GuzzleHttp\Psr7\Response as PsrResponse;
use GuzzleHttp\Psr7\Utils;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use Prism\Prism\Providers\OpenAI\OpenAI;
use Prism\Prism\Text\Request as TextRequest;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/**
 * Prism's OpenAI provider for OpenAI-compatible gateways (LiteLLM routers, LM Studio, vLLM).
 *
 * Prism only speaks `/responses`, which those gateways answer with 404. The configured
 * base URL is shadowed with {@see self::SHADOW_SEGMENT}, so every Prism request is
 * identifiable here; `/responses` is rewritten to `/chat/completions` and the reply is
 * translated back into the `/responses` JSON Prism already parses. Anything else
 * (`/embeddings`, 5xx, auth errors) is forwarded untouched.
 */
class OpenAiCompatibleGateway extends OpenAI
{
    public const SHADOW_SEGMENT = '__upstream';

    private bool $translated = false;

    /**
     * Penanda `stream = true` untuk satu request; dibaca middleware request.
     */
    private bool $streaming = false;

    public function __construct(string $apiKey, string $url, ?string $organization = null, ?string $project = null)
    {
        parent::__construct(
            apiKey: $apiKey,
            url: rtrim($url, '/').'/'.self::SHADOW_SEGMENT,
            organization: $organization,
            project: $project,
        );
    }

    /**
     * Konversi & terjemahan balasan hanya berlaku untuk JSON `/responses`;
     * `client()` menambahkannya ke semua request, termasuk streaming, jadi
     * stream ditangani sendiri di sini dengan klien tanpa middleware.
     *
     * @return Generator<StreamEvent>
     */
    public function stream(TextRequest $request): Generator
    {
        try {
            yield from parent::stream($request);
        } finally {
            $this->streaming = false;
        }
    }

    /**
     * @param  array<string, mixed>  $options
     * @param  array<mixed>  $retry
     */
    protected function client(array $options = [], array $retry = [], ?string $baseUrl = null): PendingRequest
    {
        return parent::client($options, $retry, $baseUrl)
            ->withRequestMiddleware($this->chatCompletionsRequest(...))
            ->withResponseMiddleware($this->chatCompletionsResponse(...));
    }

    /**
     * `/responses` → `/chat/completions`; setiap path lain hanya kehilangan segmen shadow.
     * `$translated` memberi tahu middleware respons mana yang perlu diterjemahkan balik,
     * sedangkan `$streaming` menandai balikan SSE agar dibungkus sebagai `/responses` di sini.
     */
    private function chatCompletionsRequest(RequestInterface $request): RequestInterface
    {
        $body = (array) json_decode((string) $request->getBody(), true);
        $path = str_replace('/'.self::SHADOW_SEGMENT, '', $request->getUri()->getPath());
        $isResponses = str_ends_with($path, '/responses');
        $this->translated = $isResponses;
        $this->streaming = $isResponses && (bool) ($body['stream'] ?? false);

        $chat = $isResponses ? $this->chatPayload($body) : null;

        $body = Utils::streamFor($isResponses
            ? json_encode($chat, JSON_THROW_ON_ERROR)
            : (string) $request->getBody());

        return $request
            ->withUri($request->getUri()->withPath($isResponses ? str_replace('/responses', '/chat/completions', $path) : $path))
            ->withBody($body)
            ->withHeader('Content-Length', (string) $body->getSize());
    }

    /**
     * Chat Completions reply → the `/responses` body Prism's handler expects.
     */
    private function chatCompletionsResponse(ResponseInterface $response): ResponseInterface
    {
        if (! $this->translated || $response->getStatusCode() >= 400) {
            return $response;
        }

        if ($this->streaming) {
            return $this->sseToResponsesEvents($response);
        }

        return new PsrResponse(
            $response->getStatusCode(),
            ['Content-Type' => 'application/json'],
            json_encode($this->asResponsesPayload((array) json_decode((string) $response->getBody(), true)), JSON_THROW_ON_ERROR)
        );
    }

    /**
     * Chat Completions SSE → urutan event SSE `/responses` yang dibaca Prism bila streaming.
     * Chat tidak punya `response.created`/`response.output_item.*`, jadi tiap delta teks
     * dipetakan ke event yang hanya dikonsumsi parser Prism.
     *
     * @param  array<int, array{role: string, content: string, tool_calls?: array<int, mixed>}>  $messages  Pesan yang dikirim; dipakai menyisipkan giliran asisten + hasil tool agar ronde berikutnya valid.
     */
    public function sseToResponsesEvents(ResponseInterface $response): ResponseInterface
    {
        $id = 'resp_'.Str::random(12);
        $model = '';
        $itemId = 'msg_'.Str::random(12);
        $events = [['type' => 'response.created', 'response' => ['id' => $id, 'model' => $model, 'status' => 'in_progress']]];
        $text = '';
        $toolCalls = [];

        foreach (explode("\n", (string) $response->getBody()) as $line) {
            if (! str_starts_with(trim($line), 'data:')) {
                continue;
            }

            $payload = trim(substr(trim($line), 5));

            if ($payload === '' || $payload === '[DONE]') {
                continue;
            }

            $chunk = json_decode($payload, true);

            if (! is_array($chunk)) {
                continue;
            }

            $model = (string) ($chunk['model'] ?? $model);
            $delta = (array) ($chunk['choices'][0]['delta'] ?? []);

            if (isset($delta['content']) && $delta['content'] !== '') {
                $text .= (string) $delta['content'];
                $events[] = $this->outputTextDelta($itemId, (string) $delta['content']);
            }

            foreach ((array) ($delta['tool_calls'] ?? []) as $call) {
                $index = (int) ($call['index'] ?? count($toolCalls));
                // Nama fungsi hanya dikirim gateway pada chunk pertama; chunk berikutnya boleh kosong.
                $name = (string) ($call['function']['name'] ?? '');
                $toolCalls[$index]['id'] = (string) ($call['id'] ?? ($toolCalls[$index]['id'] ?? 'call_'.Str::random(12)));
                $toolCalls[$index]['name'] = $name !== '' ? $name : (string) ($toolCalls[$index]['name'] ?? '');
                $toolCalls[$index]['arguments'] = ($toolCalls[$index]['arguments'] ?? '').(string) ($call['function']['arguments'] ?? '');
            }
        }

        foreach ($toolCalls as $call) {
            if (($call['name'] ?? '') === '') {
                continue;
            }

            $itemId = 'fc_'.Str::random(12);

            // Prism mengenali argumen lewat `item_id`, lalu menutup panggilan pada event `...done`.
            $events[] = [
                'type' => 'response.output_item.added',
                'output_index' => 0,
                'item' => [
                    'id' => $itemId,
                    'type' => 'function_call',
                    'call_id' => (string) ($call['id'] ?? 'call_'.Str::random(12)),
                    'name' => $call['name'],
                    'arguments' => '',
                ],
            ];
            $events[] = [
                'type' => 'response.function_call_arguments.delta',
                'item_id' => $itemId,
                'delta' => (string) $call['arguments'],
            ];
            $events[] = [
                'type' => 'response.function_call_arguments.done',
                'item_id' => $itemId,
                'name' => $call['name'],
                'arguments' => (string) $call['arguments'],
            ];
            // Prism menandai panggilan "complete" hanya dari item ini; tanpanya tool tak dieksekusi.
            $events[] = [
                'type' => 'response.output_item.done',
                'output_index' => 0,
                'item' => [
                    'id' => $itemId,
                    'type' => 'function_call',
                    'call_id' => (string) ($call['id'] ?? ''),
                    'name' => $call['name'],
                    'arguments' => (string) $call['arguments'],
                    'status' => 'completed',
                ],
            ];
        }

        // Prism menentukan `FinishReason::ToolCalls` dari `output[]` pada event selesai,
        // dan tanpa itu tool tidak pernah dieksekusi — balasan berhenti kosong.
        $output = array_values(array_map(static fn (array $call, int $index): array => [
            'id' => 'fc_'.Str::random(12),
            'type' => 'function_call',
            'call_id' => (string) ($call['id'] ?? 'call_'.Str::random(12)),
            'name' => $call['name'],
            'arguments' => (string) $call['arguments'],
            'status' => 'completed',
        ], $toolCalls, array_keys($toolCalls)));

        if ($text !== '') {
            $output[] = [
                'id' => $itemId,
                'type' => 'message',
                'role' => 'assistant',
                'status' => 'completed',
                'content' => [['type' => 'output_text', 'text' => $text]],
            ];
        }

        $events[] = ['type' => 'response.completed', 'response' => [
            'id' => $id,
            'model' => $model,
            'status' => 'completed',
            'output' => $output,
            'usage' => ['input_tokens' => 0, 'output_tokens' => 0],
        ]];

        $payload = implode('', array_map(
            static fn (array $event): string => 'data: '.json_encode($event, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n\n",
            $events
        ));

        return new PsrResponse(200, ['Content-Type' => 'text/event-stream'], Utils::streamFor($payload));
    }

    /**
     * @return array<string, mixed>
     */
    private function outputTextDelta(string $itemId, string $delta): array
    {
        return [
            'type' => 'response.output_text.delta',
            'item_id' => $itemId,
            'delta' => $delta,
        ];
    }

    /**
     * @param  array<string, mixed>  $body
     * @return array<string, mixed>
     */
    private function chatPayload(array $body): array
    {
        $messages = $this->chatMessages((array) ($body['input'] ?? []));
        $format = $body['text']['format'] ?? null;
        $schema = $format['schema'] ?? null;

        $format = $this->responseFormat($format, $messages, $schema);

        return Arr::whereNotNull([
            'model' => $body['model'] ?? null,
            'messages' => $messages,
            'max_tokens' => $body['max_output_tokens'] ?? null,
            'temperature' => $body['temperature'] ?? null,
            'top_p' => $body['top_p'] ?? null,
            // Tanpa ini gateway membalas JSON utuh, bukan SSE, dan streaming Prism kosong.
            'stream' => ($body['stream'] ?? false) ? true : null,
            // `/responses` memakai `{type,name,parameters}`; Chat Completions membungkusnya di `function`.
            'tools' => $this->chatTools((array) ($body['tools'] ?? [])),
            // `/responses` nests the schema under `text.format`; chat wants `response_format`.
            'response_format' => $format,
        ]);
    }

    /**
     * `/responses` tools → Chat Completions `tools` (`function` wrapper).
     *
     * @param  list<array<string, mixed>>  $tools
     * @return list<array<string, mixed>>|null
     */
    private function chatTools(array $tools): ?array
    {
        if ($tools === []) {
            return null;
        }

        return array_map(static fn (array $tool): array => [
            'type' => 'function',
            'function' => array_filter([
                'name' => $tool['name'] ?? null,
                'description' => $tool['description'] ?? null,
                'parameters' => $tool['parameters'] ?? null,
            ]),
        ], array_values(array_filter($tools, static fn ($tool): bool => is_array($tool) && isset($tool['name']))));
    }

    /**
     * Prism's `/responses` input items carry `role` inside `content[]`; flatten them.
     *
     * Tool round-trips use a different vocabulary: `function_call` becomes an
     * assistant message with `tool_calls`, and `function_call_output` becomes a
     * `tool` message keyed by the same `call_id`, because Chat Completions has
     * no top-level function items.
     *
     * @param  list<array<string, mixed>>  $input
     * @return list<array<string, mixed>>
     */
    private function chatMessages(array $input): array
    {
        $messages = [];

        foreach (array_values(array_filter($input, 'is_array')) as $item) {
            $type = (string) ($item['type'] ?? '');

            if ($type === 'function_call') {
                $call = [
                    'id' => (string) ($item['call_id'] ?? $item['id'] ?? ''),
                    'type' => 'function',
                    'function' => [
                        'name' => (string) ($item['name'] ?? ''),
                        'arguments' => (string) ($item['arguments'] ?? '{}'),
                    ],
                ];
                $last = array_key_last($messages);

                // Satu giliran asisten boleh memuat banyak tool_calls; gabungkan agar urutannya sah.
                if ($last !== null && ($messages[$last]['role'] ?? null) === 'assistant') {
                    $messages[$last]['tool_calls'][] = $call;
                } else {
                    $messages[] = ['role' => 'assistant', 'content' => null, 'tool_calls' => [$call]];
                }

                continue;
            }

            if ($type === 'function_call_output') {
                $messages[] = [
                    'role' => 'tool',
                    'tool_call_id' => (string) ($item['call_id'] ?? ''),
                    'content' => (string) ($item['output'] ?? ''),
                ];

                continue;
            }

            $parts = (array) ($item['content'] ?? []);
            $text = implode("\n", array_filter(array_map(
                static fn (array $part): string => (string) ($part['text'] ?? ''),
                array_filter($parts, 'is_array')
            )));

            $messages[] = [
                'role' => (string) ($item['role'] ?? ($parts[0]['role'] ?? 'user')),
                'content' => $text !== '' ? $text : (string) ($item['content'] ?? ''),
            ];
        }

        return $messages;
    }

    /**
     * Structured requests need the schema in the payload *and* in the prompt:
     * routing gateways strip unsupported `response_format`, so the schema is
     * spelled out for the model unless the gateway honors `json_schema` strictly.
     *
     * @param  array<string, mixed>|null  $format
     * @param  list<array{role: string, content: string}>  $messages
     * @return array<string, mixed>|null
     */
    private function responseFormat(?array $format, array &$messages, ?array $schema): ?array
    {
        if (! in_array($format['type'] ?? null, ['json_schema', 'json_object'], true)) {
            return null;
        }

        $instruction = "\n\nBalas HANYA satu objek JSON valid, tanpa prosa atau code fence"
            .($schema === null ? '.' : " sesuai skema:\n".json_encode($schema, JSON_UNESCAPED_UNICODE));

        if (($messages[0]['role'] ?? null) === 'system') {
            $messages[0]['content'] .= $instruction;
        } else {
            array_unshift($messages, ['role' => 'system', 'content' => ltrim($instruction)]);
        }

        return ['type' => $format['type'] === 'json_schema' ? 'json_schema' : 'json_object'];
    }

    /**
     * Prism's structured parser needs bare JSON; gateways wrap it in ``` fences.
     */
    private function jsonBody(string $text): string
    {
        if (preg_match('/```(?:json)?\s*(.+?)\s*```/s', $text, $match) === 1) {
            return $match[1];
        }

        return $text;
    }

    /**
     * Chat Completions reply reshaped exactly like an OpenAI `/responses` body.
     *
     * @param  array<string, mixed>  $chat
     * @return array<string, mixed>
     */
    private function asResponsesPayload(array $chat): array
    {
        $message = (array) ($chat['choices'][0]['message'] ?? []);

        return [
            'id' => (string) ($chat['id'] ?? 'chatcmpl_'.Str::random(12)),
            'model' => (string) ($chat['model'] ?? ''),
            'status' => 'completed',
            'output' => [[
                'type' => 'message',
                'role' => 'assistant',
                // Prism maps the last item's status; without it the finish reason is Unknown.
                'status' => 'completed',
                'content' => [[
                    'type' => 'output_text',
                    'text' => $this->jsonBody((string) ($message['content'] ?? '')),
                ]],
            ]],
            'usage' => [
                'input_tokens' => (int) ($chat['usage']['prompt_tokens'] ?? 0),
                'output_tokens' => (int) ($chat['usage']['completion_tokens'] ?? 0),
            ],
        ];
    }
}
