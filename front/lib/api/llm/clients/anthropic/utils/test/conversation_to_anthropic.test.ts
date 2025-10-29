import { describe, expect, it } from "vitest";

import { toMessage } from "@app/lib/api/llm/clients/anthropic/utils/conversation_to_anthropic";
import { conversationMessages } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/conversation_messages";
import { reasoningConversationMessages } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/conversation_messages/reasoning";
import { inputMessages } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/model_input";
import { reasoningInputMessages } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/model_input/reasoning";

describe("toMessage", () => {
  describe("user messages", () => {
    it("should convert user message with text and function calls", () => {
      const messages = conversationMessages.map(toMessage);

      expect(messages).toEqual(inputMessages);
    });

    it("should convert assistant message with reasoning/thinking content", () => {
      const messages = reasoningConversationMessages.map(toMessage);

      expect(messages).toEqual(reasoningInputMessages);
    });
  });
});
