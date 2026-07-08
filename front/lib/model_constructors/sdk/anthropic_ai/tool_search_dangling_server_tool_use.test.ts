import type {
  MessageParam,
  RawMessageStartEvent,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages/messages";
import {
  parseAnthropicToolSearchBlock,
  stripUnreplayableToolSearchBlocks,
} from "@app/lib/api/llm/clients/anthropic/utils/tool_search_passthrough";
import type { MessageBlockConverters } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/utils";
import {
  assistantProviderPassthroughMessageToBlocks,
  assistantReasoningMessageToThinkingBlocks,
  assistantTextMessageToTextBlock,
  assistantToolCallRequestToToolUseBlock,
  conversationToMessages,
  imageUrlToImageBlock,
  systemMessageToTextBlock,
  userTextMessageToTextBlock,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/utils";
import type { OutputEventConverters } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output/utils";
import {
  accumulatedReasoningToReasoningEvent,
  accumulatedTextToTextEvent,
  accumulatedToolCallToToolCallEvent,
  inputJsonDeltaToToolCallDeltaEvent,
  invalidJsonToolCallToToolCallEvent,
  messageDeltaUsageToTokenUsageEvent,
  messageStartToResponseIdEvent,
  rawOutputToEvents,
  reasoningDeltaToReasoningDeltaEvent,
  serverToolBlockToProviderPassthroughEvent,
  stopReasonToErrorEvent,
  streamErrorToErrorEvent,
  textDeltaToTextDeltaEvent,
  toolUseBlockStartToToolCallStartedEvent,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output/utils";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type {
  BaseMessage,
  ToolCallResultPart,
} from "@app/lib/model_constructors/types/input/messages";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { describe, expect, it } from "vitest";

/* Reproduction of the production 400:
 *
 *   messages.1: `tool_search_tool_bm25` tool use with id `srvtoolu_...` was
 *   found without a corresponding `tool_search_tool_bm25_tool_result` block
 *
 * Observed incident shape: when the model calls tool search AND a client tool
 * in the same turn, the API can end the turn (stop_reason "tool_use") without
 * executing the searches. The response carries server_tool_use blocks with no
 * tool_search_tool_result blocks. We persist those blocks verbatim and replay
 * them verbatim on the next step. The API resumes the pending searches only
 * when the continuation user message is exclusively tool_result blocks and
 * rejects every other replay shape.
 *
 * These tests cover the incident end to end: stream -> unified events (what we
 * persist) -> replayed request, sanitized by stripUnreplayableToolSearchBlocks
 * at request build time. The resumable shape keeps the dangling blocks, the
 * unresumable one (a text block appended after the tool_result, as enable_skill
 * does with skill instructions) gets them stripped.
 */

const metadata: EndpointMetadata = {
  providerId: "anthropic",
  api: "anthropic",
  region: "us",
  modelId: "claude-opus-4-8",
};

const outputConverters: OutputEventConverters = {
  messageStartToResponseIdEvent,
  textDeltaToTextDeltaEvent,
  reasoningDeltaToReasoningDeltaEvent,
  accumulatedTextToTextEvent,
  accumulatedReasoningToReasoningEvent,
  toolUseBlockStartToToolCallStartedEvent,
  inputJsonDeltaToToolCallDeltaEvent,
  accumulatedToolCallToToolCallEvent,
  invalidJsonToolCallToToolCallEvent,
  serverToolBlockToProviderPassthroughEvent,
  messageDeltaUsageToTokenUsageEvent,
  stopReasonToErrorEvent,
  streamErrorToErrorEvent,
};

const inputConverters: MessageBlockConverters = {
  systemMessageToTextBlock,
  userTextMessageToTextBlock,
  imageUrlToImageBlock,
  assistantTextMessageToTextBlock,
  assistantReasoningMessageToThinkingBlocks,
  assistantToolCallRequestToToolUseBlock,
  assistantProviderPassthroughMessageToBlocks,
};

// The incident stream: two tool searches and a client tool call in one burst,
// ending on stop_reason "tool_use" with NO tool_search_tool_result blocks.
function incidentStreamEvents(): RawMessageStreamEvent[] {
  return [
    {
      type: "message_start",
      message: { id: "msg_incident" },
    } as RawMessageStartEvent,
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "", citations: [] },
    } as RawMessageStreamEvent,
    {
      type: "content_block_delta",
      index: 0,
      delta: {
        type: "text_delta",
        text: "Let me find the right tools and enable Go Deep.",
      },
    } as RawMessageStreamEvent,
    { type: "content_block_stop", index: 0 } as RawMessageStreamEvent,
    {
      type: "content_block_start",
      index: 1,
      content_block: {
        type: "server_tool_use",
        id: "srvtoolu_01HYMiK87QN76JLMFWMfRcha",
        name: "tool_search_tool_bm25",
        input: {},
      },
    } as RawMessageStreamEvent,
    {
      type: "content_block_delta",
      index: 1,
      delta: {
        type: "input_json_delta",
        partial_json: '{"limit":10,"query":"search retrieve documents"}',
      },
    } as RawMessageStreamEvent,
    { type: "content_block_stop", index: 1 } as RawMessageStreamEvent,
    {
      type: "content_block_start",
      index: 2,
      content_block: {
        type: "server_tool_use",
        id: "srvtoolu_012AkyEMoNfiXjN9W6r2SiWJ",
        name: "tool_search_tool_bm25",
        input: {},
      },
    } as RawMessageStreamEvent,
    {
      type: "content_block_delta",
      index: 2,
      delta: {
        type: "input_json_delta",
        partial_json: '{"limit":10,"query":"Google Calendar list events"}',
      },
    } as RawMessageStreamEvent,
    { type: "content_block_stop", index: 2 } as RawMessageStreamEvent,
    {
      type: "content_block_start",
      index: 3,
      content_block: {
        type: "tool_use",
        id: "toolu_015T894z6exFvubKtC8hCZaf",
        name: "skill_management__enable_skill",
        input: {},
      },
    } as RawMessageStreamEvent,
    {
      type: "content_block_delta",
      index: 3,
      delta: {
        type: "input_json_delta",
        partial_json: '{"skillName":"Go Deep"}',
      },
    } as RawMessageStreamEvent,
    { type: "content_block_stop", index: 3 } as RawMessageStreamEvent,
    {
      type: "message_delta",
      delta: { stop_reason: "tool_use", stop_sequence: null },
      usage: {
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        input_tokens: 100,
        output_tokens: 50,
        output_tokens_details: null,
        server_tool_use: null,
      },
    } as RawMessageStreamEvent,
    { type: "message_stop" } as RawMessageStreamEvent,
  ];
}

