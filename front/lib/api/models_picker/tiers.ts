import type { PricingEntry } from "@app/lib/api/assistant/token_pricing";
import { MODEL_PRICING } from "@app/lib/api/assistant/token_pricing";
import {
  STATIC_MODEL_IDS,
  type StaticModelIdType,
} from "@app/types/assistant/models/models";
import { NOOP_MODEL_ID } from "@app/types/assistant/models/noop";

export const MODEL_TIERS = [
  "fast",
  "balanced",
  "powerful",
  "frontier",
] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

/**
 * Blended cost thresholds in USD per million tokens (average of input + output).
 * Derived from the pricing initiative model picker spec:
 * Fast < $0.5, Balanced < $3, Powerful < $15, Frontier >= $15.
 */
export const MODEL_TIER_BLENDED_COST_THRESHOLDS_USD = {
  balanced: 0.5,
  powerful: 3,
  frontier: 15,
} as const;

const MODEL_TIER_RANK: Record<ModelTier, number> = {
  fast: 0,
  balanced: 1,
  powerful: 2,
  frontier: 3,
};

export const MODEL_PICKER_STATIC_MODEL_IDS = STATIC_MODEL_IDS.filter(
  (modelId) => modelId !== NOOP_MODEL_ID
);

export function getBlendedModelCostUsdPerMillionTokens(
  pricing: PricingEntry
): number {
  return (pricing.input + pricing.output) / 2;
}

export function getModelTierForBlendedCost(
  blendedCostUsdPerMillionTokens: number
): ModelTier {
  if (
    blendedCostUsdPerMillionTokens <
    MODEL_TIER_BLENDED_COST_THRESHOLDS_USD.balanced
  ) {
    return "fast";
  }
  if (
    blendedCostUsdPerMillionTokens <
    MODEL_TIER_BLENDED_COST_THRESHOLDS_USD.powerful
  ) {
    return "balanced";
  }
  if (
    blendedCostUsdPerMillionTokens <
    MODEL_TIER_BLENDED_COST_THRESHOLDS_USD.frontier
  ) {
    return "powerful";
  }
  return "frontier";
}

export function getModelTier(modelId: StaticModelIdType): ModelTier {
  const pricing = MODEL_PRICING[modelId];
  if (!pricing) {
    throw new Error(`Missing pricing for model ${modelId}`);
  }

  return getModelTierForBlendedCost(
    getBlendedModelCostUsdPerMillionTokens(pricing)
  );
}

export function groupModelsByTier(
  modelIds: StaticModelIdType[] = MODEL_PICKER_STATIC_MODEL_IDS
): Record<ModelTier, StaticModelIdType[]> {
  const grouped: Record<ModelTier, StaticModelIdType[]> = {
    fast: [],
    balanced: [],
    powerful: [],
    frontier: [],
  };

  for (const modelId of modelIds) {
    grouped[getModelTier(modelId)].push(modelId);
  }

  return grouped;
}

export function getModelsAllowedForTier(
  maxTier: ModelTier,
  modelIds: StaticModelIdType[] = MODEL_PICKER_STATIC_MODEL_IDS
): StaticModelIdType[] {
  const maxRank = MODEL_TIER_RANK[maxTier];

  return modelIds.filter(
    (modelId) => MODEL_TIER_RANK[getModelTier(modelId)] <= maxRank
  );
}
