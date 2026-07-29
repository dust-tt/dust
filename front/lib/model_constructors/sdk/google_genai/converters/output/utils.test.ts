import { usageToTokenUsageEvent } from "@app/lib/model_constructors/sdk/google_genai/converters/output/utils";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type { GenerateContentResponseUsageMetadata } from "@google/genai";
import { describe, expect, it } from "vitest";

const metadata: EndpointMetadata = {
  lab: "google",
  host: "google-ai-studio",
  model: "gemini-3.5-flash",
  region: "global",
};

describe("usageToTokenUsageEvent", () => {
  it("normalizes separately reported thought tokens into inclusive output", () => {
    const usage: GenerateContentResponseUsageMetadata = {
      promptTokenCount: 25,
      candidatesTokenCount: 36,
      thoughtsTokenCount: 312,
      totalTokenCount: 373,
    };

    expect(usageToTokenUsageEvent(metadata, usage)).toEqual({
      type: "token_usage",
      content: {
        cacheCreated: 0,
        longCacheCreated: 0,
        shortCacheCreated: 0,
        cacheHit: 0,
        standardInput: 25,
        totalOutput: 348,
        reasoning: 312,
      },
      metadata,
    });
  });
});
