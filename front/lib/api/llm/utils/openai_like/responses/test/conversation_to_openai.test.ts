import { describe, expect, it } from "vitest";

import { toInput } from "@app/lib/api/llm/utils/openai_like/responses/conversation_to_openai";
import { conversationMessages } from "@app/lib/api/llm/utils/openai_like/responses/test/fixtures/conversation_messages";
import { inputMessages } from "@app/lib/api/llm/utils/openai_like/responses/test/fixtures/model_input";

describe("toInput", () => {
  describe("user messages", () => {
    it("should convert user message with text and function calls.", () => {
      const prompt = "You are a helpful assistant.";
      const messages = toInput(prompt, { messages: conversationMessages });

      expect(messages).toEqual(inputMessages);
    });
  });
});
