import {
  convertToOldEvent,
  toBaseMessages,
} from "@app/lib/api/llm/transitionLLM";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type { ProviderPassthroughEvent } from "@app/lib/model_constructors/types/output/events";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types/assistant/generation";
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
