import type { LLMEvent } from "@app/lib/api/llm/types/events";

export const toolUseLLMEvents: LLMEvent[] = [
  {
    type: "text_delta",
    content: {
      delta: "Hello, ",
    },
    metadata: {
      providerId: "anthropic" as const,
      modelId: "claude-sonnet-4-20250514",
    },
  },
  {
    type: "text_delta",
    content: {
      delta: "how are you ?",
    },
    metadata: {
      providerId: "anthropic" as const,
      modelId: "claude-sonnet-4-20250514",
    },
  },
  {
    type: "tool_call",
    content: {
      id: "DdHr7L197",
      name: "web_search_browse__websearch",
      arguments: '{"query":"Paris France weather forecast October 23 2025"}',
    },
    metadata: {
      providerId: "anthropic" as const,
      modelId: "claude-sonnet-4-20250514",
    },
  },
  {
    type: "token_usage",
    content: {
      inputTokens: 1766,
      outputTokens: 128,
      cachedTokens: 0,
      totalTokens: 1894,
    },
    metadata: {
      providerId: "anthropic" as const,
      modelId: "claude-sonnet-4-20250514",
    },
  },
  {
    type: "text_generated",
    content: {
      text: "Hello, how are you ?",
    },
    metadata: {
      providerId: "anthropic" as const,
      modelId: "claude-sonnet-4-20250514",
    },
  },
];
