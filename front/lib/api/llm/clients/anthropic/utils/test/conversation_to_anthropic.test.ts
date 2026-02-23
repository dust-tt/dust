import { toMessage } from "@app/lib/api/llm/clients/anthropic/utils/conversation_to_anthropic";
import { conversationMessages } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/conversation_messages";
import { reasoningConversationMessages } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/conversation_messages/reasoning";
import { inputMessages } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/model_input";
import { reasoningInputMessages } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/model_input/reasoning";
import { describe, expect, it } from "vitest";

describe("toMessage", () => {
  describe("user messages", () => {
    it("should convert user message with text and function calls", () => {
      const messages = conversationMessages.map((msg) => toMessage(msg));

      expect(messages).toEqual(inputMessages);
    });

    it("should convert assistant message with reasoning/thinking content", () => {
      const messages = reasoningConversationMessages.map((msg) =>
        toMessage(msg)
      );

      expect(messages).toEqual(reasoningInputMessages);
    });
  });

  describe("cache_control", () => {
    it("should not add cache_control when isLast is false", () => {
      const userMessage = conversationMessages.find(
        (msg) => msg.role === "user"
      );
      if (!userMessage) {
        throw new Error("No user message found in test fixtures");
      }

      const result = toMessage(userMessage, { isLast: false });

      // Verify no cache_control is present
      if (Array.isArray(result.content)) {
        result.content.forEach((block) => {
          expect(block).not.toHaveProperty("cache_control");
        });
      }
    });

    it("should add cache_control to last content block when isLast is true", () => {
      const userMessage = conversationMessages.find(
        (msg) => msg.role === "user"
      );
      if (!userMessage) {
        throw new Error("No user message found in test fixtures");
      }

      const result = toMessage(userMessage, { isLast: true });

      // Verify cache_control is added to the last content block
      if (Array.isArray(result.content) && result.content.length > 0) {
        const lastBlock = result.content[result.content.length - 1];
        expect(lastBlock).toHaveProperty("cache_control");
        expect(lastBlock).toHaveProperty("cache_control.type", "ephemeral");
      } else {
        throw new Error("Expected content array with at least one element");
      }
    });

    it("should not add cache_control to non-user messages", () => {
      const assistantMessage = conversationMessages.find(
        (msg) => msg.role === "assistant"
      );
      if (!assistantMessage) {
        throw new Error("No assistant message found in test fixtures");
      }

      const result = toMessage(assistantMessage, { isLast: true });

      // Assistant messages should not have cache_control even if isLast is true
      if (Array.isArray(result.content)) {
        result.content.forEach((block) => {
          expect(block).not.toHaveProperty("cache_control");
        });
      }
    });
  });
});