async function* streamOf(
  events: RawMessageStreamEvent[]
): AsyncGenerator<RawMessageStreamEvent> {
  for (const event of events) {
    yield event;
  }
}

async function collect(
  generator: AsyncGenerator<ModelResponseEvent>
): Promise<ModelResponseEvent[]> {
  const out: ModelResponseEvent[] = [];
  for await (const event of generator) {
    out.push(event);
  }
  return out;
}

describe("tool search alongside client tool_use without search results", () => {
  it("persists the dangling server_tool_use blocks exactly as streamed", async () => {
    const events = await collect(
      rawOutputToEvents(
        streamOf(incidentStreamEvents()),
        metadata,
        outputConverters
      )
    );

    // The two searches surface as passthrough blocks (what we persist and
    // replay), with no result blocks anywhere in the stream.
    const passthroughBlocks = events
      .filter((e) => e.type === "provider_passthrough")
      .map((e) => parseAnthropicToolSearchBlock(e.content.block));
    expect(passthroughBlocks.map((b) => b?.type)).toEqual([
      "server_tool_use",
      "server_tool_use",
    ]);

    const toolCalls = events.filter((e) => e.type === "tool_call");
    expect(toolCalls).toHaveLength(1);
  });

  it("keeps the dangling blocks in the resumable shape and strips them from the unresumable one", async () => {
    // What we persist from the incident stream, replayed on the next step
    // alongside the client tool's result, mirroring the agent loop.
    const events = await collect(
      rawOutputToEvents(
        streamOf(incidentStreamEvents()),
        metadata,
        outputConverters
      )
    );

    const replayedAssistantMessages: BaseMessage[] = events.flatMap(
      (event): BaseMessage[] => {
        switch (event.type) {
          case "text":
            return [
              {
                role: "assistant",
                type: "text",
                content: { value: event.content.value },
              },
            ];
          case "provider_passthrough":
            return [
              {
                role: "assistant",
                type: "provider_passthrough",
                content: event.content,
              },
            ];
          case "tool_call":
            return [
              {
                role: "assistant",
                type: "tool_call_request",
                content: {
                  callId: event.content.id,
                  toolName: event.content.name,
                  arguments: JSON.stringify(event.content.arguments),
                },
              },
            ];
          default:
            return [];
        }
      }
    );

    const toolResultParts: ToolCallResultPart[] = [
      { type: "text", text: "Skill enabled." },
    ];

    const messages = await conversationToMessages(
      {
        system: [],
        messages: [
          {
            role: "user",
            type: "text",
            content: { value: "Summarize the meeting." },
          },
          ...replayedAssistantMessages,
          {
            role: "user",
            type: "tool_call_result",
            content: {
              callId: "toolu_015T894z6exFvubKtC8hCZaf",
              toolName: "skill_management__enable_skill",
              parts: toolResultParts,
              isError: false,
            },
          },
        ],
      },
      inputConverters
    );

    // messages[1] is the assistant message, the `messages.1` the API error
    // pointed at. The renderer stays faithful: it replays the dangling blocks
    // exactly as persisted.
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);

    const assistantBlockTypes = (message: MessageParam): string[] => {
      if (typeof message.content === "string") {
        throw new Error("expected block content");
      }
      return message.content.map((b) => b.type);
    };

    expect(assistantBlockTypes(messages[1])).toEqual([
      "text",
      "server_tool_use",
      "server_tool_use",
      "tool_use",
    ]);

    // The continuation is exclusively tool_result blocks, so the shape is
    // resumable: the sanitizer keeps the dangling blocks and the API runs the
    // pending searches on the next request.
    expect(
      stripUnreplayableToolSearchBlocks(messages, { toolSearchInRequest: true })
    ).toBe(messages);

    // With a text block appended after the tool_result (what enable_skill does
    // with skill instructions), the shape is unresumable and the dangling
    // blocks are stripped, avoiding the 400.
    const lastMessage = messages[messages.length - 1];
    if (typeof lastMessage.content === "string") {
      throw new Error("expected block content");
    }
    const unresumableMessages: MessageParam[] = [
      ...messages.slice(0, -1),
      {
        ...lastMessage,
        content: [
          ...lastMessage.content,
          {
            type: "text",
            text: "<dust_system>skill instructions</dust_system>",
          },
        ],
      },
    ];

    const sanitized = stripUnreplayableToolSearchBlocks(unresumableMessages, {
      toolSearchInRequest: true,
    });
    expect(assistantBlockTypes(sanitized[1])).toEqual(["text", "tool_use"]);
  });
});
