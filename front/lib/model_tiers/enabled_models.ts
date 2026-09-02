import { getDegradedModelIds } from "@app/lib/api/assistant/degraded_models";
import { pickPreferredLargeModel } from "@app/lib/api/assistant/model_preferences";
import { getAvailableModelsForWorkspace } from "@app/lib/api/assistant/workspace_capabilities";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { resolveAllowedTierNames } from "@app/lib/model_tiers/allowed_tiers";
import type {
  EnabledModelConfigurationType,
  GetEnabledModelsResponseType,
  ModelSelectionAvailabilityType,
  ModelSelectionLockReason,
  ModelStreamResolutionsType,
  ModelStreamResolutionType,
  ReasoningEffortSelectionUnavailabilityReason,
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
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import {
  getTierForModel,
  STATIC_MODEL_TIERS,
} from "@app/types/assistant/models/model_tiers";
import { ORDERED_REASONING_EFFORTS } from "@app/types/assistant/models/reasoning";
import type {
  ModelConfigurationType,
  ReasoningEffort,
  ReasoningEffortSupport,
} from "@app/types/assistant/models/types";
import { getMaximumReasoningEffort } from "@app/types/assistant/models/types";
import { isCreditPricedPlan } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

const PICKER_REASONING_EFFORTS: ReasoningEffort[] = ["light", "medium", "high"];

function isStaticModel(
  modelId: string
): modelId is keyof typeof STATIC_MODEL_TIERS {
  return modelId in STATIC_MODEL_TIERS;
}

function canSelectPremiumOptions(
  auth: Authenticator,
  featureFlags: WhitelistableFeature[]
): boolean {
  const plan = auth.plan();

  return (
    (plan !== null &&
      (isCreditPricedPlan(plan) || plan.hasAdvancedModelAccess)) ||
    featureFlags.includes("claude_4_5_opus_feature")
  );
}

function getEffortUnavailabilityReason(
  model: ModelConfigurationType,
  enabledModel: EnabledModelConfigurationType,
  effort: ReasoningEffort,
  premiumOptionsAreSelectable: boolean
): ReasoningEffortSelectionUnavailabilityReason | null {
  if (!model.supportedReasoningEfforts[effort]) {
    return "unsupported";
  }

  if (!enabledModel.supportedReasoningEfforts[effort]) {
    return "tier_limit";
  }

  if (
    !premiumOptionsAreSelectable &&
    getTierForModel(model.modelId, effort) === "premium"
  ) {
    return "premium_entitlement";
  }

  return null;
}

function getSelectionAvailability(
  model: ModelConfigurationType,
  enabledModel: EnabledModelConfigurationType,
  premiumOptionsAreSelectable: boolean
): ModelSelectionAvailabilityType {
  const usesReasoningEffort = PICKER_REASONING_EFFORTS.some(
    (effort) => model.supportedReasoningEfforts[effort]
  );
  const efforts: ReasoningEffort[] = usesReasoningEffort
    ? PICKER_REASONING_EFFORTS
    : ["none"];
  const options = efforts.map((effort) => ({
    effort,
    unavailabilityReason: getEffortUnavailabilityReason(
      model,
      enabledModel,
      effort,
      premiumOptionsAreSelectable
    ),
  }));
  const selectableOptions = options.filter(
    ({ unavailabilityReason }) => unavailabilityReason === null
  );

  let lockReason: ModelSelectionLockReason | null = null;
  if (selectableOptions.length === 0) {
    if (
      options.some((option) => option.unavailabilityReason === "tier_limit")
    ) {
      lockReason = "tier_limit";
    } else if (
      options.some(
        (option) => option.unavailabilityReason === "premium_entitlement"
      )
    ) {
      lockReason = "premium_entitlement";
    }
  }

  const defaultOption = selectableOptions.find(
    ({ effort }) => effort === enabledModel.defaultReasoningEffort
  );

  return {
    defaultReasoningEffort:
      defaultOption?.effort ?? selectableOptions[0]?.effort ?? "none",
    reasoningEfforts: usesReasoningEffort ? options : [],
    lockReason,
  };
}

function withSelectionAvailability(
  models: ModelConfigurationType[],
  enabledModels: EnabledModelConfigurationType[],
  premiumOptionsAreSelectable: boolean
): EnabledModelConfigurationType[] {
  return enabledModels.map((enabledModel, index) => {
    // withModelSelectability preserves the input order and cardinality.
    const model = models[index] ?? enabledModel;
    return {
      ...enabledModel,
      selectionAvailability: getSelectionAvailability(
        model,
        enabledModel,
        premiumOptionsAreSelectable
      ),
    };
  });
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

    const tierName = getTierForModel(model.modelId, effort);
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
  {
    models,
    allowedTierNamesOverride,
  }: {
    models: ModelConfigurationType[];
    // Set to bypass the member's own tier grants (see getAgentAllowedTierNamesOverride).
    allowedTierNamesOverride?: ModelsTierName[] | null;
  }
): Promise<EnabledModelConfigurationType[]> {
  const allowedTierNames =
    allowedTierNamesOverride ?? (await resolveAllowedTierNames(auth)).tiers;
  const allowedTierNamesSet = new Set(allowedTierNames);

  return models.map((model) =>
    restrictModelConfigToAllowedTiers(model, allowedTierNamesSet)
  );
}

export async function getEnabledModelsForAuth(
  auth: Authenticator,
  {
    allowedTierNamesOverride,
  }: { allowedTierNamesOverride?: ModelsTierName[] | null } = {}
): Promise<EnabledModelConfigurationType[]> {
  const availableModels = await getAvailableModelsForWorkspace(auth);
  return withModelSelectability(auth, {
    models: availableModels,
    allowedTierNamesOverride,
  });
}

export async function getDefaultStreamConfigForAuth(
  auth: Authenticator
): Promise<ModelConfigurationType> {
  const { tiers } = await resolveAllowedTierNames(auth);

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
// or a fallback large model.
//
// Degraded models are skipped here and only here: a stream picks a model on the
// user's behalf, so routing around an ongoing provider incident is ours to do.
// A definitive pick -- an agent configured on a concrete model, or a user
// overriding the model from the picker -- is left alone and runs as usual.
export function resolveStreamModel(
  models: EnabledModelConfigurationType[],
  streamId: ModelStreamIdType,
  degradedModelIds: ReadonlySet<string>
): StreamResolutionType {
  const candidateModels = models.filter(
    (m) => m.isSelectable && !degradedModelIds.has(m.modelId)
  );

  for (const candidate of MODEL_STREAMS[streamId]) {
    const model = candidateModels.find(
      (m) =>
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

  // Still off the degraded ones: the last-resort fallback is as automatic a pick
  // as the pool walk itself.
  const fallback = pickPreferredLargeModel(candidateModels);
  return {
    model: { ...fallback, isSelectable: true },
    reasoningEffort: fallback.defaultReasoningEffort,
    fromPool: false,
  };
}

function toStreamResolution(
  models: EnabledModelConfigurationType[],
  streamId: ModelStreamIdType,
  degradedModelIds: ReadonlySet<string>
): ModelStreamResolutionType {
  const { model, reasoningEffort } = resolveStreamModel(
    models,
    streamId,
    degradedModelIds
  );
  return {
    providerId: model.providerId,
    modelId: model.modelId,
    displayName: model.displayName,
    reasoningEffort,
  };
}

export function getStreamResolutions(
  models: EnabledModelConfigurationType[],
  degradedModelIds: ReadonlySet<string>
): ModelStreamResolutionsType {
  return {
    [AUTO_MODEL_ID]: toStreamResolution(
      models,
      AUTO_MODEL_ID,
      degradedModelIds
    ),
    [AUTO_FAST_MODEL_ID]: toStreamResolution(
      models,
      AUTO_FAST_MODEL_ID,
      degradedModelIds
    ),
    [AUTO_COMPLEX_MODEL_ID]: toStreamResolution(
      models,
      AUTO_COMPLEX_MODEL_ID,
      degradedModelIds
    ),
  };
}

export async function getModelsForAuth(
  auth: Authenticator
): Promise<GetEnabledModelsResponseType> {
  const featureFlags = await getFeatureFlags(auth);
  const availableModels = await getAvailableModelsForWorkspace(
    auth,
    featureFlags
  );
  const enabledModels = await withModelSelectability(auth, {
    models: availableModels,
  });
  const models = withSelectionAvailability(
    availableModels,
    enabledModels,
    canSelectPremiumOptions(auth, featureFlags)
  );
  const degradedModelIds = getDegradedModelIds();

  return {
    models,
    defaultModel: getDefaultModelFromEnabledModels(models),
    streams: getStreamResolutions(models, degradedModelIds),
    degradedModelIds: models
      .filter((m) => degradedModelIds.has(m.modelId))
      .map((m) => m.modelId),
  };
}
