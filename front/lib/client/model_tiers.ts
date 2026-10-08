import type { ModelsTierDefinition } from "@app/lib/model_tiers/allowed_tiers";
import { resolveAllowedModelTiers } from "@app/lib/model_tiers/resolve_allowed";
import { expandTiersUpTo } from "@app/lib/model_tiers/tier_order";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import { getModelsTierDisplayName } from "@app/types/assistant/models/model_tiers";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

type Translate = (descriptor: MessageDescriptor) => string;

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
  maxTierName: ModelsTierName | null | undefined,
  t: Translate
): string {
  if (!maxTierName) {
    return "--";
  }

  const tierName = getModelsTierDisplayName(maxTierName);
  return t(msg`Up to ${tierName}`);
}

export function formatUserModelTierInheritLabel({
  groupNames,
  groupNameToId,
  groupTierNamesByGroupId,
  workspaceAllowedTierNames,
  t,
}: {
  groupNames: string[];
  groupNameToId: Map<string, string>;
  groupTierNamesByGroupId: Record<string, ModelsTierName[]>;
  workspaceAllowedTierNames: ModelsTierName[];
  t: Translate;
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
    ? t(msg`Inherited from groups`)
    : t(msg`Inherited from workspace`);
}

export function buildModelTierDefinitionByName(
  tiers: readonly ModelsTierDefinition[]
): Map<ModelsTierName, ModelsTierDefinition> {
  return new Map(tiers.map((tier) => [tier.name, tier]));
}
