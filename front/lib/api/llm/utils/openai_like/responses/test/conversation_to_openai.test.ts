import { toInput } from "@app/lib/api/llm/utils/openai_like/responses/conversation_to_openai";
import { conversationMessages } from "@app/lib/api/llm/utils/openai_like/responses/test/fixtures/conversation_messages";
import { inputMessages } from "@app/lib/api/llm/utils/openai_like/responses/test/fixtures/model_input";
import { describe, expect, it } from "vitest";

describe("toInput", () => {
  describe("user messages", () => {
    it("should convert user message with text and function calls.", () => {
      const prompt = "You are a helpful assistant.";
      const messages = toInput(prompt, { messages: conversationMessages });

      expect(messages).toEqual(inputMessages);
    });

    it("adds a cache breakpoint to the leading equipped-skills message", () => {
      const messages = toInput(
        "You are a helpful assistant.",
        {
          messages: [
            {
              role: "user",
              name: "system",
              content: [
                { type: "text", text: "Available" },
                { type: "text", text: "skills" },
              ],
            },
            ...conversationMessages,
          ],
        },
        "developer",
        { cacheBreakpointOnLeadingMessage: true }
      );

      expect(messages[1]).toEqual({
        role: "user",
        content: [
          { type: "input_text", text: "Available" },
          {
            type: "input_text",
            text: "skills",
            prompt_cache_breakpoint: { mode: "explicit" },
          },
        ],
      });
    });
  });
});
