import {
  convertToOldEvent,
  getPromptCacheKeyForHost,
  reasoningContentToLegacyMetadata,
  toBaseMessages,
  withMessageCacheBreakpoints,
} from "@app/lib/api/llm/transitionLLM";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { assistantReasoningMessageToInputItems } from "@app/lib/model_constructors/sdk/openai_responses/converters/input/utils";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import {
  ANTHROPIC_HOST,
  OPENAI_RESPONSES_HOST,
  XAI_HOST,
} from "@app/lib/model_constructors/types/hosts";
import type { BaseMessage } from "@app/lib/model_constructors/types/input/messages";
import type { ProviderPassthroughEvent } from "@app/lib/model_constructors/types/output/events";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types/assistant/generation";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { describe, expect, it } from "vitest";

const llmMetadata: LLMClientMetadata = {
  clientId: "anthropic",
  inferenceProvider: "anthropic",
  inferenceRegion: "global",
  modelId: "claude-sonnet-4-6",
};

const endpointMetadata: EndpointMetadata = {
  lab: "anthropic",
  host: "anthropic",
  region: "us",
  model: "claude-sonnet-4-6",
};

const serverToolUseBlock = {
  type: "server_tool_use",
  id: "srvtoolu_1",
  name: "tool_search_tool_bm25",
  input: { query: "x" },
};

describe("getPromptCacheKeyForHost", () => {
  const metadata = {
    workspaceId: "workspace",
    agentConfigurationId: "agent",
  };

  it("uses a stable key for OpenAI and xAI Responses hosts", () => {
    expect(getPromptCacheKeyForHost(OPENAI_RESPONSES_HOST, metadata)).toBe(
      "workspace:agent"
    );
    expect(getPromptCacheKeyForHost(XAI_HOST, metadata)).toBe(
      "workspace:agent"
    );
  });

  it("omits the key for other hosts", () => {
    expect(getPromptCacheKeyForHost(ANTHROPIC_HOST, metadata)).toBeUndefined();
  });
});

function reasoningMessage({
  provider,
  metadata,
  reasoning = "let me think",
}: {
  provider: ModelProviderIdType;
  metadata: string;
  reasoning?: string;
}) {
  return {
    role: "assistant" as const,
    name: "agent",
    contents: [
      {
        type: "reasoning" as const,
        value: {
          reasoning,
          metadata,
          tokens: 10,
          provider,
        },
      },
    ],
  };
}

describe("toBaseMessages", () => {
  it("maps a provider_passthrough content to a passthrough BaseMessage", () => {
    const message: ModelMessageTypeMultiActionsWithoutContentFragment = {
      role: "assistant",
      name: "agent",
      contents: [
        { type: "text_content", value: "hi" },
        {
          type: "provider_passthrough",
          value: { provider: "anthropic", block: serverToolUseBlock },
        },
      ],
    };

    expect(toBaseMessages(message)).toEqual([
      { role: "assistant", type: "text", content: { value: "hi" } },
      {
        role: "assistant",
        type: "provider_passthrough",
        content: { provider: "anthropic", block: serverToolUseBlock },
      },
    ]);
  });

  it("preserves a function call namespace", () => {
    const message: ModelMessageTypeMultiActionsWithoutContentFragment = {
      role: "assistant",
      name: "agent",
      contents: [
        {
          type: "function_call",
          value: {
            id: "call_123",
            name: "get_weather",
            arguments: "{}",
            namespace: "weather",
          },
        },
      ],
    };

    expect(toBaseMessages(message)).toEqual([
      {
        role: "assistant",
        type: "tool_call_request",
        content: {
          callId: "call_123",
          toolName: "get_weather",
          arguments: "{}",
          namespace: "weather",
        },
        signature: undefined,
      },
    ]);
  });
});

