import {
  convertToOldEvent,
  reasoningContentToLegacyMetadata,
  toBaseMessages,
} from "@app/lib/api/llm/transitionLLM";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
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
  providerId: "anthropic",
  api: "anthropic",
  region: "us",
  modelId: "claude-sonnet-4-6",
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
