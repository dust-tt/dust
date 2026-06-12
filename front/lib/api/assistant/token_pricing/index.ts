import { EU_MODEL_PRICING } from "@app/lib/api/assistant/token_pricing/eu";
import type { PricingEntry } from "@app/lib/api/assistant/token_pricing/global";
import { MODEL_PRICING } from "@app/lib/api/assistant/token_pricing/global";
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
  isBatch = false,
  inferenceRegion = "global",
}: {
  modelId: ModelIdType | ImageModelIdType;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number | null;
  cacheCreationTokens?: number | null;
  isBatch?: boolean;
  inferenceRegion?: InferenceRegionType;
}): number {
  const regionalPricing =
    inferenceRegion !== "global"
      ? REGIONAL_MODEL_PRICING[inferenceRegion][modelId]
      : undefined;
  const pricing = regionalPricing ?? MODEL_PRICING[modelId] ?? DEFAULT_PRICING;

  const cachedReadTokens = cachedTokens ?? 0;
  const cacheWriteTokens = cacheCreationTokens ?? 0;

  const cachedReadRate = pricing.cache_read_input_tokens ?? pricing.input;
  const cacheWriteRate = pricing.cache_creation_input_tokens ?? pricing.input;

  const basePromptCostMicroUsd = promptTokens * pricing.input;
  const cachedReadDeltaMicroUsd =
    cachedReadTokens * (cachedReadRate - pricing.input);
  const cacheWriteDeltaMicroUsd =
    cacheWriteTokens * (cacheWriteRate - pricing.input);
  const outputCostMicroUsd = completionTokens * pricing.output;

  const costMicroUsd =
    basePromptCostMicroUsd +
    cachedReadDeltaMicroUsd +
    cacheWriteDeltaMicroUsd +
    outputCostMicroUsd;

  return isBatch
    ? Math.round(costMicroUsd * BATCH_DISCOUNT_FACTOR)
    : costMicroUsd;
}
