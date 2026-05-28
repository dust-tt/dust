import { computeTokensCostForUsageInMicroUsd } from "@app/lib/api/assistant/token_pricing";
import { describe, expect, it } from "vitest";

describe("computeTokensCostForUsageInMicroUsd - long context tiering", () => {
  it("prices gpt-5.5 at short-context rates just below the threshold", () => {
    const cost = computeTokensCostForUsageInMicroUsd({
      modelId: "gpt-5.5",
      promptTokens: 271_999,
      completionTokens: 1_000,
      cachedTokens: 0,
    });

    expect(cost).toBe(271_999 * 5 + 1_000 * 30);
  });

  it("switches gpt-5.5 to long-context rates at exactly the threshold", () => {
    const cost = computeTokensCostForUsageInMicroUsd({
      modelId: "gpt-5.5",
      promptTokens: 272_000,
      completionTokens: 1_000,
      cachedTokens: 0,
    });

    // 272_000 * 10 + 1_000 * 45
    expect(cost).toBe(272_000 * 10 + 1_000 * 45);
  });

  it("applies long-context cached-read rate above the threshold", () => {
    const promptTokens = 300_000;
    const cachedTokens = 100_000;
    const completionTokens = 2_000;

    const cost = computeTokensCostForUsageInMicroUsd({
      modelId: "gpt-5.5",
      promptTokens,
      completionTokens,
      cachedTokens,
    });

    // Base prompt at long input (10) + cached-read delta (1 - 10) + output (45).
    const expected =
      promptTokens * 10 + cachedTokens * (1 - 10) + completionTokens * 45;
    expect(cost).toBe(expected);
  });

  it("prices gpt-5.4 using the correct tier on each side of the threshold", () => {
    const below = computeTokensCostForUsageInMicroUsd({
      modelId: "gpt-5.4",
      promptTokens: 100_000,
      completionTokens: 1_000,
      cachedTokens: 0,
    });
    const above = computeTokensCostForUsageInMicroUsd({
      modelId: "gpt-5.4",
      promptTokens: 500_000,
      completionTokens: 1_000,
      cachedTokens: 0,
    });

    expect(below).toBe(100_000 * 2.5 + 1_000 * 15);
    expect(above).toBe(500_000 * 5 + 1_000 * 22.5);
  });

  it("leaves models without long-context pricing unaffected at large prompt sizes", () => {
    const cost = computeTokensCostForUsageInMicroUsd({
      modelId: "gpt-4o",
      promptTokens: 1_000_000,
      completionTokens: 1_000,
      cachedTokens: 0,
    });

    // gpt-4o has flat pricing: 2.5 / 10.
    expect(cost).toBe(1_000_000 * 2.5 + 1_000 * 10);
  });
});
