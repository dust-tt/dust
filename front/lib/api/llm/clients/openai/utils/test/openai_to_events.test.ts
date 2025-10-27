import type { ResponseStreamEvent } from "openai/resources/responses/responses.mjs";
import { describe, expect, it } from "vitest";

import * as openai_to_events from "@app/lib/api/llm/clients/openai/utils/openai_to_events";

async function* createAsyncGenerator<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

describe("streamLLMEvents", () => {
  it("should convert modelOutputFinishStopEvents to finishStopLLMEvents", async () => {
    const responseStreamEvents = createAsyncGenerator(modelOutputEvents);
    const result = [];

    for await (const event of openai_to_events.streamLLMEvents(
      responseStreamEvents,
      metadata
    )) {
      result.push(event);
    }

    expect(result).toEqual(finishEvents.map((e) => ({ ...e, metadata })));
  });
});

const modelOutputEvents: ResponseStreamEvent[] = [
  {
    type: "response.output_text.delta",
    item_id: "msg_06634f9e36adf77a0168ef5c76574c8198ae7bdc4f55d8c3ab",
    output_index: 0,
    content_index: 0,
    delta: "Hello, ",
  },
  {
    type: "response.output_text.delta",
    item_id: "msg_06634f9e36adf77a0168ef5c76574c8198ae7bdc4f55d8c3ab",
    output_index: 0,
    content_index: 0,
    delta: "how are you ?",
  },
  {
    type: "response.output_item.done",
    output_index: 0,
    item: {
      type: "function_call",
      name: "web_search_browse__websearch",
      arguments: '{"query":"Paris France weather forecast October 23 2025"}',
      call_id: "call_DdHr7L197",
      id: "fc_DdHr7L197",
    },
  },
  {
    type: "response.completed",
    response: {
      id: "resp_06634f9e36adf77a0168ef5c7586788198b8873441b876817c",
      object: "response",
      created_at: 1760517237,
      status: "completed",
      error: null,
      incomplete_details: null,
      instructions: null,
      max_output_tokens: null,
      model: "gpt-4o",
      output_text: "Hello, how are you ?",
      output: [
        {
          id: "msg_06634f9e36adf77a0168ef5c76574c8198ae7bdc4f55d8c3ab",
          type: "message",
          status: "completed",
          content: [
            {
              type: "output_text",
              annotations: [],
              text: "Hello, how are you ?",
            },
          ],
          role: "assistant",
        },
      ],
      parallel_tool_calls: true,
      previous_response_id: null,
      reasoning: {
        effort: null,
        summary: null,
      },
      service_tier: "default",
      temperature: 0.7,
      text: {
        format: {
          type: "text",
        },
      },
      tool_choice: "auto",
      tools: [],
      top_p: 1,
      truncation: "disabled",
      usage: {
        input_tokens: 6840,
        input_tokens_details: {
          cached_tokens: 32,
        },
        output_tokens: 139,
        output_tokens_details: {
          reasoning_tokens: 45,
        },
        total_tokens: 6979,
      },
      metadata: {},
    },
  },
];

const metadata = {
  providerId: "openai" as const,
  modelId: "gpt-4o",
};

const finishEvents = [
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
    type: "tool_call",
    content: {
      id: "DdHr7L197",
      name: "web_search_browse__websearch",
      arguments: '{"query":"Paris France weather forecast October 23 2025"}',
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
    type: "token_usage",
    content: {
      inputTokens: 6840,
      cachedTokens: 32,
      reasoningTokens: 45,
      outputTokens: 139,
      totalTokens: 6979,
    },
    metadata,
  },
];
