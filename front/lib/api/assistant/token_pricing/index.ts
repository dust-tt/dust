import { EU_MODEL_PRICING } from "@app/lib/api/assistant/token_pricing/eu";
import type { PricingEntry } from "@app/lib/api/assistant/token_pricing/global";
import { MODEL_PRICING } from "@app/lib/api/assistant/token_pricing/global";
import type { ServiceTier } from "@app/lib/model_constructors/types/input/configuration";
import type {
  ImageModelIdType,
  StaticModelIdType,
} from "@app/types/assistant/models/models";
import type { ModelIdType } from "@app/types/assistant/models/types";

export type { PricingEntry } from "@app/lib/api/assistant/token_pricing/global";
export { MODEL_PRICING } from "@app/lib/api/assistant/token_pricing/global";

export type InferenceRegionType = "global" | "eu";

// Pricing overrides keyed by region. Only non-global regions need entries here.
const REGIONAL_MODEL_PRICING: Record<
  Exclude<InferenceRegionType, "global">,
  Partial<Record<string, PricingEntry>>
> = {
  eu: EU_MODEL_PRICING,
};

export const DUST_MARKUP_PERCENT = 30;

// Maximum discount percent that can be applied to credit purchases.
// A discount above this threshold would result in selling below cost.
// Formula: (1 - 1 / (1 + MARKUP/100)) * 100
// With 30% markup: (1 - 1/1.30) * 100 ≈ 23.08%
export const MAX_DISCOUNT_PERCENT = Math.ceil(
  (1 - 1 / (1 + DUST_MARKUP_PERCENT / 100)) * 100
);

// If model is not found in MODEL_PRICING, use the default pricing.
const DEFAULT_PRICING_MODEL_ID: StaticModelIdType = "gpt-5.5";
const DEFAULT_PRICING = MODEL_PRICING[DEFAULT_PRICING_MODEL_ID];

// This discount factor applies to OpenAi, Anthropic, Google and Mistral
const BATCH_DISCOUNT_FACTOR = 0.5;

// OpenAI bills flex processing at Batch-API token prices, on both the short- and
// long-context rates of every model that publishes a flex tier.
// Verified 2026-08-21: https://developers.openai.com/api/docs/pricing
export const FLEX_DISCOUNT_FACTOR = BATCH_DISCOUNT_FACTOR;

/**
 * Calculate the cost in micro USD for token usage.
 * Note: promptTokens currently includes cached read and cache write tokens for some providers.
 * To avoid double counting, price all promptTokens at base input rate, then adjust with deltas.
 */
export function computeTokensCostForUsageInMicroUsd({
  modelId,
  promptTokens,
  completionTokens,
  cachedTokens,
  cacheCreationTokens,
  longCacheCreationTokens,
  isBatch = false,
  serviceTier,
  inferenceRegion = "global",
}: {
  modelId: ModelIdType | ImageModelIdType;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number | null;
  cacheCreationTokens?: number | null;
  // Portion of cacheCreationTokens written to a long-lived cache, for providers that bill those at
  // a premium. The remainder is billed at the standard cache-write rate.
  longCacheCreationTokens?: number | null;
  isBatch?: boolean;
  serviceTier?: ServiceTier;
  inferenceRegion?: InferenceRegionType;
}): number {
  const regionalPricing =
    inferenceRegion !== "global"
      ? REGIONAL_MODEL_PRICING[inferenceRegion][modelId]
      : undefined;
  const basePricing =
    regionalPricing ?? MODEL_PRICING[modelId] ?? DEFAULT_PRICING;
  const pricing =
    basePricing.long_context &&
    promptTokens >= basePricing.long_context.prompt_token_threshold
      ? basePricing.long_context
      : basePricing;

  const cachedReadTokens = cachedTokens ?? 0;
  const longCacheWriteTokens = longCacheCreationTokens ?? 0;
  const shortCacheWriteTokens =
    (cacheCreationTokens ?? 0) - longCacheWriteTokens;

  const cachedReadRate = pricing.cache_read_input_tokens ?? pricing.input;
  const shortCacheWriteRate =
    pricing.cache_creation_input_tokens ?? pricing.input;
  const longCacheWriteRate =
    pricing.long_cache_creation_input_tokens ?? shortCacheWriteRate;

  const basePromptCostMicroUsd = promptTokens * pricing.input;
  const cachedReadDeltaMicroUsd =
    cachedReadTokens * (cachedReadRate - pricing.input);
  const cacheWriteDeltaMicroUsd =
    shortCacheWriteTokens * (shortCacheWriteRate - pricing.input) +
    longCacheWriteTokens * (longCacheWriteRate - pricing.input);
  const outputCostMicroUsd = completionTokens * pricing.output;

  const costMicroUsd =
    basePromptCostMicroUsd +
    cachedReadDeltaMicroUsd +
    cacheWriteDeltaMicroUsd +
    outputCostMicroUsd;

  if (isBatch) {
    return Math.round(costMicroUsd * BATCH_DISCOUNT_FACTOR);
  }
  if (serviceTier === "flex") {
    return Math.round(costMicroUsd * FLEX_DISCOUNT_FACTOR);
  }

  return costMicroUsd;
}
