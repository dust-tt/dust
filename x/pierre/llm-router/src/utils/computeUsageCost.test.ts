import { describe, expect, it } from "vitest";

import type { TokenPricing } from "@/types/pricing";
import { computeUsageCost } from "@/utils/computeUsageCost";

const ZERO_USAGE = {
  cacheCreated: 0,
  cacheHit: 0,
  standardInput: 0,
  standardOutput: 0,
  reasoning: 0,
};

describe("computeUsageCost", () => {
  it("single-tier pricing", () => {
    const pricing: TokenPricing = [
      {
        upTo: null,
        pricing: {
          cacheCreated: 1,
          cacheHit: 2,
          standardInput: 3,
          standardOutput: 4,
        },
      },
    ];

    expect(computeUsageCost(ZERO_USAGE, pricing)).toBe(0);

    expect(
      computeUsageCost(
        {
          cacheCreated: 10,
          cacheHit: 20,
          standardInput: 30,
          standardOutput: 40,
          reasoning: 50,
        },
        pricing
      )
    ).toBe(10 * 1 + 20 * 2 + 30 * 3 + (40 + 50) * 4); // 10 + 40 + 90 + 360 = 500
  });

  it("two-tier pricing", () => {
    const pricing: TokenPricing = [
      {
        upTo: 100,
        pricing: {
          cacheCreated: 1,
          cacheHit: 2,
          standardInput: 3,
          standardOutput: 4,
        },
      },
      {
        upTo: null,
        pricing: {
          cacheCreated: 10,
          cacheHit: 20,
          standardInput: 30,
          standardOutput: 40,
        },
      },
    ];

    // All below boundary (output = standardOutput + reasoning = 50 + 30 = 80).
    expect(
      computeUsageCost(
        {
          cacheCreated: 50,
          cacheHit: 50,
          standardInput: 50,
          standardOutput: 50,
          reasoning: 30,
        },
        pricing
      )
    ).toBe(50 * 1 + 50 * 2 + 50 * 3 + 80 * 4); // 50 + 100 + 150 + 320 = 620

    // All spanning both tiers (output = standardOutput + reasoning = 101 + 50 = 151).
    expect(
      computeUsageCost(
        {
          cacheCreated: 150,
          cacheHit: 200,
          standardInput: 100,
          standardOutput: 101,
          reasoning: 50,
        },
        pricing
      )
    ).toBe(
      100 * 1 +
        50 * 10 + // cacheCreated: 100 + 500 = 600
        (100 * 2 + 100 * 20) + // cacheHit: 200 + 2000 = 2200
        100 * 3 + // standardInput: exactly at boundary = 300
        (100 * 4 + 51 * 40) // output (151): 100@4 + 51@40 = 400 + 2040 = 2440
    ); // 600 + 2200 + 300 + 2440 = 5540
  });
});
