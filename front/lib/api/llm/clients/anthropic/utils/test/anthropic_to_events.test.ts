import { describe, expect, it } from "vitest";

import { streamLLMEvents } from "../anthropic_to_events";
import { MessageStreamEvent } from "@anthropic-ai/sdk/resources/messages.mjs";
import { ProviderMetadata } from "@app/lib/api/llm/types/events";

async function* createAsyncGenerator<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

describe("streamLLMEvents", () => {
  it("should convert modelOutputEvents to finishLLMEvents", async () => {
    const messageStreamEvents = createAsyncGenerator(modelOutputEvents);
    const result = [];

    for await (const event of streamLLMEvents({
      messageStreamEvents,
      metadata,
    })) {
      result.push(event);
    }

    metadata["messageId"] = "msg_017KE6ziN29Ks5KyL3jGE7RR";

    expect(result).toEqual(finishLLMEvents.map((e) => ({ ...e, metadata })));
  });
});

const modelOutputEvents: MessageStreamEvent[] = [
  {
    type: "message_start",
    message: {
      type: "message",
      model: "claude-sonnet-4-20250514",
      id: "msg_017KE6ziN29Ks5KyL3jGE7RR",
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Hello, how are you ?",
          citations: null,
        },
        {
          type: "tool_use",
          id: "DdHr7L197",
          name: "web_search_browse__websearch",
          input: {
            query: "Paris France weather forecast October 23 2025",
          },
        },
      ],
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation: {
          ephemeral_5m_input_tokens: 0,
          ephemeral_1h_input_tokens: 0,
        },
        output_tokens: 0,
        service_tier: "standard",
        server_tool_use: null,
      },
    },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: {
      type: "text_delta",
      text: "Hello, ",
    },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: {
      type: "text_delta",
      text: "how are you ?",
    },
  },
  {
    type: "message_delta",
    delta: {
      stop_reason: "tool_use",
      stop_sequence: null,
    },
    usage: {
      input_tokens: 1766,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 128,
      server_tool_use: null,
    },
  },
  {
    type: "message_stop",
  },
];

const metadata: ProviderMetadata = {
  providerId: "anthropic" as const,
  modelId: "claude-sonnet-4-20250514",
};

const finishLLMEvents = [
  {
    type: "text_delta",
    content: {
      delta: "Hello, ",
    },
    metadata,
  },
  {
    type: "text_delta",
    content: {
      delta: "how are you ?",
    },
    metadata,
  },
  {
    type: "token_usage",
    content: {
      inputTokens: 1766,
      outputTokens: 128,
      cachedTokens: 0,
      totalTokens: 1894,
    },
    metadata,
  },
  {
    type: "text_generated",
    content: {
      text: "Hello, how are you ?",
    },
    metadata,
  },
  {
    type: "tool_call",
    content: {
      id: "DdHr7L197",
      name: "web_search_browse__websearch",
      arguments: '{"query":"Paris France weather forecast October 23 2025"}',
    },
    metadata,
  },
];
