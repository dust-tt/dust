import {
  assistantReasoningMessageToInputItems,
  assistantTextMessageToInputItem,
  userTextMessageToInputItem,
} from "@app/lib/model_constructors/sdk/openai_responses/converters/input/utils";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type {
  BaseAssistantReasoningMessage,
  BaseAssistantTextMessage,
  BaseUserTextMessage,
} from "@app/lib/model_constructors/types/input/messages";
import { GPT_5_4, GPT_5_6_SOL } from "@app/lib/model_constructors/types/models";
import { describe, expect, it } from "vitest";

describe("assistantTextMessageToInputItem", () => {
  it("resends the phase when present", () => {
    const message: BaseAssistantTextMessage = {
      role: "assistant",
      type: "text",
      content: { value: "here is the answer" },
      phase: "final_answer",
    };
    expect(assistantTextMessageToInputItem(message)).toEqual({
      role: "assistant",
      content: "here is the answer",
      phase: "final_answer",
    });
  });

  it("omits the phase key when absent", () => {
    const message: BaseAssistantTextMessage = {
      role: "assistant",
      type: "text",
      content: { value: "no phase here" },
    };
    expect(assistantTextMessageToInputItem(message)).toEqual({
      role: "assistant",
      content: "no phase here",
    });
  });
});

describe("prompt cache breakpoints", () => {
  const message: BaseUserTextMessage = {
    role: "user",
    type: "text",
    content: { value: "Available skills" },
    cache: "short",
  };
  const metadata: EndpointMetadata = {
    lab: "openai",
    host: "openai-responses",
    region: "us",
    model: GPT_5_6_SOL,
  };

  it("serializes a cache marker when explicit prompt caching is supported", () => {
    expect(userTextMessageToInputItem(message, metadata)).toEqual({
      role: "user",
      content: [
        {
          type: "input_text",
          text: "Available skills",
          prompt_cache_breakpoint: { mode: "explicit" },
        },
      ],
    });
  });

  it("does not serialize a cache marker for older models", () => {
    expect(
      userTextMessageToInputItem(message, { ...metadata, model: GPT_5_4 })
    ).toEqual({
      role: "user",
      content: [{ type: "input_text", text: "Available skills" }],
    });
  });

  it("does not serialize a cache marker when the message has not opted in", () => {
    expect(
      userTextMessageToInputItem({ ...message, cache: undefined }, metadata)
    ).toEqual({
      role: "user",
      content: [{ type: "input_text", text: "Available skills" }],
    });
  });
});

describe("assistantReasoningMessageToInputItems", () => {
  it("returns an empty array when there is no signature", () => {
    const message: BaseAssistantReasoningMessage = {
      role: "assistant",
      type: "reasoning",
      content: { value: "let me think" },
    };
    expect(assistantReasoningMessageToInputItems(message)).toEqual([]);
  });

  it("returns an empty array for an empty-string signature", () => {
    const message: BaseAssistantReasoningMessage = {
      role: "assistant",
      type: "reasoning",
      content: { value: "let me think" },
      signature: "",
    };
    expect(assistantReasoningMessageToInputItems(message)).toEqual([]);
  });

  it("puts the signature in the `id` field, not the encrypted content", () => {
    const message: BaseAssistantReasoningMessage = {
      role: "assistant",
      type: "reasoning",
      content: { value: "deep thoughts" },
      signature: "rs_123",
    };
    expect(assistantReasoningMessageToInputItems(message)).toEqual([
      {
        id: "rs_123",
        type: "reasoning",
        summary: [{ type: "summary_text", text: "deep thoughts" }],
      },
    ]);
  });

  it("emits `encrypted_content` alongside the id when present", () => {
    const message: BaseAssistantReasoningMessage = {
      role: "assistant",
      type: "reasoning",
      content: { value: "deep thoughts" },
      signature: "rs_123",
      encryptedContent: "gAAAA-encrypted-blob",
    };
    expect(assistantReasoningMessageToInputItems(message)).toEqual([
      {
        id: "rs_123",
        type: "reasoning",
        summary: [{ type: "summary_text", text: "deep thoughts" }],
        encrypted_content: "gAAAA-encrypted-blob",
      },
    ]);
  });

  it("omits the summary when the reasoning value is empty", () => {
    const message: BaseAssistantReasoningMessage = {
      role: "assistant",
      type: "reasoning",
      content: { value: "" },
      signature: "rs_123",
    };
    expect(assistantReasoningMessageToInputItems(message)).toEqual([
      { id: "rs_123", type: "reasoning", summary: [] },
    ]);
  });
});
