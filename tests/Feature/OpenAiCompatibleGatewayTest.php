<?php

namespace Tests\Feature;

use App\Providers\OpenAiCompatibleGateway;
use GuzzleHttp\Psr7\Response as PsrResponse;
use ReflectionMethod;
use Tests\TestCase;

/**
 * The gateway bridges Prism's `/responses` dialect to Chat Completions for
 * OpenAI-compatible routers. These checks pin the translation the agent loop
 * depends on (text deltas, tool calls, tool round-trips), because a silent
 * mismatch here produces an empty answer instead of an error.
 */
class OpenAiCompatibleGatewayTest extends TestCase
{
    private function gateway(): OpenAiCompatibleGateway
    {
        return new OpenAiCompatibleGateway('key', 'http://localhost:20128/v1');
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function events(string $sse): array
    {
        $translated = $this->gateway()->sseToResponsesEvents(new PsrResponse(200, [], $sse));

        return array_values(array_filter(array_map(
            static fn (string $line): ?array => str_starts_with($line, 'data: ') ? json_decode(substr($line, 6), true) : null,
            explode("\n", trim((string) $translated->getBody()))
        )));
    }

    public function test_text_chunks_become_output_text_deltas(): void
    {
        $sse = "data: {\"model\":\"m\",\"choices\":[{\"delta\":{\"content\":\"Halo\"}}]}\n\n"
            ."data: {\"choices\":[{\"delta\":{\"content\":\" dunia\"}}]}\n\n"
            ."data: [DONE]\n\n";

        $events = $this->events($sse);
        $deltas = array_values(array_filter($events, static fn (array $e): bool => $e['type'] === 'response.output_text.delta'));

        $this->assertSame(['Halo', ' dunia'], array_column($deltas, 'delta'));
        $this->assertSame('Halo dunia', $events[count($events) - 1]['response']['output'][0]['content'][0]['text']);
    }

    public function test_tool_call_chunks_emit_added_arguments_and_done_items(): void
    {
        $sse = "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"function\":{\"name\":\"search_content\",\"arguments\":\"\"}}]}}]}\n\n"
            // Nama hanya dikirim sekali; chunk lanjutan membawa arguments saja.
            ."data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"name\":\"\",\"arguments\":\"{\\\"query\\\":\\\"edukasi\\\"}\"}}]}}]}\n\n"
            ."data: [DONE]\n\n";

        $events = $this->events($sse);
        $types = array_column($events, 'type');
        $added = $events[1]['item'];

        $this->assertSame('search_content', $added['name']);
        $this->assertSame('call_1', $added['call_id']);
        $this->assertContains('response.function_call_arguments.done', $types);
        $this->assertContains('response.output_item.done', $types);

        $completed = $events[count($events) - 1]['response'];
        $this->assertSame('function_call', $completed['output'][0]['type']);
        $this->assertSame('{"query":"edukasi"}', $completed['output'][0]['arguments']);
    }

    public function test_tool_round_trip_becomes_assistant_and_tool_messages(): void
    {
        $method = new ReflectionMethod($this->gateway(), 'chatMessages');
        $method->setAccessible(true);

        $messages = $method->invoke($this->gateway(), [
            ['type' => 'message', 'role' => 'user', 'content' => [['type' => 'input_text', 'text' => 'Cari konten']]],
            ['type' => 'function_call', 'id' => 'fc_1', 'call_id' => 'call_1', 'name' => 'search_content', 'arguments' => '{"query":"x"}'],
            ['type' => 'function_call_output', 'call_id' => 'call_1', 'output' => 'hasil'],
        ]);

        $this->assertSame('user', $messages[0]['role']);
        $this->assertSame('assistant', $messages[1]['role']);
        $this->assertSame('call_1', $messages[1]['tool_calls'][0]['id']);
        $this->assertSame('tool', $messages[2]['role']);
        $this->assertSame('call_1', $messages[2]['tool_call_id']);
    }

    public function test_chat_payload_keeps_stream_flag_and_wraps_tools(): void
    {
        $method = new ReflectionMethod($this->gateway(), 'chatPayload');
        $method->setAccessible(true);

        $payload = $method->invoke($this->gateway(), [
            'model' => 'm',
            'stream' => true,
            'input' => [['role' => 'user', 'content' => [['type' => 'input_text', 'text' => 'halo']]]],
            'tools' => [['type' => 'function', 'name' => 'search_content', 'description' => 'd', 'parameters' => ['type' => 'object']]],
        ]);

        $this->assertTrue($payload['stream']);
        $this->assertSame('function', $payload['tools'][0]['type']);
        $this->assertSame('search_content', $payload['tools'][0]['function']['name']);
    }
}