describe("withMessageCacheBreakpoints", () => {
  const cacheOf = (m: BaseMessage) => ("cache" in m ? m.cache : undefined);

  const equippedSkillsMessage: ModelMessageTypeMultiActionsWithoutContentFragment =
    {
      role: "user",
      name: "system",
      content: [{ type: "text", text: "equipped skills" }],
    };

  const messages: BaseMessage[] = [
    { role: "user", type: "text", content: { value: "equipped skills" } },
    { role: "assistant", type: "text", content: { value: "hello" } },
    { role: "user", type: "text", content: { value: "latest turn" } },
  ];

  it("caches the equipped-skills block and, on the Anthropic API, leaves the tail to the top-level cache", () => {
    const result = withMessageCacheBreakpoints(
      messages,
      equippedSkillsMessage,
      {
        explicitTailBreakpoint: false,
      }
    );

    expect(cacheOf(result[0])).toBe("short");
    expect(cacheOf(result[1])).toBeUndefined();
    expect(cacheOf(result[2])).toBeUndefined();
  });

  it("also caches the last user message when an explicit tail breakpoint is required (Vertex/agent-platform)", () => {
    const result = withMessageCacheBreakpoints(
      messages,
      equippedSkillsMessage,
      {
        explicitTailBreakpoint: true,
      }
    );

    expect(cacheOf(result[0])).toBe("short");
    expect(cacheOf(result[2])).toBe("short");
  });

  it("leaves a favorite skills message after the shared prefix unmarked", () => {
    const result = withMessageCacheBreakpoints(
      [
        messages[0],
        { role: "user", type: "text", content: { value: "favorite skills" } },
        ...messages.slice(1),
      ],
      equippedSkillsMessage,
      { explicitTailBreakpoint: false }
    );

    expect(cacheOf(result[0])).toBe("short");
    expect(cacheOf(result[1])).toBeUndefined();
  });

  it("preserves the full message shape and places cache breakpoints around favorite skills", () => {
    const conversation: ModelMessageTypeMultiActionsWithoutContentFragment[] = [
      equippedSkillsMessage,
      {
        role: "user",
        name: "user",
        content: [{ type: "text", text: "favorite skills" }],
      },
      {
        role: "assistant",
        name: "agent",
        contents: [{ type: "text_content", value: "hello" }],
      },
      {
        role: "user",
        name: "user",
        content: [{ type: "text", text: "latest turn" }],
      },
    ];

    const result = withMessageCacheBreakpoints(
      conversation.flatMap(toBaseMessages),
      conversation[0],
      { explicitTailBreakpoint: true }
    );

    expect(result).toEqual([
      {
        role: "user",
        type: "text",
        content: { value: "equipped skills" },
        cache: "short",
      },
      {
        role: "user",
        type: "text",
        content: { value: "favorite skills" },
      },
      {
        role: "assistant",
        type: "text",
        content: { value: "hello" },
      },
      {
        role: "user",
        type: "text",
        content: { value: "latest turn" },
        cache: "short",
      },
    ]);
  });

  it("does not cache favorite skills when there is no shared equipped prefix", () => {
    const favoriteSkillsMessage: ModelMessageTypeMultiActionsWithoutContentFragment =
      {
        role: "user",
        name: "user",
        content: [{ type: "text", text: "favorite skills" }],
      };

    const result = withMessageCacheBreakpoints(
      messages,
      favoriteSkillsMessage,
      { explicitTailBreakpoint: false }
    );

    expect(result.every((m) => cacheOf(m) === undefined)).toBe(true);
  });

  it("does not mutate the input array", () => {
    const input: BaseMessage[] = [
      { role: "user", type: "text", content: { value: "equipped skills" } },
    ];

    withMessageCacheBreakpoints(input, equippedSkillsMessage, {
      explicitTailBreakpoint: true,
    });

    expect(cacheOf(input[0])).toBeUndefined();
  });
});

describe("toBaseMessages — reasoning signatures", () => {
  it("keeps the Anthropic signature (stored under encrypted_content) in `signature`", () => {
    const result = toBaseMessages(
      reasoningMessage({
        provider: "anthropic",
        metadata: JSON.stringify({ encrypted_content: "anthropic-sig" }),
      })
    );
    expect(result).toEqual([
      {
        role: "assistant",
        type: "reasoning",
        content: { value: "let me think" },
        signature: "anthropic-sig",
      },
    ]);
  });

  it("keeps the Gemini thoughtSignature (stored under encrypted_content) in `signature`", () => {
    const result = toBaseMessages(
      reasoningMessage({
        provider: "google_ai_studio",
        metadata: JSON.stringify({ encrypted_content: "gemini-thought-sig" }),
      })
    );
    expect(result).toEqual([
      {
        role: "assistant",
        type: "reasoning",
        content: { value: "let me think" },
        signature: "gemini-thought-sig",
      },
    ]);
  });

  it("splits OpenAI metadata into the short id (`signature`) and `encryptedContent`", () => {
    const result = toBaseMessages(
      reasoningMessage({
        provider: "openai",
        metadata: JSON.stringify({
          id: "rs_123",
          encrypted_content: "gAAAA-encrypted-blob",
        }),
      })
    );
    expect(result).toEqual([
      {
        role: "assistant",
        type: "reasoning",
        content: { value: "let me think" },
        signature: "rs_123",
        encryptedContent: "gAAAA-encrypted-blob",
      },
    ]);
  });

  it("keeps a Fireworks Responses reasoning id in `signature`", () => {
    const result = toBaseMessages(
      reasoningMessage({
        provider: "fireworks",
        metadata: JSON.stringify({ id: "rs_fireworks_123" }),
      })
    );
    expect(result).toEqual([
      {
        role: "assistant",
        type: "reasoning",
        content: { value: "let me think" },
        signature: "rs_fireworks_123",
      },
    ]);
  });
});

