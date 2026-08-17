import type { ModelsTierName } from "@app/lib/api/assistant/token_pricing/tiers";
import {
  getModelsTierDisplayName,
  MODELS_TIER_NAMES,
} from "@app/lib/api/assistant/token_pricing/tiers";

export const DEFAULT_MAX_MODEL_TIER: ModelsTierName = "premium";

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

export function formatMaxTierDescription(
  maxTierName: ModelsTierName
): string | undefined {
  const lowerTiers = expandTiersUpTo(maxTierName).slice(0, -1);
  if (lowerTiers.length === 0) {
    return undefined;
  }

  return `Includes ${lowerTiers.map(getModelsTierDisplayName).join(", ")}`;
}
