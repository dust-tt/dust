import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { CLAUDE_4_SONNET_20250514_MODEL_ID } from "@app/types";

export const reasoningLLMEvents: LLMEvent[] = [
  {
    type: "interaction_id",
    content: { modelInteractionId: "msg_01Reasoning123" },
    metadata: {
      clientId: "anthropic" as const,
      modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
    },
  },
  {
    type: "reasoning_delta",
    content: {
      delta: "**Solving the Equation**\n\nI need to ",
    },
    metadata: {
      clientId: "anthropic" as const,
      modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
    },
  },
  {
    type: "reasoning_delta",
    content: {
      delta: "solve x^2 + 2x + 1 = 0.\n\n",
    },
    metadata: {
      clientId: "anthropic" as const,
      modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
    },
  },
  {
    type: "reasoning_generated",
    content: {
      text: "**Solving the Equation**\n\nI need to solve x^2 + 2x + 1 = 0.\n\n",
    },
    metadata: {
      clientId: "anthropic" as const,
      modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
      encrypted_content: "",
    },
  },
  {
    type: "text_delta",
    content: {
      delta: "The equation x² + 2x + 1 = 0 ",
    },
    metadata: {
      clientId: "anthropic" as const,
      modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
    },
  },
  {
    type: "text_delta",
    content: {
      delta: "factors as (x + 1)² = 0, giving x = -1.",
    },
    metadata: {
      clientId: "anthropic" as const,
      modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
    },
  },
  {
    type: "text_generated",
    content: {
      text: "The equation x² + 2x + 1 = 0 factors as (x + 1)² = 0, giving x = -1.",
    },
    metadata: {
      clientId: "anthropic" as const,
      modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
    },
  },
  {
    type: "token_usage",
    content: {
      inputTokens: 2500,
      outputTokens: 180,
      cachedTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 2680,
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
        type: "reasoning_generated",
        content: {
          text: "**Solving the Equation**\n\nI need to solve x^2 + 2x + 1 = 0.\n\n",
        },
        metadata: {
          clientId: "anthropic" as const,
          modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
          encrypted_content: "",
        },
      },
      {
        type: "text_generated",
        content: {
          text: "The equation x² + 2x + 1 = 0 factors as (x + 1)² = 0, giving x = -1.",
        },
        metadata: {
          clientId: "anthropic" as const,
          modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
        },
      },
    ],
    textGenerated: {
      type: "text_generated",
      content: {
        text: "The equation x² + 2x + 1 = 0 factors as (x + 1)² = 0, giving x = -1.",
      },
      metadata: {
        clientId: "anthropic" as const,
        modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
      },
    },
    reasoningGenerated: {
      type: "reasoning_generated",
      content: {
        text: "**Solving the Equation**\n\nI need to solve x^2 + 2x + 1 = 0.\n\n",
      },
      metadata: {
        clientId: "anthropic" as const,
        modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
        encrypted_content: "",
      },
    },
    toolCalls: undefined,
    metadata: {
      clientId: "anthropic" as const,
      modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
    },
  },
];