describe("OpenAI reasoning round-trip — persisted metadata to Responses input", () => {
  it("resends the original reasoning item id and its encrypted content", () => {
    const [baseMessage] = toBaseMessages(
      reasoningMessage({
        provider: "openai",
        metadata: JSON.stringify({
          id: "rs_123",
          encrypted_content: "gAAAA-encrypted-blob",
        }),
      })
    );
    if (baseMessage.type !== "reasoning") {
      throw new Error("Expected a reasoning BaseMessage.");
    }
    expect(assistantReasoningMessageToInputItems(baseMessage)).toEqual([
      {
        id: "rs_123",
        type: "reasoning",
        summary: [{ type: "summary_text", text: "let me think" }],
        encrypted_content: "gAAAA-encrypted-blob",
      },
    ]);
  });
});

describe("Fireworks reasoning round-trip — persisted metadata to Responses input", () => {
  it("replays an id-bearing reasoning item with an empty summary", () => {
    const [baseMessage] = toBaseMessages(
      reasoningMessage({
        provider: "fireworks",
        metadata: JSON.stringify({ id: "rs_fireworks_empty" }),
        reasoning: "",
      })
    );
    if (baseMessage.type !== "reasoning") {
      throw new Error("Expected a reasoning BaseMessage.");
    }

    expect(assistantReasoningMessageToInputItems(baseMessage)).toEqual([
      {
        id: "rs_fireworks_empty",
        type: "reasoning",
        summary: [],
      },
    ]);
  });

  it("preserves interleaved reasoning ids and tool calls in wire order", () => {
    const message: ModelMessageTypeMultiActionsWithoutContentFragment = {
      role: "assistant",
      name: "agent",
      contents: [
        {
          type: "reasoning",
          value: {
            reasoning: "first thought",
            metadata: JSON.stringify({ id: "rs_fireworks_1" }),
            tokens: 10,
            provider: "fireworks",
          },
        },
        {
          type: "function_call",
          value: {
            id: "call_1",
            name: "first_tool",
            arguments: "{}",
          },
        },
        {
          type: "reasoning",
          value: {
            reasoning: "second thought",
            metadata: JSON.stringify({ id: "rs_fireworks_2" }),
            tokens: 10,
            provider: "fireworks",
          },
        },
        {
          type: "function_call",
          value: {
            id: "call_2",
            name: "second_tool",
            arguments: "{}",
          },
        },
      ],
    };

    expect(toBaseMessages(message)).toEqual([
      {
        role: "assistant",
        type: "reasoning",
        content: { value: "first thought" },
        signature: "rs_fireworks_1",
      },
      {
        role: "assistant",
        type: "tool_call_request",
        content: {
          callId: "call_1",
          toolName: "first_tool",
          arguments: "{}",
          namespace: undefined,
        },
        signature: undefined,
      },
      {
        role: "assistant",
        type: "reasoning",
        content: { value: "second thought" },
        signature: "rs_fireworks_2",
      },
      {
        role: "assistant",
        type: "tool_call_request",
        content: {
          callId: "call_2",
          toolName: "second_tool",
          arguments: "{}",
          namespace: undefined,
        },
        signature: undefined,
      },
    ]);
  });
});

