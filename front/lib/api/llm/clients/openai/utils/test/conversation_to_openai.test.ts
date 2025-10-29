import { describe, expect, it, vi } from "vitest";

import { toInput } from "@app/lib/api/llm/clients/openai/utils/conversation_to_openai";
import { conversationMessages } from "@app/lib/api/llm/clients/openai/utils/test/fixtures/conversation_messages";
import { inputMessages } from "@app/lib/api/llm/clients/openai/utils/test/fixtures/model_input";

// Mock the generateFunctionCallId function
vi.mock("@app/lib/api/llm/clients/openai/utils/function_tool_call_id", () => ({
  generateFunctionCallId: vi.fn(() => "fc_DdHr7L197"),
}));

describe("toInput", () => {
  describe("user messages", () => {
    it("should convert user message with text and function calls.", () => {
      const prompt = "You are a helpful assistant.";
      const messages = toInput(prompt, { messages: conversationMessages });

      expect(messages).toEqual(inputMessages);
    });
  });
});
