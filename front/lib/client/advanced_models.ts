import {
  advancedModelKey,
  type ResolvedAllowedAdvancedModels,
  resolveAllowedAdvancedModels,
} from "@app/lib/advanced_models/resolve_allowed";
import type {
  AdvancedModelType,
  AllowedAdvancedModelType,
} from "@app/types/api/advanced_models";

export { advancedModelKey };

export function isSameAdvancedModel(
  a: AllowedAdvancedModelType,
  b: AllowedAdvancedModelType
): boolean {
  return a.providerId === b.providerId && a.modelId === b.modelId;
}

export type ResolvedAdvancedModelsForUser = ResolvedAllowedAdvancedModels;

export function resolveAdvancedModelsForUser({
  userId,
  groupNames,
  groupNameToId,
  userAllowedAdvancedModelsByUserId,
  groupAdvancedModelsByGroupId,
  workspaceAllowedAdvancedModels,
}: {
  userId: string;
  groupNames: string[];
  groupNameToId: Map<string, string>;
  userAllowedAdvancedModelsByUserId: Record<string, AllowedAdvancedModelType[]>;
  groupAdvancedModelsByGroupId: Record<string, AllowedAdvancedModelType[]>;
  workspaceAllowedAdvancedModels: AllowedAdvancedModelType[];
}): ResolvedAdvancedModelsForUser {
  const userModels = userAllowedAdvancedModelsByUserId[userId] ?? [];

  const groupAllowedAdvancedModelsList = groupNames.map((groupName) => {
    const groupId = groupNameToId.get(groupName);
    if (!groupId) {
      return [];
    }
    return groupAdvancedModelsByGroupId[groupId] ?? [];
  });

  return resolveAllowedAdvancedModels({
    workspaceAllowedAdvancedModels,
    groupAllowedAdvancedModelsList,
    userAllowedAdvancedModels: userModels,
  });
}

export function getAdvancedModelDisplayNames({
  models,
  displayNameByKey,
}: {
  models: AllowedAdvancedModelType[];
  displayNameByKey: Map<string, string>;
}): string[] {
  return models.map(
    (model) => displayNameByKey.get(advancedModelKey(model)) ?? model.modelId
  );
}

export function formatAdvancedModelsSummary({
  models,
  displayNameByKey,
}: {
  models: AllowedAdvancedModelType[];
  displayNameByKey: Map<string, string>;
}): string {
  const displayNames = getAdvancedModelDisplayNames({
    models,
    displayNameByKey,
  });
  if (displayNames.length === 0) {
    return "--";
  }
  return displayNames.join(", ");
}

export function buildAdvancedModelDisplayNameMap(
  catalog: AdvancedModelType[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const model of catalog) {
    map.set(advancedModelKey(model), model.displayName);
  }
  return map;
}
