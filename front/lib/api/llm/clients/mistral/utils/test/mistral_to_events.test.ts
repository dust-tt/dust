import type { CompletionEvent } from "@mistralai/mistralai/models/components";
import { describe, expect, it } from "vitest";

import { createAsyncGenerator } from "@app/lib/api/llm/utils";

import { streamLLMEvents } from "../mistral_to_events";

describe("streamLLMEvents", () => {
  describe("when finish reason is stop", () => {
    it("should convert modelOutputFinishStopEvents to finishStopLLMEvents", async () => {
      const completionEvents = createAsyncGenerator(
        modelOutputFinishStopEvents
      );
      const result = [];

      for await (const event of streamLLMEvents({
        completionEvents,
        metadata,
      })) {
        result.push(event);
      }

      expect(result).toEqual(
        finishStopLLMEvents.map((e) => ({ ...e, metadata }))
      );
    });
  });

  describe("when finish reason is tool_calls", () => {
    it("should convert modelOutputFinishToolCallEvents to finishToolCallLLMEvents", async () => {
      const completionEvents = createAsyncGenerator(
        modelOutputFinishToolCallEvents
      );
      const result = [];

      for await (const event of streamLLMEvents({
        completionEvents,
        metadata,
      })) {
        result.push(event);
      }

      expect(result).toEqual(
        finishToolCallLLMEvents.map((e) => ({ ...e, metadata }))
      );
    });
  });
});

const modelOutputFinishStopEvents: CompletionEvent[] = [
  {
    data: {
      id: "25b708fd990f4a3b8d6fc7166e4b8db2",
      object: "chat.completion.chunk",
      created: 1761123235,
      model: "mistral-large-latest",
      choices: [
        {
          index: 0,
          delta: {
            content: "Hello, ",
          },
          finishReason: null,
        },
      ],
    },
  },
  {
    data: {
      id: "25b708fd990f4a3b8d6fc7166e4b8db2",
      object: "chat.completion.chunk",
      created: 1761123235,
      model: "mistral-large-latest",
      usage: {
        promptTokens: 3186,
        completionTokens: 192,
        totalTokens: 3378,
      },
      choices: [
        {
          index: 0,
          delta: {
            content: "how are you ?",
          },
          finishReason: "stop",
        },
      ],
    },
  },
];

const modelOutputFinishToolCallEvents: CompletionEvent[] = [
  {
    data: {
      id: "c02315a0f93e47ba87c64fe6479c219c",
      object: "chat.completion.chunk",
      created: 1761123227,
      model: "mistral-large-latest",
      choices: [
        {
          index: 0,
          delta: {
            content: "Hi !",
          },
          finishReason: null,
        },
      ],
    },
  },
  {
    data: {
      id: "c02315a0f93e47ba87c64fe6479c219c",
      object: "chat.completion.chunk",
      created: 1761123227,
      model: "mistral-large-latest",
      usage: {
        promptTokens: 1766,
        completionTokens: 128,
        totalTokens: 1894,
      },
      choices: [
        {
          index: 0,
          delta: {
            toolCalls: [
              {
                id: "DdHr7L197",
                function: {
                  name: "web_search_browse__websearch",
                  arguments:
                    '{"query": "Paris France weather forecast October 23 2025"}',
                },
                index: 0,
              },
            ],
          },
          finishReason: "tool_calls",
        },
      ],
    },
  },
];

const metadata = {
  clientId: "mistral",
  modelId: "mistral-large-latest",
} as const;

const finishStopLLMEvents = [
  {
    type: "interaction_id",
    content: { modelInteractionId: "25b708fd990f4a3b8d6fc7166e4b8db2" },
    metadata,
  },
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
    type: "text_generated",
    content: {
      text: "Hello, how are you ?",
    },
    metadata,
  },
  {
    type: "token_usage",
    content: {
      inputTokens: 3186,
      outputTokens: 192,
      totalTokens: 3378,
    },
    metadata,
  },
  {
    type: "success",
    aggregated: [
      {
        type: "text_generated",
        content: {
          text: "Hello, how are you ?",
        },
        metadata,
      },
    ],
    textGenerated: {
      type: "text_generated",
      content: {
        text: "Hello, how are you ?",
      },
      metadata,
    },
    reasoningGenerated: undefined,
    toolCalls: undefined,
    metadata,
  },
];

const finishToolCallLLMEvents = [
  {
    type: "interaction_id",
    content: { modelInteractionId: "c02315a0f93e47ba87c64fe6479c219c" },
    metadata,
  },
  {
    type: "text_delta",
    content: {
      delta: "Hi !",
    },
    metadata,
  },
  {
    type: "text_generated",
    content: {
      text: "Hi !",
    },
    metadata,
  },
  {
    type: "tool_call",
    content: {
      id: "DdHr7L197",
      name: "web_search_browse__websearch",
      arguments: { query: "Paris France weather forecast October 23 2025" },
    },
    metadata,
  },
  {
    type: "token_usage",
    content: {
      inputTokens: 1766,
      outputTokens: 128,
      totalTokens: 1894,
    },
    metadata,
  },
  {
    type: "success",
    aggregated: [
      {
        type: "text_generated",
        content: {
          text: "Hi !",
        },
        metadata,
      },
      {
        type: "tool_call",
        content: {
          id: "DdHr7L197",
          name: "web_search_browse__websearch",
          arguments: { query: "Paris France weather forecast October 23 2025" },
        },
        metadata,
      },
    ],
    textGenerated: {
      type: "text_generated",
      content: {
        text: "Hi !",
      },
      metadata,
    },
    reasoningGenerated: undefined,
    toolCalls: [
      {
        type: "tool_call",
        content: {
          id: "DdHr7L197",
          name: "web_search_browse__websearch",
          arguments: { query: "Paris France weather forecast October 23 2025" },
        },
        metadata,
      },
    ],
    metadata,
  },
];
