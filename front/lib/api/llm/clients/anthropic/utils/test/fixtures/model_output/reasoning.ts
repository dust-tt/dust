import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta.mjs";

import { CLAUDE_4_SONNET_20250514_MODEL_ID } from "@app/types";

export const reasoningModelEvents: BetaRawMessageStreamEvent[] = [
  {
    type: "message_start",
    message: {
      type: "message",
      model: CLAUDE_4_SONNET_20250514_MODEL_ID,
      id: "msg_01Reasoning123",
      role: "assistant",
      content: [],
      stop_reason: "end_turn",
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
      container: null,
      context_management: null,
    },
  },
  {
    type: "content_block_start",
    index: 0,
    content_block: {
      type: "thinking",
      thinking: "",
      signature: "",
    },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: {
      type: "thinking_delta",
      thinking: "**Solving the Equation**\n\nI need to ",
    },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: {
      type: "thinking_delta",
      thinking: "solve x^2 + 2x + 1 = 0.\n\n",
    },
  },
  {
    type: "content_block_stop",
    index: 0,
  },
  {
    type: "content_block_start",
    index: 1,
    content_block: {
      type: "text",
      text: "",
      citations: [],
    },
  },
  {
    type: "content_block_delta",
    index: 1,
    delta: {
      type: "text_delta",
      text: "The equation x² + 2x + 1 = 0 ",
    },
  },
  {
    type: "content_block_delta",
    index: 1,
    delta: {
      type: "text_delta",
      text: "factors as (x + 1)² = 0, giving x = -1.",
    },
  },
  {
    type: "content_block_stop",
    index: 1,
  },
  {
    type: "message_delta",
    delta: {
      stop_reason: "end_turn",
      stop_sequence: null,
      container: null,
    },
    context_management: null,
    usage: {
      input_tokens: 2500,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 180,
      server_tool_use: null,
    },
  },
  {
    type: "message_stop",
  },
];
