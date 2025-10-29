import { describe, expect, it } from "vitest";

import { toMessage } from "@app/lib/api/llm/clients/anthropic/utils/conversation_to_anthropic";
import { conversationMessages } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/conversation_messages";
import { inputMessages } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/model_input";

describe("toMessage", () => {
  describe("user messages", () => {
    it("should convert user message with text and function calls.", () => {
      const messages = conversationMessages.map(toMessage);

      expect(messages).toEqual(inputMessages);
    });
  });
});