describe("convertToOldEvent — token_usage", () => {
  it("sums the per-TTL cache-creation breakdown into cacheCreationTokens and keeps the split", () => {
    expect(
      convertToOldEvent(
        {
          type: "token_usage",
          content: {
            cacheCreated: 0,
            longCacheCreated: 30_000,
            shortCacheCreated: 5_000,
            cacheHit: 20_000,
            standardInput: 1_000,
            totalOutput: 500,
            reasoning: 100,
          },
          metadata: endpointMetadata,
        },
        llmMetadata
      )
    ).toEqual({
      type: "token_usage",
      content: {
        inputTokens: 56_000,
        totalOutputTokens: 500,
        reasoningTokens: 100,
        totalTokens: 56_500,
        cachedTokens: 20_000,
        cacheCreationTokens: 35_000,
        longCacheCreationTokens: 30_000,
        shortCacheCreationTokens: 5_000,
        uncachedInputTokens: 1_000,
      },
      metadata: llmMetadata,
    });
  });

  it("keeps a flat cache-creation total without inventing a TTL split", () => {
    expect(
      convertToOldEvent(
        {
          type: "token_usage",
          content: {
            cacheCreated: 35_000,
            longCacheCreated: 0,
            shortCacheCreated: 0,
            cacheHit: 20_000,
            standardInput: 1_000,
            totalOutput: 400,
          },
          metadata: endpointMetadata,
        },
        llmMetadata
      )
    ).toEqual({
      type: "token_usage",
      content: {
        inputTokens: 56_000,
        totalOutputTokens: 400,
        totalTokens: 56_400,
        cachedTokens: 20_000,
        cacheCreationTokens: 35_000,
        uncachedInputTokens: 1_000,
      },
      metadata: llmMetadata,
    });
  });

  it("rejects reasoning tokens that are not a subset of output tokens", () => {
    expect(() =>
      convertToOldEvent(
        {
          type: "token_usage",
          content: {
            cacheCreated: 0,
            longCacheCreated: 0,
            shortCacheCreated: 0,
            cacheHit: 0,
            standardInput: 0,
            totalOutput: 100,
            reasoning: 101,
          },
          metadata: endpointMetadata,
        },
        llmMetadata
      )
    ).toThrow("reasoning must be a non-negative subset of totalOutput");
  });
});

describe("convertToOldEvent", () => {
  it("forwards a provider_passthrough event with its content and the old metadata", () => {
    const event: ProviderPassthroughEvent = {
      type: "provider_passthrough",
      content: { provider: "anthropic", block: serverToolUseBlock },
      metadata: endpointMetadata,
    };

    expect(convertToOldEvent(event, llmMetadata)).toEqual({
      type: "provider_passthrough",
      content: { provider: "anthropic", block: serverToolUseBlock },
      metadata: llmMetadata,
    });
  });

  it("preserves a function call namespace", () => {
    expect(
      convertToOldEvent(
        {
          type: "tool_call",
          content: {
            id: "call_123",
            name: "get_weather",
            arguments: {},
            namespace: "weather",
          },
          metadata: endpointMetadata,
        },
        llmMetadata
      )
    ).toEqual({
      type: "tool_call",
      content: {
        id: "call_123",
        name: "get_weather",
        arguments: {},
        namespace: "weather",
      },
      metadata: llmMetadata,
    });
  });

  it("maps response_id to interaction_id, carrying the cache miss reason", () => {
    expect(
      convertToOldEvent(
        {
          type: "response_id",
          content: { responseId: "msg_123" },
          metadata: {
            ...endpointMetadata,
            content: {
              cacheMissReason: {
                type: "system_changed",
                cacheMissedInputTokens: 42,
              },
            },
          },
        },
        llmMetadata
      )
    ).toEqual({
      type: "interaction_id",
      content: {
        modelInteractionId: "msg_123",
        cacheMissReason: { type: "system_changed", cacheMissedInputTokens: 42 },
      },
      metadata: llmMetadata,
    });
  });

  it("maps response_id to interaction_id without a cache miss reason", () => {
    expect(
      convertToOldEvent(
        {
          type: "response_id",
          content: { responseId: "msg_123" },
          metadata: endpointMetadata,
        },
        llmMetadata
      )
    ).toEqual({
      type: "interaction_id",
      content: { modelInteractionId: "msg_123", cacheMissReason: undefined },
      metadata: llmMetadata,
    });
  });
});

describe("reasoningContentToLegacyMetadata — persistence write path", () => {
  it("lifts OpenAI id + encryptedContent to the legacy top-level shape", () => {
    expect(
      reasoningContentToLegacyMetadata({
        id: "rs_123",
        encryptedContent: "gAAAA-encrypted-blob",
      })
    ).toEqual({ id: "rs_123", encrypted_content: "gAAAA-encrypted-blob" });
  });

  it("lifts an Anthropic/Gemini signature to top-level encrypted_content", () => {
    expect(
      reasoningContentToLegacyMetadata({ signature: "anthropic-sig" })
    ).toEqual({ encrypted_content: "anthropic-sig" });
  });

  it("keeps the id alone when there is no encrypted content", () => {
    expect(reasoningContentToLegacyMetadata({ id: "rs_123" })).toEqual({
      id: "rs_123",
    });
  });

  it("returns an empty object when content is missing", () => {
    expect(reasoningContentToLegacyMetadata(undefined)).toEqual({});
  });
});
