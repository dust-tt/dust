import { pickPreferredLargeModel } from "@app/lib/api/assistant/model_preferences";
import {
  type ModelsTierName,
  STATIC_MODEL_TIERS,
} from "@app/lib/api/assistant/token_pricing/tiers";
import { getAvailableModelsForWorkspace } from "@app/lib/api/assistant/workspace_capabilities";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { ModelsTierResource } from "@app/lib/resources/models_tier_resource";
import type { EnabledModelConfigurationType } from "@app/types/api/assistant/models";
import { AUTO_MODEL_ID } from "@app/types/assistant/models/auto";
import { ORDERED_REASONING_EFFORTS } from "@app/types/assistant/models/reasoning";
import type {
  ModelConfigurationType,
  ReasoningEffortSupport,
} from "@app/types/assistant/models/types";
import { getMinimumReasoningEffort } from "@app/types/assistant/models/types";

function isTieredModelId(
  modelId: string
): modelId is keyof typeof STATIC_MODEL_TIERS {
  return modelId in STATIC_MODEL_TIERS;
}

function restrictModelConfigToAllowedTiers(
  model: ModelConfigurationType,
  allowedTierNamesSet: Set<ModelsTierName>
): EnabledModelConfigurationType {
  if (!isTieredModelId(model.modelId)) {
    return {
      ...model,
      isSelectable: false,
    };
  }

  const supportedReasoningEfforts: ReasoningEffortSupport = {
    none: false,
    light: false,
    medium: false,
    high: false,
  };

  for (const effort of ORDERED_REASONING_EFFORTS) {
    if (!model.supportedReasoningEfforts[effort]) {
      continue;
    }

    const tierName = ModelsTierResource.getTierForModel(model.modelId, effort);
    if (tierName && allowedTierNamesSet.has(tierName)) {
      supportedReasoningEfforts[effort] = true;
    }
  }

  const defaultReasoningEffort = supportedReasoningEfforts[
    model.defaultReasoningEffort
  ]
    ? model.defaultReasoningEffort
    : getMinimumReasoningEffort(supportedReasoningEfforts);

  return {
    ...model,
    supportedReasoningEfforts,
    defaultReasoningEffort,
    isSelectable: ORDERED_REASONING_EFFORTS.some(
      (effort) => supportedReasoningEfforts[effort]
    ),
  };
}

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

  const { tiers: allowedTierNames } =
    await ModelsTierResource.resolveAllowedTierNames(auth);
  const allowedTierNamesSet = new Set(allowedTierNames);

  return models.map((model) =>
    restrictModelConfigToAllowedTiers(model, allowedTierNamesSet)
  );
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
  const autoModel = selectableModels.find((m) => m.modelId === AUTO_MODEL_ID);
  if (autoModel) {
    return autoModel;
  }

  return {
    ...pickPreferredLargeModel(selectableModels),
    isSelectable: true,
  };
}

export async function getAutoModelForAuth(
  auth: Authenticator
): Promise<EnabledModelConfigurationType | null> {
  const availableModels = await getEnabledModelsForAuth(auth);
  return {
    ...pickPreferredLargeModel(availableModels.filter((m) => m.isSelectable)),
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
