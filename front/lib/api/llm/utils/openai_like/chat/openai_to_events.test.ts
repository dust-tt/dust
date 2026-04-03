import { createAsyncGenerator } from "@app/lib/api/llm/utils";
import { streamLLMEvents } from "@app/lib/api/llm/utils/openai_like/chat/openai_to_events";
import type { ChatCompletionChunk } from "openai/resources/chat/completions";
import { describe, expect, it } from "vitest";

const metadata = {
  clientId: "openai",
  modelId: "gpt-5",
} as const;

type ChunkDelta = ChatCompletionChunk["choices"][number]["delta"];
type ChunkFinishReason =
  ChatCompletionChunk["choices"][number]["finish_reason"];
type ChunkUsage = ChatCompletionChunk["usage"];

function makeChunk({
  delta,
  finishReason = null,
  usage,
}: {
  delta: ChunkDelta;
  finishReason?: ChunkFinishReason;
  usage?: ChunkUsage;
}): ChatCompletionChunk {
  return {
    id: "chatcmpl_test",
    object: "chat.completion.chunk",
    created: 1,
    model: "gpt-5",
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
        logprobs: null,
      },
    ],
    ...(usage ? { usage } : {}),
  };
}

const toolCallChunks = [
  makeChunk({
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
  }),
  makeChunk({
    delta: {
      tool_calls: [
        {
          index: 0,
          id: "call_123",
        },
      ],
    },
  }),
  makeChunk({
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
  }),
  makeChunk({
    delta: {},
    finishReason: "tool_calls",
    usage: {
      prompt_tokens: 1,
      completion_tokens: 2,
      total_tokens: 3,
    },
  }),
] satisfies ChatCompletionChunk[];

const chunkedToolNameChunks = [
  makeChunk({
    delta: {
      tool_calls: [
        {
          index: 0,
          id: "call_123",
          function: {
            name: "create_inter",
          },
        },
      ],
    },
  }),
  makeChunk({
    delta: {
      tool_calls: [
        {
          index: 0,
          function: {
            name: "active_content_file",
          },
        },
      ],
    },
  }),
  makeChunk({
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
  }),
  makeChunk({
    delta: {},
    finishReason: "tool_calls",
    usage: {
      prompt_tokens: 1,
      completion_tokens: 2,
      total_tokens: 3,
    },
  }),
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

  it("should re-emit tool call start when the streamed tool name grows", async () => {
    const result = [];

    for await (const event of streamLLMEvents(
      createAsyncGenerator(chunkedToolNameChunks),
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
          id: "call_123",
          index: 0,
          name: "create_inter",
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
