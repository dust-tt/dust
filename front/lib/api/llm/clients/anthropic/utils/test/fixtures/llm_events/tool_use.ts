import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { CLAUDE_4_SONNET_20250514_MODEL_ID } from "@app/types";

export const toolUseLLMEvents: LLMEvent[] = [
  {
    type: "text_delta",
    content: {
      delta: "Hello, ",
    },
    metadata: {
      clientId: "anthropic" as const,
      modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
    },
  },
  {
    type: "text_delta",
    content: {
      delta: "how are you ?",
    },
    metadata: {
      clientId: "anthropic" as const,
      modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
    },
  },
  {
    type: "text_generated",
    content: {
      text: "Hello, how are you ?",
    },
    metadata: {
      clientId: "anthropic" as const,
      modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
    },
  },
  {
    type: "tool_call",
    content: {
      id: "DdHr7L197",
      name: "web_search_browse__websearch",
      arguments: { query: "Paris France weather forecast October 23 2025" },
    },
    metadata: {
      clientId: "anthropic" as const,
      modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
    },
  },
  {
    type: "token_usage",
    content: {
      inputTokens: 1766,
      outputTokens: 128,
      cachedTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 1894,
    },
    metadata: {
      clientId: "anthropic" as const,
      modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
    },
  },
];
