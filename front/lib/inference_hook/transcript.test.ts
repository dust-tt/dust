import {
  buildInferenceHookTranscript,
  trailingAssistantFromOutput,
} from "@app/lib/inference_hook/transcript";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import { describe, expect, it } from "vitest";

describe("buildInferenceHookTranscript", () => {
  it("includes system prompt and maps user/assistant/tool messages", () => {
    const modelConversation: ModelConversationTypeMultiActions = {
      messages: [
        {
          role: "user",
          name: "user",
          content: [{ type: "text", text: "hi" }],
        },
        {
          role: "assistant",
          function_calls: [{ id: "call_1", name: "search", arguments: "{}" }],
          contents: [{ type: "text_content", value: "searching" }],
        },
        {
          role: "function",
          name: "search",
          function_call_id: "call_1",
          content: "results",
        },
      ],
    };

    const messages = buildInferenceHookTranscript({
      systemPrompt: "You are helpful.",
      modelConversation,
    });

    expect(messages[0]).toEqual({
      role: "system",
      content: "You are helpful.",
    });
    expect(messages[1]).toEqual({ role: "user", content: "hi" });
    expect(messages[2]).toMatchObject({
      role: "assistant",
      content: "searching",
      tool_calls: [
        {
          id: "call_1",
          function: { name: "search", arguments: "{}" },
        },
      ],
    });
    expect(messages[3]).toEqual({
      role: "tool",
      content: "results",
      tool_call_id: "call_1",
    });
  });
});

describe("trailingAssistantFromOutput", () => {
  it("builds an assistant message with function calls from step output", () => {
    const trailing = trailingAssistantFromOutput({
      generation: "done",
      contents: [
        { type: "text_content", value: "done" },
        {
          type: "function_call",
          value: { id: "c1", name: "tool", arguments: "{}" },
        },
      ],
    });

    expect(trailing.role).toBe("assistant");
    expect(trailing.function_calls).toEqual([
      { id: "c1", name: "tool", arguments: "{}" },
    ]);
    expect(trailing.contents).toHaveLength(2);
  });
});
