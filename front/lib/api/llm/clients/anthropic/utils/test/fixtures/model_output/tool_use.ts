import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta.mjs";

import { CLAUDE_4_SONNET_20250514_MODEL_ID } from "@app/types";

export const toolUseModelEvents: BetaRawMessageStreamEvent[] = [
  {
    type: "message_start",
    message: {
      type: "message",
      model: CLAUDE_4_SONNET_20250514_MODEL_ID,
      id: "msg_017KE6ziN29Ks5KyL3jGE7RR",
      role: "assistant",
      content: [],
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
      container: null,
      context_management: null,
    },
  },
  {
    type: "content_block_start",
    index: 0,
    content_block: {
      type: "text",
      text: "",
      citations: [],
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
    type: "content_block_stop",
    index: 0,
  },
  {
    type: "content_block_start",
    index: 1,
    content_block: {
      type: "tool_use",
      id: "DdHr7L197",
      name: "web_search_browse__websearch",
      input: "",
    },
  },
  {
    type: "content_block_delta",
    index: 1,
    delta: {
      type: "input_json_delta",
      partial_json: '{"query":"Paris France weather forecast October 23 2025"}',
    },
  },
  {
    type: "content_block_stop",
    index: 1,
  },
  {
    type: "message_delta",
    delta: {
      stop_reason: "tool_use",
      stop_sequence: null,
      container: null,
    },
    context_management: null,
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
