import { assistantReasoningMessageToInputItems } from "@app/lib/model_constructors/sdk/openai_responses/converters/input/utils";
import type { BaseAssistantReasoningMessage } from "@app/lib/model_constructors/types/input/messages";
import { describe, expect, it } from "vitest";

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
