import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  getInputvalidationCases,
  TEMPERATURES,
  TOP_PROBABILITIES,
} from "@/_test_";
import { Client } from "@/client";
import {
  CLAUDE_SONNET_4_5_20250929_MODEL_ID,
  type ClaudeSonnet4_5V20250929,
} from "@/providers/anthropic/models/claude-sonnet-4-5-20250929";
import { ANTHROPIC_PROVIDER_ID } from "@/providers/anthropic/types";
import { REASONING_DETAILS_LEVELS, REASONING_EFFORTS } from "@/types/config";
import type { Payload } from "@/types/history";
import type { FinishEvent } from "@/types/output";

describe("Anthropic Claude Sonnet 4.5 Stream", () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is not set. Create a .env file with your API key."
    );
  }

  const client = new Client({ providerId: "anthropic", config: { apiKey } });

  // Run this test along printing to discover default values
  it.skip("should stream with all undefined config values", async () => {
    const stream = await client.stream(
      CLAUDE_SONNET_4_5_20250929_MODEL_ID,
      {
        conversation: {
          messages: [
            {
              role: "user",
              type: "text",
              content: { value: "Hi" },
            },
          ],
        },
        systemPrompt: {
          value: "You are an assistant.",
        },
      },
      {
        temperature: undefined,
        reasoningEffort: undefined,
        reasoningDetailsLevel: undefined,
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
          modelId: CLAUDE_SONNET_4_5_20250929_MODEL_ID,
          providerId: ANTHROPIC_PROVIDER_ID,
        },
      });

      foundCompletionOrError = true;
    }

    expect(foundCompletionOrError).toBe(true);
  }, 30000);

  const cases: [
    {
      payload: Payload;
      config: z.input<typeof ClaudeSonnet4_5V20250929.configSchema>;
    },
    FinishEvent,
  ][] = [
    ...getInputvalidationCases<
      z.input<typeof ClaudeSonnet4_5V20250929.configSchema>
    >({
      temperatures: TEMPERATURES,
      reasoningEfforts: [...REASONING_EFFORTS],
      reasoningDetailsLevels: [...REASONING_DETAILS_LEVELS],
      topProbability: [...TOP_PROBABILITIES],
    }),
  ] as const;

  // Run this test to try input combinations
  it.each(cases)(
    "should stream responses from Anthropic Claude Sonnet 4.5 - case %#",
    async (input, expectedFinishEvent) => {
      const { payload, config } = input;

      const stream = await client.stream(
        CLAUDE_SONNET_4_5_20250929_MODEL_ID,
        payload,
        { ...config, maxOutputTokens: 1000 }
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
            modelId: CLAUDE_SONNET_4_5_20250929_MODEL_ID,
            providerId: ANTHROPIC_PROVIDER_ID,
          },
        });

        foundCompletionOrError = true;
      }

      expect(foundCompletionOrError).toBe(true);
    },
    30000
  );
});
