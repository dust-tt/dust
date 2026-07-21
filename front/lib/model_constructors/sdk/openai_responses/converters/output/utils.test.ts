import { usageToTokenUsageEvent } from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import type { ResponseUsage } from "openai/resources/responses/responses";
import { describe, expect, it } from "vitest";

const metadata = {
  lab: "openai",
  host: "openai-responses",
  model: "gpt-5.4",
  region: "global",
} as const;

describe("usageToTokenUsageEvent", () => {
  it("splits standard input, cache reads, and cache writes", () => {
    const usage: ResponseUsage = {
      input_tokens: 2006,
      input_tokens_details: {
        cached_tokens: 1200,
        cache_write_tokens: 720,
      },
      output_tokens: 300,
      output_tokens_details: { reasoning_tokens: 50 },
      total_tokens: 2306,
    };

    expect(usageToTokenUsageEvent(metadata, usage)).toEqual({
      type: "token_usage",
      content: {
        cacheCreated: 720,
        longCacheCreated: 0,
        shortCacheCreated: 0,
        cacheHit: 1200,
        standardInput: 86,
        standardOutput: 250,
        reasoning: 50,
      },
      metadata,
    });
  });
});
