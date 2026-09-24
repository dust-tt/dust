import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import {
  getModelsTierDisplayName,
  MODELS_TIER_NAMES,
} from "@app/types/assistant/models/model_tiers";

export const DEFAULT_MAX_MODEL_TIER: ModelsTierName = "ultra";

export function getTierIndex(tierName: ModelsTierName): number {
  return MODELS_TIER_NAMES.indexOf(tierName);
}

export function expandTiersUpTo(maxTierName: ModelsTierName): ModelsTierName[] {
  const maxIndex = getTierIndex(maxTierName);
  if (maxIndex < 0) {
    return [];
  }

  return [...MODELS_TIER_NAMES.slice(0, maxIndex + 1)];
}

export function getMaxTierName(
  tierNames: readonly ModelsTierName[]
): ModelsTierName | null {
  if (tierNames.length === 0) {
    return null;
  }

  let maxTierName: ModelsTierName = tierNames[0];
  for (const tierName of tierNames) {
    if (getTierIndex(tierName) > getTierIndex(maxTierName)) {
      maxTierName = tierName;
    }
  }

  return maxTierName;
}

export function isTierWithinMax(
  tierName: ModelsTierName,
  maxTierName: ModelsTierName
): boolean {
  return getTierIndex(tierName) <= getTierIndex(maxTierName);
}

export function isTierAtLeast(
  tierName: ModelsTierName,
  minTierName: ModelsTierName
): boolean {
  return getTierIndex(tierName) >= getTierIndex(minTierName);
}

// The floor of the legacy-plan lock and of the weekly premium allowance. A null
// tier (an effort the model does not support) is below it.
export function isPremiumOrAboveTier(tierName: ModelsTierName | null): boolean {
  return tierName !== null && isTierAtLeast(tierName, "premium");
}

export function formatMaxTierDescription(
  maxTierName: ModelsTierName
): string | undefined {
  const lowerTiers = expandTiersUpTo(maxTierName).slice(0, -1);
  if (lowerTiers.length === 0) {
    return undefined;
  }

  return `Includes ${lowerTiers.map(getModelsTierDisplayName).join(", ")}`;
}
