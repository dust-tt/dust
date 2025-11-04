/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from "vitest";

import { OpenAIResponsesLLM } from "@app/lib/api/llm/clients/openai";
import type { OpenAIWhitelistedModelId } from "@app/lib/api/llm/clients/openai/types";
import { Authenticator } from "@app/lib/auth";
import { GPT_5_MINI_MODEL_ID } from "@app/types";

// Mock the dustManagedCredentials function BEFORE importing anything else
vi.mock("@app/types", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    // @ts-expect-error actual is unknown
    ...actual,
    dustManagedCredentials: vi.fn(() => ({
      OPENAI_API_KEY: process.env.VITE_DUST_MANAGED_OPENAI_API_KEY ?? "",
      OPENAI_BASE_URL: "https://api.openai.com/v1",
    })),
  };
});

function createMockAuthenticator(): Authenticator {
  return new Authenticator({
    workspace: null,
    user: null,
    role: "none",
    groups: [],
    subscription: null,
  });
}

describe("OpenAI client", () => {
  it("should handle simple math conversation", async () => {
    const llm = new OpenAIResponsesLLM(createMockAuthenticator(), {
      modelId: GPT_5_MINI_MODEL_ID as OpenAIWhitelistedModelId,
      temperature: 0.5,
      reasoningEffort: "none",
    });

    const conversation = {
      messages: [
        {
          role: "user" as const,
          name: "User",
          content: [
            {
              type: "text" as const,
              text: "Be concise. What is 2+2? Just give the number.",
            },
          ],
        },
      ],
    };

    const systemPrompt = "You are a helpful assistant.";

    // Actually call the stream method and verify the result
    const result = llm.stream({
      conversation,
      prompt: systemPrompt,
      specifications: [],
    });

    expect(result.isErr()).toBe(false);

    if (!result.isErr()) {
      let responseFromDeltas = "";
      let fullResponse = "";
      let outputTokens: number | null = null;
      const events = [];

      // Collect all events from the stream
      for await (const event of result.value) {
        events.push(event);

        switch (event.type) {
          case "text_delta":
            responseFromDeltas += event.content.delta;
            break;
          case "text_generated":
            fullResponse = event.content.text;
            break;
          case "token_usage":
            outputTokens = event.content.outputTokens;
            break;
        }
      }

      // Verify we got events
      expect(events.length).toBeGreaterThan(0);

      // Verify we got a response containing "4"
      expect(responseFromDeltas.toLowerCase()).toContain("4");

      // Verify consistency between deltas and full response
      expect(fullResponse).toBe(responseFromDeltas);

      // Verify we got token usage information
      expect(outputTokens).toBeGreaterThan(0);
    }
  });
});
