import { resolveAllowedModelTiers } from "@app/lib/model_tiers/resolve_allowed";
import { expandTiersUpTo } from "@app/lib/model_tiers/tier_order";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import { getModelsTierDisplayName } from "@app/types/assistant/models/model_tiers";

type ResolvedModelTiersForUser = ReturnType<typeof resolveAllowedModelTiers>;

export function resolveModelTiersForUser({
  userId,
  groupNames,
  groupNameToId,
  userAllowedTierNamesByUserId,
  groupTierNamesByGroupId,
  workspaceAllowedTierNames,
}: {
  userId: string;
  groupNames: string[];
  groupNameToId: Map<string, string>;
  userAllowedTierNamesByUserId: Record<string, ModelsTierName[]>;
  groupTierNamesByGroupId: Record<string, ModelsTierName[]>;
  workspaceAllowedTierNames: ModelsTierName[];
}): ResolvedModelTiersForUser {
  const userTierNames = userAllowedTierNamesByUserId[userId] ?? [];

  const groupAllowedTierNamesList = groupNames.map((groupName) => {
    const groupId = groupNameToId.get(groupName);
    if (!groupId) {
      return [];
    }
    return groupTierNamesByGroupId[groupId] ?? [];
  });

  return resolveAllowedModelTiers({
    workspaceAllowedTierNames,
    groupAllowedTierNamesList,
    userAllowedTierNames: userTierNames,
  });
}

export function expandMaxTierName(
  maxTierName: ModelsTierName
): ModelsTierName[] {
  return expandTiersUpTo(maxTierName);
}

export function formatModelTiersSummary(
  maxTierName: ModelsTierName | null | undefined
): string {
  if (!maxTierName) {
    return "--";
  }

  return `Up to ${getModelsTierDisplayName(maxTierName)}`;
}

export function formatUserModelTierInheritLabel({
  groupNames,
  groupNameToId,
  groupTierNamesByGroupId,
  workspaceAllowedTierNames,
}: {
  groupNames: string[];
  groupNameToId: Map<string, string>;
  groupTierNamesByGroupId: Record<string, ModelsTierName[]>;
  workspaceAllowedTierNames: ModelsTierName[];
}): string {
  const resolved = resolveModelTiersForUser({
    userId: "",
    groupNames,
    groupNameToId,
    userAllowedTierNamesByUserId: {},
    groupTierNamesByGroupId,
    workspaceAllowedTierNames,
  });

  return resolved.source === "groups"
    ? "Inherited from groups"
    : "Inherited from workspace";
}
