// @vitest-environment node

import { FireworksLLM } from "@app/lib/api/llm/clients/fireworks";
import { createMockAuthenticator } from "@app/lib/api/llm/tests/conversations";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import { FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID } from "@app/types/assistant/models/fireworks";
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";
import { describe, expect, it } from "vitest";

class TestFireworksLLM extends FireworksLLM {
  public buildPayload(
    streamParameters: LLMStreamParameters
  ): ChatCompletionCreateParamsStreaming {
    return this.buildStreamRequestPayload(streamParameters);
  }
}

describe("FireworksLLM", () => {
  it("sends native low reasoning for Kimi K2 Instruct light effort", () => {
    const llm = new TestFireworksLLM(createMockAuthenticator(), {
      credentials: { FIREWORKS_API_KEY: "test-fireworks-key" },
      modelId: FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID,
      reasoningEffort: "light",
    });

    const payload = llm.buildPayload({
      conversation: { messages: [] },
      prompt: "You are a helpful assistant.",
      specifications: [],
    });

    expect(payload.reasoning_effort).toBe("low");
  });
});
