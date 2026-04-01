import { createAsyncGenerator } from "@app/lib/api/llm/utils";
import { streamLLMEvents } from "@app/lib/api/llm/utils/openai_like/chat/openai_to_events";
import type { ChatCompletionChunk } from "openai/resources/chat/completions";
import { describe, expect, it } from "vitest";

const metadata = {
  clientId: "openai",
  modelId: "gpt-5",
} as const;

const toolCallChunks = [
  {
    id: "chatcmpl_test",
    object: "chat.completion.chunk",
    created: 1,
    model: "gpt-5",
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              function: {
                name: "create_interactive_content_file",
              },
            },
          ],
        },
        finish_reason: null,
        logprobs: null,
      },
    ],
  },
  {
    id: "chatcmpl_test",
    object: "chat.completion.chunk",
    created: 1,
    model: "gpt-5",
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call_123",
            },
          ],
        },
        finish_reason: null,
        logprobs: null,
      },
    ],
  },
  {
    id: "chatcmpl_test",
    object: "chat.completion.chunk",
    created: 1,
    model: "gpt-5",
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              function: {
                arguments: '{"prompt":"hi"}',
              },
            },
          ],
        },
        finish_reason: null,
        logprobs: null,
      },
    ],
  },
  {
    id: "chatcmpl_test",
    object: "chat.completion.chunk",
    created: 1,
    model: "gpt-5",
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: "tool_calls",
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: 1,
      completion_tokens: 2,
      total_tokens: 3,
    },
  },
] satisfies ChatCompletionChunk[];

describe("streamLLMEvents", () => {
  it("should emit a tool call start before the first arguments chunk", async () => {
    const result = [];

    for await (const event of streamLLMEvents(
      createAsyncGenerator(toolCallChunks),
      metadata
    )) {
      result.push(event);
    }

    expect(result).toEqual([
      {
        type: "interaction_id",
        content: {
          modelInteractionId: "chatcmpl_test",
        },
        metadata,
      },
      {
        type: "tool_call_started",
        content: {
          index: 0,
          name: "create_interactive_content_file",
        },
        metadata,
      },
      {
        type: "tool_call_delta",
        metadata,
      },
      {
        type: "tool_call_started",
        content: {
          id: "call_123",
          index: 0,
          name: "create_interactive_content_file",
        },
        metadata,
      },
      {
        type: "tool_call_delta",
        metadata,
      },
      {
        type: "tool_call_delta",
        metadata,
      },
      {
        type: "token_usage",
        content: {
          inputTokens: 1,
          outputTokens: 2,
          totalTokens: 3,
          cachedTokens: undefined,
        },
        metadata,
      },
      {
        type: "tool_call",
        content: {
          id: "call_123",
          name: "create_interactive_content_file",
          arguments: {
            prompt: "hi",
          },
        },
        metadata,
      },
      {
        type: "success",
        aggregated: [
          {
            type: "tool_call",
            content: {
              id: "call_123",
              name: "create_interactive_content_file",
              arguments: {
                prompt: "hi",
              },
            },
            metadata,
          },
        ],
        textGenerated: undefined,
        reasoningGenerated: undefined,
        toolCalls: [
          {
            type: "tool_call",
            content: {
              id: "call_123",
              name: "create_interactive_content_file",
              arguments: {
                prompt: "hi",
              },
            },
            metadata,
          },
        ],
        metadata,
      },
    ]);
  });
});
