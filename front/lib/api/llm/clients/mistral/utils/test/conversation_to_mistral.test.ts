import { describe, expect, it } from "vitest";

import { toMessage } from "@app/lib/api/llm/clients/mistral/utils/conversation_to_mistral";
import {
  conversationMessages,
  inputMessages,
} from "@app/lib/api/llm/clients/mistral/utils/test/fixtures.test";

describe("toMessage", () => {
  describe("user messages", () => {
    it("should convert user message with text and function calls.", () => {
      const messages = conversationMessages.map((message) =>
        toMessage(message)
      );

      expect(messages).toEqual(inputMessages);
    });
  });
});
