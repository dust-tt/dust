import { toMessage } from "@app/lib/api/llm/clients/anthropic/utils/conversation_to_anthropic";
import { conversationMessages } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/conversation_messages";
import { reasoningConversationMessages } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/conversation_messages/reasoning";
import { inputMessages } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/model_input";
import { reasoningInputMessages } from "@app/lib/api/llm/clients/anthropic/utils/test/fixtures/model_input/reasoning";
import { trustedFetchImageBase64 } from "@app/types/shared/utils/image_utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/types/shared/utils/image_utils");

describe("toMessage", () => {
  describe("user messages", () => {
    it("should convert user message with text and function calls", async () => {
      const messages = await Promise.all(
        conversationMessages.map((msg) => toMessage(msg))
      );

      expect(messages).toEqual(inputMessages);
    });

    it("should convert assistant message with reasoning/thinking content", async () => {
      const messages = await Promise.all(
        reasoningConversationMessages.map((msg) => toMessage(msg))
      );

      expect(messages).toEqual(reasoningInputMessages);
    });
  });

  describe("cache_control", () => {
    it("should not add cache_control to a regular user message even when isFirst", async () => {
      const userMessage = conversationMessages.find(
        (msg) => msg.role === "user"
      );
      if (!userMessage) {
        throw new Error("No user message found in test fixtures");
      }

      const result = await toMessage(userMessage, {
        isFirst: true,
        omittedThinking: false,
      });

      // Regular user messages (name !== "system") never get cache_control. Covered by automatic
      // caching.
      if (Array.isArray(result.content)) {
        result.content.forEach((block) => {
          expect(block).not.toHaveProperty("cache_control");
        });
      }
    });

    it("should add cache_control to the equipped skills message when isFirst", async () => {
      const skillsMessage = {
        role: "user" as const,
        name: "system",
        content: [{ type: "text" as const, text: "Available skills: ..." }],
      };

      const result = await toMessage(skillsMessage, {
        isFirst: true,
        omittedThinking: false,
      });

      if (Array.isArray(result.content) && result.content.length > 0) {
        const lastBlock = result.content[result.content.length - 1];
        expect(lastBlock).toHaveProperty("cache_control");
        expect(lastBlock).toHaveProperty("cache_control.type", "ephemeral");
      } else {
        throw new Error("Expected content array with at least one element");
      }
    });

    it("should not add cache_control to the skills message when not isFirst", async () => {
      const skillsMessage = {
        role: "user" as const,
        name: "system",
        content: [{ type: "text" as const, text: "Available skills: ..." }],
      };

      const result = await toMessage(skillsMessage, {
        isFirst: false,
        omittedThinking: false,
      });

      if (Array.isArray(result.content)) {
        result.content.forEach((block) => {
          expect(block).not.toHaveProperty("cache_control");
        });
      }
    });

    it("should add cache_control to last user message when isLast (Vertex path)", async () => {
      const userMessage = conversationMessages.find(
        (msg) => msg.role === "user"
      );
      if (!userMessage) {
        throw new Error("No user message found in test fixtures");
      }

      const result = await toMessage(userMessage, {
        isFirst: false,
        isLast: true,
        omittedThinking: false,
      });

      if (Array.isArray(result.content) && result.content.length > 0) {
        const lastBlock = result.content[result.content.length - 1];
        expect(lastBlock).toHaveProperty("cache_control");
        expect(lastBlock).toHaveProperty("cache_control.type", "ephemeral");
      } else {
        throw new Error("Expected content array with at least one element");
      }
    });

    it("should not add cache_control to non-user messages", async () => {
      const assistantMessage = conversationMessages.find(
        (msg) => msg.role === "assistant"
      );
      if (!assistantMessage) {
        throw new Error("No assistant message found in test fixtures");
      }

      const result = await toMessage(assistantMessage, {
        isFirst: true,
        omittedThinking: false,
      });

      if (Array.isArray(result.content)) {
        result.content.forEach((block) => {
          expect(block).not.toHaveProperty("cache_control");
        });
      }
    });
  });

  describe("image_url in tool results", () => {
    it("should return a text fallback when image fetch fails", async () => {
      vi.mocked(trustedFetchImageBase64).mockRejectedValue(
        new Error("Not Found")
      );

      const result = await toMessage(
        {
          role: "function",
          name: "some_tool",
          function_call_id: "call_1",
          content: [
            {
              type: "image_url",
              image_url: { url: "https://example.com/expired.png" },
            },
          ],
        },
        { isFirst: false, omittedThinking: false, convertToBase64: true }
      );

      expect(result).toEqual({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_1",
            content: [
              { type: "text", text: "Attachment: image could not be loaded." },
            ],
          },
        ],
      });
    });

    it("should embed image as base64 when fetch succeeds", async () => {
      vi.mocked(trustedFetchImageBase64).mockResolvedValue({
        mediaType: "image/jpeg",
        data: "base64data",
      });

      const result = await toMessage(
        {
          role: "function",
          name: "some_tool",
          function_call_id: "call_1",
          content: [
            {
              type: "image_url",
              image_url: { url: "https://example.com/image.jpg" },
            },
          ],
        },
        { isFirst: false, omittedThinking: false, convertToBase64: true }
      );

      expect(result).toEqual({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_1",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: "base64data",
                },
              },
            ],
          },
        ],
      });
    });
  });
});
