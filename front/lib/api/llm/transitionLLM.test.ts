import {
  convertToOldEvent,
  reasoningContentToLegacyMetadata,
  toBaseMessages,
  withMessageCacheBreakpoints,
} from "@app/lib/api/llm/transitionLLM";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { assistantReasoningMessageToInputItems } from "@app/lib/model_constructors/sdk/openai_responses/converters/input/utils";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
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

function reasoningMessage({
  provider,
  metadata,
}: {
  provider: ModelProviderIdType;
  metadata: string;
}) {
  return {
    role: "assistant" as const,
    name: "agent",
    contents: [
      {
        type: "reasoning" as const,
        value: {
          reasoning: "let me think",
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

  it("skips the equipped-skills breakpoint when the first message is not the name:system block", () => {
    const firstUserTurn: ModelMessageTypeMultiActionsWithoutContentFragment = {
      role: "user",
      name: "user",
      content: [{ type: "text", text: "hi" }],
    };

    const result = withMessageCacheBreakpoints(messages, firstUserTurn, {
      explicitTailBreakpoint: false,
    });

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
            standardOutput: 400,
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
        outputTokens: 400,
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
            standardOutput: 400,
            reasoning: 0,
          },
          metadata: endpointMetadata,
        },
        llmMetadata
      )
    ).toEqual({
      type: "token_usage",
      content: {
        inputTokens: 56_000,
        outputTokens: 400,
        reasoningTokens: 0,
        totalTokens: 56_400,
        cachedTokens: 20_000,
        cacheCreationTokens: 35_000,
        uncachedInputTokens: 1_000,
      },
      metadata: llmMetadata,
    });
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
