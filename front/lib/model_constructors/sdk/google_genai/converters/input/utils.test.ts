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
    // no part (no empty `{ text: "" }` slips in).
    expect(contents).toEqual([
      { role: "model", parts: [{ text: "before" }, { text: "after" }] },
    ]);
  });
});
