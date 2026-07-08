import { advancedModelKey } from "@app/lib/advanced_models/resolve_allowed";
import { pickPreferredLargeModel } from "@app/lib/api/assistant/models";
import { getAvailableModelsForWorkspace } from "@app/lib/api/assistant/workspace_capabilities";
import { isAdvancedModel } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AdvancedModelResource } from "@app/lib/resources/advanced_model_resource";
import type { EnabledModelConfigurationType } from "@app/types/api/assistant/models";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";

export async function withModelSelectability(
  auth: Authenticator,
  { models }: { models: ModelConfigurationType[] }
): Promise<EnabledModelConfigurationType[]> {
  const featureFlags = await getFeatureFlags(auth);

  if (!featureFlags.includes("models_picker")) {
    return models.map((model) => ({
      ...model,
      isSelectable: true,
    }));
  }

  const { models: allowedAdvancedModels } =
    await AdvancedModelResource.resolveAllowedAdvancedModels(auth, {
      user: auth.user(),
    });

  const allowedAdvancedModelKeys = new Set(
    allowedAdvancedModels.map(advancedModelKey)
  );

  return models.map((model) => ({
    ...model,
    isSelectable:
      !isAdvancedModel(model) ||
      allowedAdvancedModelKeys.has(advancedModelKey(model)),
  }));
}

export async function getEnabledModelsForAuth(
  auth: Authenticator
): Promise<EnabledModelConfigurationType[]> {
  const availableModels = await getAvailableModelsForWorkspace(auth);
  return withModelSelectability(auth, { models: availableModels });
}

export function getDefaultModelFromEnabledModels(
  models: EnabledModelConfigurationType[]
): EnabledModelConfigurationType {
  const selectableModels = models.filter((m) => m.isSelectable);
  return {
    ...pickPreferredLargeModel(selectableModels),
    isSelectable: true,
  };
}

export async function getModelsForAuth(auth: Authenticator): Promise<{
  models: EnabledModelConfigurationType[];
  defaultModel: EnabledModelConfigurationType;
}> {
  const models = await getEnabledModelsForAuth(auth);
  return {
    models,
    defaultModel: getDefaultModelFromEnabledModels(models),
  };
}
