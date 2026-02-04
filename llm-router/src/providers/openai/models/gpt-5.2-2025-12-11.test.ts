import { describe, it, expect } from "vitest";
import { GPT_5_2_2025_12_11_MODEL_ID } from "@/providers/openai/models/gpt-5.2-2025-12-11.js";
import { ClientRouter } from "@/index";
import { getCases } from "@/test/index.js";
import { OPENAI_PROVIDER_ID } from "@/providers/openai/provider";

describe("OpenAI GPT-5.2 Stream", () => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY environment variable is not set. Create a .env file with your API key."
    );
  }

  const client = ClientRouter.get("openai", { apiKey });

  const cases = getCases();

  it.each(cases)(
    "should stream responses from OpenAI GPT-5.2 - case %#",
    async (input, expectedFinishEvent) => {
      const { payload, config } = input;

      const stream = await client.stream(
        "openai",
        GPT_5_2_2025_12_11_MODEL_ID,
        payload,
        config
      );

      let foundCompletionOrError = false;

      for await (const event of stream) {
        if (event.type !== "completion" && event.type !== "error") {
          continue;
        }
        expect(event).not.toBeNull();
        expect(event).toEqual({
          ...expectedFinishEvent,
          metadata: {
            modelId: GPT_5_2_2025_12_11_MODEL_ID,
            providerId: OPENAI_PROVIDER_ID,
          },
        });

        foundCompletionOrError = true;
      }

      expect(foundCompletionOrError).toBe(true);
    },
    30000
  );
});
