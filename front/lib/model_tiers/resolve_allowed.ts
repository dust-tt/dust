import {
  expandTiersUpTo,
  getMaxTierName,
} from "@app/lib/model_tiers/tier_order";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";

export type ModelTierResolutionSource = "workspace" | "groups" | "user";

export type ResolvedAllowedModelTiers = {
  tiers: ModelsTierName[];
  source: ModelTierResolutionSource;
};

export function resolveAllowedModelTiers({
  workspaceAllowedTierNames,
  groupAllowedTierNamesList,
  userAllowedTierNames,
}: {
  workspaceAllowedTierNames: ModelsTierName[];
  groupAllowedTierNamesList: ModelsTierName[][];
  userAllowedTierNames: ModelsTierName[];
}): ResolvedAllowedModelTiers {
  let maxTierName: ModelsTierName | null = null;
  let source: ModelTierResolutionSource;

  if (userAllowedTierNames.length > 0) {
    maxTierName = getMaxTierName(userAllowedTierNames);
    source = "user";
  } else {
    const groupMaxTierNames = groupAllowedTierNamesList.flatMap(
      (groupTiers) => {
        const groupMaxTierName = getMaxTierName(groupTiers);
        return groupMaxTierName ? [groupMaxTierName] : [];
      }
    );

    if (groupMaxTierNames.length > 0) {
      maxTierName = getMaxTierName(groupMaxTierNames);
      source = "groups";
    } else {
      maxTierName = getMaxTierName(workspaceAllowedTierNames);
      source = "workspace";
    }
  }

  return {
    tiers: maxTierName ? expandTiersUpTo(maxTierName) : [],
    source,
  };
}
