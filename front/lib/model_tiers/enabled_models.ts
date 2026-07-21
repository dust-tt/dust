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
import type { ModelStreamIdType } from "@app/types/assistant/models/auto";
import { AUTO_MODEL_ID, MODEL_STREAMS } from "@app/types/assistant/models/auto";
import { ORDERED_REASONING_EFFORTS } from "@app/types/assistant/models/reasoning";
import type {
  ModelConfigurationType,
  ReasoningEffort,
  ReasoningEffortSupport,
} from "@app/types/assistant/models/types";
import { getMaximumReasoningEffort } from "@app/types/assistant/models/types";

function isStaticModel(
  modelId: string
): modelId is keyof typeof STATIC_MODEL_TIERS {
  return modelId in STATIC_MODEL_TIERS;
}

function restrictModelConfigToAllowedTiers(
  model: ModelConfigurationType,
  allowedTierNamesSet: Set<ModelsTierName>
): EnabledModelConfigurationType {
  if (!isStaticModel(model.modelId)) {
    // Models outside the tier table are models added dynamically (as we
    // have a type guard for all models), so it is expected that we allow them.
    return {
      ...model,
      isSelectable: true,
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
    : getMaximumReasoningEffort(supportedReasoningEfforts);

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

// Resolve a stream tier (Quick/Deep) to a concrete model + reasoning effort.
// Walks the stream's ordered candidate pool and picks the first one available
// (selectable) to the workspace that supports the requested effort. Returns null
// when none of the stream's candidates are available — the caller falls back to
// the auto model.
export async function getModelForStream(
  auth: Authenticator,
  streamId: ModelStreamIdType
): Promise<{
  model: EnabledModelConfigurationType;
  reasoningEffort: ReasoningEffort;
} | null> {
  const availableModels = await getEnabledModelsForAuth(auth);

  for (const candidate of MODEL_STREAMS[streamId]) {
    const model = availableModels.find(
      (m) =>
        m.isSelectable &&
        m.providerId === candidate.providerId &&
        m.modelId === candidate.modelId &&
        m.supportedReasoningEfforts[candidate.reasoningEffort]
    );
    if (model) {
      return { model, reasoningEffort: candidate.reasoningEffort };
    }
  }

  return null;
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
