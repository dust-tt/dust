import { describe, expect, it } from "vitest";

import { basicConfigWithTools } from "@/_test_/fixtures/config";
import { query } from "@/_test_/fixtures/payload";
import { Client } from "@/client";
import type { FinishEvent } from "@/types/output";
import type { ProviderId } from "@/types/provider";

// Map provider IDs to their environment variable names
const providerEnvVars: Record<ProviderId, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

// Default values for the stream-debug skill
// These will be updated by the skill before running
const providerId: ProviderId = "openai";
const modelId = "gpt-5.2-2025-12-11";

/**
 * Generic model stream test used by the stream-debug skill.
 * This test is kept with .skip by default and activated by the skill.
 */
describe.skip(`Stream debug for ${providerId}:${modelId}`, () => {
  it("should complete successfully with basic config and tools", async () => {
    const envVarName = providerEnvVars[providerId];
    if (!envVarName) {
      throw new Error(
        `No environment variable mapping found for provider: ${providerId}`
      );
    }

    const apiKey = process.env[envVarName];
    if (!apiKey) {
      throw new Error(
        `${envVarName} environment variable is not set. Create a .env file with your API key.`
      );
    }

    const client = new Client({
      providerId,
      config: { apiKey },
    });

    const stream = client.stream(modelId, query, basicConfigWithTools);

    let lastEvent: FinishEvent | null = null;

    for await (const event of stream) {
      if (event.type === "completion" || event.type === "error") {
        lastEvent = event;
      }
    }

    expect(lastEvent).not.toBeNull();
    expect(lastEvent?.type).toBe("completion");

    if (lastEvent?.type === "completion") {
      expect(lastEvent.content.value).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "text_generated" }),
        ])
      );
    }
  }, 30000);
});
