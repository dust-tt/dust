import assert from "node:assert";

import type { TokenUsageContent } from "@/types/events";
import type { TokenPricing } from "@/types/pricing";

/**
 * Computes the total cost of a request given token usage and tiered pricing.
 *
 * Some providers use tiered pricing where the per-token rate changes after a threshold.
 * For example, Gemini 2.5 Pro charges $1.25/M input tokens for the first 200k tokens,
 * then $2.50/M after that. The `tokenPricing` array encodes these tiers as ordered
 * brackets (e.g. [{ upTo: 200_000, pricing: ... }, { upTo: null, pricing: ... }]).
 *
 * For each tier, this function computes how many tokens of each category (cache created,
 * cache hit, standard input, output + reasoning) fall within that bracket, and accumulates
 * the cost accordingly.
 */
export function computeUsageCost(
  usage: TokenUsageContent,
  tokenPricing: TokenPricing
): number {
  let cacheCreatedCost = 0;
  let cacheHitCost = 0;
  let standardInputCost = 0;
  let outputCost = 0;
  let lastUpTo = 0;

  for (const { upTo, pricing } of tokenPricing) {
    const additionalCacheCreated = Math.max(
      Math.min(upTo ?? Number.POSITIVE_INFINITY, usage.cacheCreated) - lastUpTo,
      0
    );
    assert(
      additionalCacheCreated === 0 || pricing.cacheCreated !== undefined,
      "cacheCreated cost is missing in pricing"
    );
    cacheCreatedCost +=
      Math.max(
        Math.min(upTo ?? Number.POSITIVE_INFINITY, usage.cacheCreated) -
          lastUpTo,
        0
      ) * (pricing.cacheCreated ?? 0);

    const additionalCacheHit = Math.max(
      Math.min(upTo ?? Number.POSITIVE_INFINITY, usage.cacheHit) - lastUpTo,
      0
    );
    assert(
      additionalCacheHit === 0 || pricing.cacheHit !== undefined,
      "cacheHit cost is missing in pricing"
    );
    cacheHitCost +=
      Math.max(
        Math.min(upTo ?? Number.POSITIVE_INFINITY, usage.cacheHit) - lastUpTo,
        0
      ) * (pricing.cacheHit ?? 0);
    standardInputCost +=
      Math.max(
        Math.min(upTo ?? Number.POSITIVE_INFINITY, usage.standardInput) -
          lastUpTo,
        0
      ) * pricing.standardInput;
    outputCost +=
      Math.max(
        Math.min(
          upTo ?? Number.POSITIVE_INFINITY,
          usage.standardOutput + usage.reasoning
        ) - lastUpTo,
        0
      ) * pricing.standardOutput;
    lastUpTo = upTo ?? Number.POSITIVE_INFINITY;
  }

  return cacheCreatedCost + cacheHitCost + standardInputCost + outputCost;
}
