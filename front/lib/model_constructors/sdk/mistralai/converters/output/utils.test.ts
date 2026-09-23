import { usageToTokenUsageEvent } from "@app/lib/model_constructors/sdk/mistralai/converters/output/utils";
import type { UsageInfo } from "@mistralai/mistralai/models/components";
import { describe, expect, it } from "vitest";

const metadata = {
  lab: "mistral",
  host: "mistral",
  model: "mistral-medium-3-5",
  region: "eu",
} as const;

function usage(extra: Record<string, unknown>): UsageInfo {
  return { promptTokens: 7020, completionTokens: 8, ...extra };
}

describe("usageToTokenUsageEvent", () => {
  it("credits cached reads reported under the raw wire name", () => {
    const event = usageToTokenUsageEvent(
      metadata,
      usage({ prompt_tokens_details: { cached_tokens: 6912 } })
    );

    expect(event.content.cacheHit).toBe(6912);
    expect(event.content.standardInput).toBe(108);
  });

  it("credits cached reads if a later SDK declares the field camelCased", () => {
    const event = usageToTokenUsageEvent(
      metadata,
      usage({ promptTokensDetails: { cachedTokens: 6912 } })
    );

    expect(event.content.cacheHit).toBe(6912);
    expect(event.content.standardInput).toBe(108);
  });

  it("bills every prompt token as standard input on a cache miss", () => {
    const event = usageToTokenUsageEvent(
      metadata,
      usage({ prompt_tokens_details: { cached_tokens: 0 } })
    );

    expect(event.content.cacheHit).toBe(0);
    expect(event.content.standardInput).toBe(7020);
  });

  it("bills every prompt token as standard input when no breakdown is sent", () => {
    const event = usageToTokenUsageEvent(metadata, usage({}));

    expect(event.content.cacheHit).toBe(0);
    expect(event.content.standardInput).toBe(7020);
  });

  it("never reports cache writes, which Mistral does not bill separately", () => {
    const event = usageToTokenUsageEvent(
      metadata,
      usage({ prompt_tokens_details: { cached_tokens: 6912 } })
    );

    expect(event.content.cacheCreated).toBe(0);
    expect(event.content.shortCacheCreated).toBe(0);
    expect(event.content.longCacheCreated).toBe(0);
  });
});
