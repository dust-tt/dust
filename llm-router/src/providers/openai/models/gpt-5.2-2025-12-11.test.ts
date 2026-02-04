import { describe, it, expect } from "vitest";
import { GPT_5_2_2025_12_11_MODEL_ID } from "@/providers/openai/models/gpt-5.2-2025-12-11.js";
import { ClientRouter } from "@/index";
import { OPENAI_PROVIDER_ID } from "@/providers/openai/provider";
import { Payload } from "@/types/history";
import { InputConfig } from "@/types/config";
import { FinishEvent } from "@/types/output";
// import {
//   getInputvalidationCases,
//   TOP_LOGPROBS,
//   TOP_PROBABILITIES,
// } from "@/test";

describe("OpenAI GPT-5.2 Stream", () => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY environment variable is not set. Create a .env file with your API key."
    );
  }

  const client = ClientRouter.get("openai", { apiKey });

  // Run this test along printing to discover default values
  it.skip("should stream with all undefined config values", async () => {
    const stream = await client.stream(
      "openai",
      GPT_5_2_2025_12_11_MODEL_ID,
      {
        conversation: {
          messages: [
            {
              role: "system",
              content: { value: "Assistant" },
            },
          ],
        },
        prompt: {
          value: "Hi",
        },
      },
      {
        temperature: undefined,
        reasoningEffort: undefined,
        reasoningDetailsLevel: undefined,
        maxOutputTokens: undefined,
      }
    );

    let foundCompletionOrError = false;

    for await (const event of stream) {
      if (event.type !== "completion" && event.type !== "error") {
        continue;
      }
      expect(event).not.toBeNull();
      expect(event).toEqual({
        type: "completion",
        content: {
          value: expect.arrayContaining([
            expect.objectContaining({ type: "text_generated" }),
          ]),
        },
        metadata: {
          modelId: GPT_5_2_2025_12_11_MODEL_ID,
          providerId: OPENAI_PROVIDER_ID,
          completedAt: expect.any(Number),
          createdAt: expect.any(Number),
          responseId: expect.any(String),
        },
      });

      foundCompletionOrError = true;
    }

    expect(foundCompletionOrError).toBe(true);
  }, 30000);

  const cases: [{ payload: Payload; config: InputConfig }, FinishEvent][] = [
    // ...getInputvalidationCases({
    //   temperatures: [0, 0.5, 1],
    //   reasoningEfforts: ["none"],
    //   reasoningDetailsLevels: ["low"],
    // }),
    // ...getInputvalidationCases({
    //   temperatures: [undefined],
    //   reasoningEfforts: ["low", "medium", "high", "very_high"],
    //   reasoningDetailsLevels: ["low"],
    // }),
    // ...getInputvalidationCases({
    //   temperatures: [undefined],
    //   reasoningEfforts: ["very_high"],
    //   reasoningDetailsLevels: ["low", "high"],
    // }),
    // ...getInputvalidationCases({
    //   topLogprobs: TOP_LOGPROBS,
    //   topProbability: TOP_PROBABILITIES,
    // }),
  ];

  // Run this test to try input combinations
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
            completedAt: expect.any(Number),
            createdAt: expect.any(Number),
            responseId: expect.any(String),
          },
        });

        foundCompletionOrError = true;
      }

      expect(foundCompletionOrError).toBe(true);
    },
    30000
  );
});
