import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { CLAUDE_4_SONNET_20250514_MODEL_ID } from "@app/types";

export const emptyToolCallLLMEvents: LLMEvent[] = [
  {
    type: "interaction_id",
    content: { modelInteractionId: "msg_017KE6ziN29Ks5KyL3jGE7RR" },
    metadata: {
      clientId: "anthropic" as const,
      modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
    },
  },
  {
    type: "tool_call",
    content: {
      id: "EmptyToolCall1",
      name: "test_tool",
      arguments: {},
    },
    metadata: {
      clientId: "anthropic" as const,
      modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
    },
  },
  {
    type: "token_usage",
    content: {
      inputTokens: 100,
      outputTokens: 20,
      cachedTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 120,
    },
    metadata: {
      clientId: "anthropic" as const,
      modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
    },
  },
  {
    type: "success",
    aggregated: [
      {
        type: "tool_call",
        content: {
          id: "EmptyToolCall1",
          name: "test_tool",
          arguments: {},
        },
        metadata: {
          clientId: "anthropic" as const,
          modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
        },
      },
    ],
    reasoningGenerated: undefined,
    textGenerated: undefined,
    toolCalls: [
      {
        type: "tool_call",
        content: {
          id: "EmptyToolCall1",
          name: "test_tool",
          arguments: {},
        },
        metadata: {
          clientId: "anthropic" as const,
          modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
        },
      },
    ],
    metadata: {
      clientId: "anthropic" as const,
      modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
    },
  },
];
