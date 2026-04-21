import { APIError } from "@anthropic-ai/sdk";
import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta.mjs";
import type { MessageBatchResult } from "@anthropic-ai/sdk/resources/messages/batches.mjs";
import {
  batchResultToLLMEvents,
  streamLLMEvents,
} from "@app/lib/api/llm/clients/anthropic/utils/anthropic_to_events";
import { emptyToolCallLLMEvents } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/llm_events/empty_tool_call";
import { reasoningLLMEvents } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/llm_events/reasoning";
import { toolUseLLMEvents } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/llm_events/tool_use";
import { emptyToolCallModelEvents } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/model_output/empty_tool_call";
import { reasoningModelEvents } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/model_output/reasoning";
import { toolUseModelEvents } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/model_output/tool_use";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { createAsyncGenerator } from "@app/lib/api/llm/utils";
import { CLAUDE_4_SONNET_20250514_MODEL_ID } from "@app/types/assistant/models/anthropic";
import { describe, expect, it } from "vitest";

const metadata: LLMClientMetadata = {
  clientId: "anthropic" as const,
  modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
};

describe("streamLLMEvents", () => {
  it("should convert tool use events", async () => {
    const messageStreamEvents = createAsyncGenerator(toolUseModelEvents);
    const result = [];

    for await (const event of streamLLMEvents(messageStreamEvents, metadata)) {
      result.push(event);
    }

    expect(result).toEqual(toolUseLLMEvents.map((e) => ({ ...e, metadata })));
  });

  it("should convert reasoning/thinking events", async () => {
    const messageStreamEvents = createAsyncGenerator(reasoningModelEvents);
    const result = [];

    for await (const event of streamLLMEvents(messageStreamEvents, metadata)) {
      result.push(event);
    }

    expect(result).toEqual(
      reasoningLLMEvents.map((e) => ({
        ...e,
        metadata: { ...e.metadata, ...metadata },
      }))
    );
  });

  it("should recover from 'Unable to parse tool parameter JSON' error with tool state", async () => {
    const errorMessage =
      'Unable to parse tool parameter JSON from model. Please retry your request or adjust your prompt. Error: SyntaxError: Expected \',\' or \'}\' after property value in JSON at position 31 (line 1 column 32). JSON: {"keywords": urgent important action, "relativeTimeFrame": "2d"}';

    const invalidJsonError = APIError.generate(
      400,
      {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: errorMessage,
        },
      },
      errorMessage,
      new Headers()
    );

    // Yield events up to tool_use content_block_start + some deltas, then throw.
    const eventsBeforeError: BetaRawMessageStreamEvent[] = [
      {
        type: "message_start",
        message: {
          type: "message",
          model: CLAUDE_4_SONNET_20250514_MODEL_ID,
          id: "msg_invalid_json",
          role: "assistant",
          content: [],
          stop_reason: null,
          stop_details: null,
          stop_sequence: null,
          usage: {
            input_tokens: 100,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            output_tokens: 0,
            service_tier: "standard",
            server_tool_use: null,
            inference_geo: null,
            iterations: null,
            speed: null,
            cache_creation: {
              ephemeral_5m_input_tokens: 0,
              ephemeral_1h_input_tokens: 0,
            },
          },
          container: null,
          context_management: null,
        },
      },
      {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "tool_123",
          name: "search_tool",
          input: "",
        },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: '{"keywords": urgent',
        },
      },
    ];

    async function* generateEventsWithError(): AsyncGenerator<BetaRawMessageStreamEvent> {
      for (const event of eventsBeforeError) {
        yield event;
      }
      throw invalidJsonError;
    }

    const result = [];
    for await (const event of streamLLMEvents(
      generateEventsWithError(),
      metadata
    )) {
      result.push(event);
    }

    // Should have: interaction_id, tool_call_started, tool_call_delta, tool_call (invalid json), token_usage, success
    const toolCallEvent = result.find((e) => e.type === "tool_call");
    expect(toolCallEvent).toBeDefined();
    expect(toolCallEvent).toMatchObject({
      type: "tool_call",
      content: {
        id: "tool_123",
        name: "search_tool",
        arguments: {
          INVALID_JSON:
            '{"keywords": urgent important action, "relativeTimeFrame": "2d"}',
        },
      },
    });
  });

  it("should handle empty tool call parameters", async () => {
    const messageStreamEvents = createAsyncGenerator(emptyToolCallModelEvents);
    const result = [];

    for await (const event of streamLLMEvents(messageStreamEvents, metadata)) {
      result.push(event);
    }

    expect(result).toEqual(
      emptyToolCallLLMEvents.map((e) => ({ ...e, metadata }))
    );
  });
});

describe("batchResultToLLMEvents", () => {
  it("should emit tool_call_started before tool_call for tool use blocks", async () => {
    const batchResult = {
      type: "succeeded",
      message: {
        id: "msg_batch_123",
        type: "message",
        role: "assistant",
        model: CLAUDE_4_SONNET_20250514_MODEL_ID,
        content: [
          { type: "text", text: "Hello, how are you ?" },
          {
            type: "tool_use",
            id: "DdHr7L197",
            name: "web_search_browse__websearch",
            input: { query: "Paris France weather forecast October 23 2025" },
          },
        ],
        stop_reason: "tool_use",
        stop_sequence: null,
        usage: {
          input_tokens: 1766,
          output_tokens: 128,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    } as MessageBatchResult;

    const result = await batchResultToLLMEvents(batchResult, metadata);

    expect(result.map((event) => event.type)).toEqual([
      "interaction_id",
      "text_generated",
      "tool_call_started",
      "tool_call",
      "token_usage",
      "success",
    ]);
    expect(result[2]).toEqual({
      type: "tool_call_started",
      content: {
        id: "DdHr7L197",
        index: 1,
        name: "web_search_browse__websearch",
      },
      metadata,
    });
    expect(result[3]).toEqual({
      type: "tool_call",
      content: {
        id: "DdHr7L197",
        name: "web_search_browse__websearch",
        arguments: { query: "Paris France weather forecast October 23 2025" },
      },
      metadata,
    });
  });
});
