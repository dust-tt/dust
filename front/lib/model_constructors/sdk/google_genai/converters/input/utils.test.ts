import type { ContentBlockConverters } from "@app/lib/model_constructors/sdk/google_genai/converters/input/utils";
import {
  assistantReasoningMessageToPart,
  assistantTextMessageToPart,
  assistantToolCallRequestToPart,
  conversationToContents,
  systemMessageToPart,
  toolCallResultMessageToContent,
  userImageMessageToPart,
  userTextMessageToPart,
} from "@app/lib/model_constructors/sdk/google_genai/converters/input/utils";
import type { BaseConversation } from "@app/lib/model_constructors/types/input/messages";
import { describe, expect, it } from "vitest";

const converters: ContentBlockConverters = {
  systemMessageToPart,
  userTextMessageToPart,
  userImageMessageToPart,
  toolCallResultMessageToContent,
  assistantTextMessageToPart,
  assistantReasoningMessageToPart,
  assistantToolCallRequestToPart,
};

describe("conversationToContents — provider_passthrough", () => {
  it("drops a passthrough message without injecting an empty part or breaking the same-role merge", async () => {
    const conversation: BaseConversation = {
      system: [],
      messages: [
        { role: "assistant", type: "text", content: { value: "before" } },
        {
          role: "assistant",
          type: "provider_passthrough",
          content: {
            provider: "anthropic",
            block: { type: "server_tool_use", id: "x", name: "y", input: {} },
          },
        },
        { role: "assistant", type: "text", content: { value: "after" } },
      ],
    };

    const contents = await conversationToContents(conversation, converters);

    // The two text turns merge into one model Content; the passthrough produces
    // no part (no empty `{ text: "" }` slips in). The trailing model turn is
    // closed by the synthetic user turn.
    expect(contents).toEqual([
      { role: "model", parts: [{ text: "before" }, { text: "after" }] },
      { role: "user", parts: [{ text: "." }] },
    ]);
  });
});

describe("conversationToContents — trailing model turn", () => {
  it("appends a user turn when the conversation ends on an assistant turn", async () => {
    const conversation: BaseConversation = {
      system: [],
      messages: [
        { role: "user", type: "text", content: { value: "hello" } },
        { role: "assistant", type: "text", content: { value: "hi" } },
      ],
    };

    const contents = await conversationToContents(conversation, converters);

    expect(contents).toEqual([
      { role: "user", parts: [{ text: "hello" }] },
      { role: "model", parts: [{ text: "hi" }] },
      { role: "user", parts: [{ text: "." }] },
    ]);
  });

  it("leaves a conversation already ending on a user turn untouched", async () => {
    const conversation: BaseConversation = {
      system: [],
      messages: [
        { role: "assistant", type: "text", content: { value: "hi" } },
        { role: "user", type: "text", content: { value: "hello" } },
      ],
    };

    const contents = await conversationToContents(conversation, converters);

    expect(contents).toEqual([
      { role: "model", parts: [{ text: "hi" }] },
      { role: "user", parts: [{ text: "hello" }] },
    ]);
  });

  it("returns no contents for an empty conversation", async () => {
    const contents = await conversationToContents(
      { system: [], messages: [] },
      converters
    );

    expect(contents).toEqual([]);
  });

  it("appends nothing when every message converts to nothing", async () => {
    // A passthrough-only conversation converts to no Contents at all. There is
    // no trailing model turn to close, so the guard stays out of it rather than
    // inventing a user turn for a request that has nothing to answer.
    const conversation: BaseConversation = {
      system: [],
      messages: [
        {
          role: "assistant",
          type: "provider_passthrough",
          content: {
            provider: "anthropic",
            block: { type: "server_tool_use", id: "x", name: "y", input: {} },
          },
        },
      ],
    };

    const contents = await conversationToContents(conversation, converters);

    expect(contents).toEqual([]);
  });
});
