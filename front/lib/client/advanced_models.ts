import type {
  AdvancedModelType,
  AllowedAdvancedModelType,
} from "@app/types/api/advanced_models";

export function advancedModelKey(model: AllowedAdvancedModelType): string {
  return `${model.providerId}:${model.modelId}`;
}

export function isSameAdvancedModel(
  a: AllowedAdvancedModelType,
  b: AllowedAdvancedModelType
): boolean {
  return a.providerId === b.providerId && a.modelId === b.modelId;
}

export type ResolvedAdvancedModelsForUser = {
  models: AllowedAdvancedModelType[];
  hasUserLevelOverride: boolean;
};

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
  const hasUserLevelOverride = userModels.length > 0;

  const modelsByKey = new Map<string, AllowedAdvancedModelType>();

  const addModels = (models: AllowedAdvancedModelType[]) => {
    for (const model of models) {
      modelsByKey.set(advancedModelKey(model), model);
    }
  };

  addModels(workspaceAllowedAdvancedModels);

  for (const groupName of groupNames) {
    const groupId = groupNameToId.get(groupName);
    if (groupId) {
      addModels(groupAdvancedModelsByGroupId[groupId] ?? []);
    }
  }

  addModels(userModels);

  return {
    models: [...modelsByKey.values()],
    hasUserLevelOverride,
  };
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
