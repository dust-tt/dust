import { pickPreferredLargeModel } from "@app/lib/api/assistant/model_preferences";
import type { ModelsTierName } from "@app/lib/api/assistant/token_pricing/tiers";
import { STATIC_MODEL_TIERS } from "@app/lib/api/assistant/token_pricing/tiers";
import { getAvailableModelsForWorkspace } from "@app/lib/api/assistant/workspace_capabilities";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { ModelsTierResource } from "@app/lib/resources/models_tier_resource";
import type {
  EnabledModelConfigurationType,
  ModelStreamResolutionsType,
  ModelStreamResolutionType,
} from "@app/types/api/assistant/models";
import type { ModelStreamIdType } from "@app/types/assistant/models/auto";
import {
  AUTO_COMPLEX_MODEL_ID,
  AUTO_FAST_MODEL_CONFIG,
  AUTO_FAST_MODEL_ID,
  AUTO_MODEL_CONFIG,
  AUTO_MODEL_ID,
  MODEL_STREAMS,
} from "@app/types/assistant/models/auto";
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

export async function getDefaultStreamConfigForAuth(
  auth: Authenticator
): Promise<ModelConfigurationType> {
  const { tiers } = await ModelsTierResource.resolveAllowedTierNames(auth);

  return tiers.includes("balanced")
    ? AUTO_MODEL_CONFIG
    : AUTO_FAST_MODEL_CONFIG;
}

export function getDefaultModelFromEnabledModels(
  models: EnabledModelConfigurationType[]
): EnabledModelConfigurationType {
  const selectableModels = models.filter((m) => m.isSelectable);

  // Streams are tiered as the tier they are named after, so the Standard stream
  // is out of reach for a Basic-capped member: fall back to the Basic stream
  // before giving up on streams entirely.
  for (const streamId of [AUTO_MODEL_ID, AUTO_FAST_MODEL_ID]) {
    const streamModel = selectableModels.find((m) => m.modelId === streamId);
    if (streamModel) {
      return streamModel;
    }
  }

  return {
    ...pickPreferredLargeModel(selectableModels),
    isSelectable: true,
  };
}

export interface StreamResolutionType {
  model: EnabledModelConfigurationType;
  reasoningEffort: ReasoningEffort;
  // False = none of candidates were available, we fell back to a large model
  fromPool: boolean;
}

// Walks a stream's ordered candidate pool and picks the first one available
// or a fallback large model
export function resolveStreamModel(
  models: EnabledModelConfigurationType[],
  streamId: ModelStreamIdType
): StreamResolutionType {
  for (const candidate of MODEL_STREAMS[streamId]) {
    const model = models.find(
      (m) =>
        m.isSelectable &&
        m.providerId === candidate.providerId &&
        m.modelId === candidate.modelId &&
        m.supportedReasoningEfforts[candidate.reasoningEffort]
    );
    if (model) {
      return {
        model,
        reasoningEffort: candidate.reasoningEffort,
        fromPool: true,
      };
    }
  }

  const fallback = pickPreferredLargeModel(
    models.filter((m) => m.isSelectable)
  );
  return {
    model: { ...fallback, isSelectable: true },
    reasoningEffort: fallback.defaultReasoningEffort,
    fromPool: false,
  };
}

function toStreamResolution(
  models: EnabledModelConfigurationType[],
  streamId: ModelStreamIdType
): ModelStreamResolutionType {
  const { model, reasoningEffort } = resolveStreamModel(models, streamId);
  return {
    providerId: model.providerId,
    modelId: model.modelId,
    displayName: model.displayName,
    reasoningEffort,
  };
}

export function getStreamResolutions(
  models: EnabledModelConfigurationType[]
): ModelStreamResolutionsType {
  return {
    [AUTO_MODEL_ID]: toStreamResolution(models, AUTO_MODEL_ID),
    [AUTO_FAST_MODEL_ID]: toStreamResolution(models, AUTO_FAST_MODEL_ID),
    [AUTO_COMPLEX_MODEL_ID]: toStreamResolution(models, AUTO_COMPLEX_MODEL_ID),
  };
}

export async function getModelsForAuth(auth: Authenticator): Promise<{
  models: EnabledModelConfigurationType[];
  defaultModel: EnabledModelConfigurationType;
  streams: ModelStreamResolutionsType;
}> {
  const models = await getEnabledModelsForAuth(auth);
  return {
    models,
    defaultModel: getDefaultModelFromEnabledModels(models),
    streams: getStreamResolutions(models),
  };
}
