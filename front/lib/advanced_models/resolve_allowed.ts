import type { AllowedAdvancedModelType } from "@app/types/api/advanced_models";

export function advancedModelKey(model: AllowedAdvancedModelType): string {
  return `${model.providerId}:${model.modelId}`;
}

export type ResolvedAllowedAdvancedModels = {
  models: AllowedAdvancedModelType[];
  hasUserLevelOverride: boolean;
};

export function resolveAllowedAdvancedModels({
  workspaceAllowedAdvancedModels,
  groupAllowedAdvancedModelsList,
  userAllowedAdvancedModels,
}: {
  workspaceAllowedAdvancedModels: AllowedAdvancedModelType[];
  groupAllowedAdvancedModelsList: AllowedAdvancedModelType[][];
  userAllowedAdvancedModels: AllowedAdvancedModelType[];
}): ResolvedAllowedAdvancedModels {
  const hasUserLevelOverride = userAllowedAdvancedModels.length > 0;

  const modelsByKey = new Map<string, AllowedAdvancedModelType>();

  const addModels = (models: AllowedAdvancedModelType[]) => {
    for (const model of models) {
      modelsByKey.set(advancedModelKey(model), model);
    }
  };

  addModels(workspaceAllowedAdvancedModels);

  for (const groupModels of groupAllowedAdvancedModelsList) {
    addModels(groupModels);
  }

  addModels(userAllowedAdvancedModels);

  return {
    models: [...modelsByKey.values()],
    hasUserLevelOverride,
  };
}
