import type { GenerateContentResponse } from "@google/genai";
import { FinishReason } from "@google/genai";
import { describe, expect, it } from "vitest";

import { streamLLMEvents } from "@app/lib/api/llm/clients/google/utils/google_to_events";
import { createAsyncGenerator } from "@app/lib/api/llm/utils";

// Test-specific type that omits computed/derived properties from GenerateContentResponse
type PartialGenerateContentResponse = Omit<
  GenerateContentResponse,
  "text" | "data" | "functionCalls" | "executableCode" | "codeExecutionResult"
>;

describe("streamLLMEvents", () => {
  describe("when finish reason is stop", () => {
    it("should convert modelOutputFinishStopEvents to finishStopLLMEvents", async () => {
      const generateContentResponses = createAsyncGenerator(
        modelOutputFinishStopEvents as GenerateContentResponse[]
      );
      const result = [];

      for await (const event of streamLLMEvents({
        generateContentResponses,
        metadata,
      })) {
        result.push(event);
      }

      expect(result).toEqual(
        finishStopLLMEvents.map((e) => ({ ...e, metadata }))
      );
    });
  });

  describe("when finish reason has function calls", () => {
    it("should convert modelOutputFunctionCallEvents to functionCallLLMEvents", async () => {
      const generateContentResponses = createAsyncGenerator(
        modelOutputFunctionCallEvents as GenerateContentResponse[]
      );
      const result = [];

      for await (const event of streamLLMEvents({
        generateContentResponses,
        metadata,
      })) {
        result.push(event);
      }

      expect(result).toEqual(
        functionCallLLMEvents.map((e) => ({ ...e, metadata }))
      );
    });
  });
});

const modelOutputFinishStopEvents: PartialGenerateContentResponse[] = [
  {
    candidates: [
      {
        content: {
          parts: [
            {
              text: "Hello, ",
            },
          ],
          role: "model",
        },
        finishReason: undefined,
        index: 0,
      },
    ],
  },
  {
    candidates: [
      {
        content: {
          parts: [
            {
              text: "how are you ?",
            },
          ],
          role: "model",
        },
        finishReason: FinishReason.STOP,
        index: 0,
      },
    ],
    usageMetadata: {
      promptTokenCount: 3186,
      candidatesTokenCount: 192,
      totalTokenCount: 3378,
    },
  },
];

const modelOutputFunctionCallEvents: PartialGenerateContentResponse[] = [
  {
    candidates: [
      {
        content: {
          parts: [
            {
              text: "Hi !",
            },
          ],
          role: "model",
        },
        finishReason: undefined,
        index: 0,
      },
    ],
  },
  {
    candidates: [
      {
        content: {
          parts: [
            {
              functionCall: {
                id: "DdHr7L197",
                name: "web_search_browse__websearch",
                args: {
                  query: "Paris France weather forecast October 23 2025",
                },
              },
            },
          ],
          role: "model",
        },
        finishReason: FinishReason.STOP,
        index: 0,
      },
    ],
    usageMetadata: {
      promptTokenCount: 1766,
      candidatesTokenCount: 128,
      totalTokenCount: 1894,
    },
  },
];

const metadata = {
  clientId: "google_ai_studio",
  modelId: "gemini-2.5-pro",
} as const;

const finishStopLLMEvents = [
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

const functionCallLLMEvents = [
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
      cachedTokens: undefined,
      inputTokens: 1766,
      outputTokens: 128,
      reasoningTokens: undefined,
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
