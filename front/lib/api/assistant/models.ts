import { config as regionConfig } from "@app/lib/api/regions/config";
import { isModelEnabled } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  getModelConfigByModelId,
  getSupportedModelConfig,
} from "@app/lib/llms/model_configurations";
import { isByokTransitioningPlan } from "@app/lib/plans/plan_codes";
import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import {
  CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
} from "@app/types/assistant/models/anthropic";
import { isAutoModel } from "@app/types/assistant/models/dust";
import {
  GEMINI_2_5_FLASH_MODEL_CONFIG,
  GEMINI_3_FLASH_MODEL_CONFIG,
  GEMINI_3_PRO_MODEL_CONFIG,
} from "@app/types/assistant/models/google_ai_studio";
import {
  MISTRAL_MEDIUM_3_5_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
} from "@app/types/assistant/models/mistral";
import {
  GPT_5_5_MODEL_CONFIG,
  GPT_5_MINI_MODEL_CONFIG,
} from "@app/types/assistant/models/openai";
import {
  BYOK_MODEL_PROVIDER_IDS,
  MODEL_PROVIDER_IDS,
} from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import {
  GROK_4_1_FAST_NON_REASONING_MODEL_CONFIG,
  GROK_4_MODEL_CONFIG,
} from "@app/types/assistant/models/xai";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type GetEnabledModelsResponseType = {
  models: ModelConfigurationType[];
};

export function getWhitelistedProviders(
  auth: Authenticator
): Set<ModelProviderIdType> {
  const owner = auth.getNonNullableWorkspace();
  const plan = auth.getNonNullablePlan();
  const whiteListedProviders = new Set<ModelProviderIdType>(
    owner.whiteListedProviders ?? MODEL_PROVIDER_IDS
  );

  // noop never sees user data, always whitelisted.
  whiteListedProviders.add("noop");
  // "dust" is the meta-provider for the "auto" sentinel; it resolves to a
  // concrete model at runtime, so it is always whitelisted.
  whiteListedProviders.add("dust");

  if (!plan.isByok) {
    return whiteListedProviders;
  }

  // For BYOK_TRANSITIONING workspaces, we fall back on Dust-managed keys for BYOK providers when
  // the customer hasn't configured their own. Whitelist all BYOK providers so they remain available
  // even if not yet configured.
  if (isByokTransitioningPlan(plan)) {
    const allByokProviderIds = new Set<ModelProviderIdType>(
      BYOK_MODEL_PROVIDER_IDS
    );
    allByokProviderIds.add("noop");
    allByokProviderIds.add("dust");

    return allByokProviderIds;
  }

  const providersHealth = auth.providersHealth();

  const configuredProviders = new Set(
    Object.keys(providersHealth ?? {}) as ModelProviderIdType[]
  );

  // noop never needs credentials.
  configuredProviders.add("noop");
  // "dust" (the "auto" sentinel) resolves to a concrete model at runtime and
  // needs no credentials of its own.
  configuredProviders.add("dust");

  return whiteListedProviders.intersection(configuredProviders);
}

export function isProviderWhitelisted(
  auth: Authenticator,
  providerId: ModelProviderIdType
): boolean {
  const whitelistedProviders = getWhitelistedProviders(auth);
  return whitelistedProviders.has(providerId);
}

type ModelEnablementContext = Parameters<typeof isModelEnabled>[1];

function getModelEnablementContextWithoutFeatureFlag(
  auth: Authenticator,
  excludeProviders: ReadonlySet<ModelProviderIdType> = new Set()
): ModelEnablementContext {
  const owner = auth.getNonNullableWorkspace();

  return {
    featureFlags: [],
    plan: auth.plan(),
    regionalModelsOnly: owner.regionalModelsOnly,
    region: regionConfig.getCurrentRegion(),
    whitelistedProviders:
      getWhitelistedProviders(auth).difference(excludeProviders),
  };
}

const ORDERED_FAST_MODEL_CONFIGS: ModelConfigurationType[] = [
  MISTRAL_SMALL_MODEL_CONFIG,
  GEMINI_2_5_FLASH_MODEL_CONFIG,
];

export function getFastestWhitelistedModel(
  auth: Authenticator
): ModelConfigurationType | null {
  const context = getModelEnablementContextWithoutFeatureFlag(auth);

  return (
    ORDERED_FAST_MODEL_CONFIGS.find((m) => isModelEnabled(m, context)) ??
    _getSmallWhitelistedModel(context)
  );
}

export function getSmallWhitelistedModel(
  auth: Authenticator,
  excludeProviders: ReadonlySet<ModelProviderIdType> = new Set()
): ModelConfigurationType | null {
  return _getSmallWhitelistedModel(
    getModelEnablementContextWithoutFeatureFlag(auth, excludeProviders)
  );
}

export function getLargeWhitelistedModel(
  auth: Authenticator,
  excludeProviders: ReadonlySet<ModelProviderIdType> = new Set(),
  { forBatch = false }: { forBatch?: boolean } = {}
): ModelConfigurationType | null {
  return _getLargeWhitelistedModel(
    getModelEnablementContextWithoutFeatureFlag(auth, excludeProviders),
    { forBatch }
  );
}

const ORDERED_SMALL_MODEL_CONFIGS: ModelConfigurationType[] = [
  GPT_5_MINI_MODEL_CONFIG,
  CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG,
  GEMINI_3_FLASH_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  GROK_4_1_FAST_NON_REASONING_MODEL_CONFIG,
];

function _getSmallWhitelistedModel(
  context: ModelEnablementContext
): ModelConfigurationType | null {
  return (
    ORDERED_SMALL_MODEL_CONFIGS.find((m) => isModelEnabled(m, context)) ?? null
  );
}

const ORDERED_LARGE_MODEL_CONFIGS: ModelConfigurationType[] = [
  CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
  GPT_5_5_MODEL_CONFIG,
  GEMINI_3_PRO_MODEL_CONFIG,
  MISTRAL_MEDIUM_3_5_MODEL_CONFIG,
  GROK_4_MODEL_CONFIG,
];

function _getLargeWhitelistedModel(
  context: ModelEnablementContext,
  { forBatch: hasBatch }: { forBatch?: boolean } = {}
): ModelConfigurationType | null {
  return (
    ORDERED_LARGE_MODEL_CONFIGS.find(
      (m) =>
        isModelEnabled(m, context) && (!hasBatch || m.supportsBatchProcessing)
    ) ?? null
  );
}

export type ResolvedAgentModel = {
  // The concrete model config to run with.
  modelConfig: ModelConfigurationType;
  // The agent model config with concrete providerId/modelId and a
  // reasoning effort the resolved model actually supports.
  effectiveModel: AgentModelConfigurationType;
};

function buildResolvedAgentModel(
  modelConfig: ModelConfigurationType,
  agentModel: AgentModelConfigurationType
): ResolvedAgentModel {
  // Clamp the stored reasoning effort to what the resolved model supports.
  const storedEffort = agentModel.reasoningEffort;
  const reasoningEffort =
    storedEffort && modelConfig.supportedReasoningEfforts[storedEffort]
      ? storedEffort
      : modelConfig.defaultReasoningEffort;

  return {
    modelConfig,
    effectiveModel: {
      ...agentModel,
      providerId: modelConfig.providerId,
      modelId: modelConfig.modelId,
      reasoningEffort,
    },
  };
}

/**
 * Resolves an agent's stored model config to the concrete model to run with.
 *
 * - When `useBackup` is set and the workspace has a valid backup model, the
 *   backup model is used (cross-provider failover on provider outages). Applies
 *   to all agents, "auto" or not.
 * - Otherwise, the "auto" sentinel resolves to the workspace default model,
 *   falling back to Claude Sonnet 4.6 when unset/invalid.
 * - Otherwise, the agent's own concrete model is used (today's behavior).
 *
 * Returns null only when a concrete (non-auto) agent model is no longer known,
 * preserving the existing "unknown model" handling at the call site.
 */
export function resolveAgentModelConfiguration(
  auth: Authenticator,
  agentModel: AgentModelConfigurationType,
  { useBackup = false }: { useBackup?: boolean } = {}
): ResolvedAgentModel | null {
  const owner = auth.getNonNullableWorkspace();

  if (useBackup && owner.backupModelId) {
    const backup = getModelConfigByModelId(owner.backupModelId);
    if (backup && !isAutoModel(backup)) {
      return buildResolvedAgentModel(backup, agentModel);
    }
    // Misconfigured backup: fall through to the primary resolution below.
  }

  if (isAutoModel(agentModel)) {
    const configured = owner.defaultModelId
      ? getModelConfigByModelId(owner.defaultModelId)
      : null;
    const resolved =
      configured && !isAutoModel(configured)
        ? configured
        : CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG;
    return buildResolvedAgentModel(resolved, agentModel);
  }

  const concrete = getSupportedModelConfig(agentModel);
  if (!concrete) {
    return null;
  }
  return buildResolvedAgentModel(concrete, agentModel);
}

export type WorkspaceModelSettingField = "defaultModelId" | "backupModelId";

export type WorkspaceModelSettingsErrorType =
  | "invalid_model"
  | "model_not_enabled"
  | "model_is_auto";

export class WorkspaceModelSettingsError extends Error {
  constructor(
    readonly type: WorkspaceModelSettingsErrorType,
    readonly field: WorkspaceModelSettingField,
    message: string
  ) {
    super(message);
  }
}

/**
 * Validates the workspace default/backup model settings. Each provided modelId
 * (when not null) must be a concrete, workspace-enabled model — never the
 * "auto" sentinel. Feature-flag-gated and regional models are honored.
 */
export async function validateWorkspaceModelSettings(
  auth: Authenticator,
  settings: {
    defaultModelId?: string | null;
    backupModelId?: string | null;
  }
): Promise<Result<void, WorkspaceModelSettingsError>> {
  const owner = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(auth);
  const context: ModelEnablementContext = {
    featureFlags,
    plan: auth.plan(),
    regionalModelsOnly: owner.regionalModelsOnly,
    region: regionConfig.getCurrentRegion(),
    whitelistedProviders: getWhitelistedProviders(auth),
  };

  const fields: WorkspaceModelSettingField[] = [
    "defaultModelId",
    "backupModelId",
  ];
  for (const field of fields) {
    const modelId = settings[field];
    // undefined => not being updated; null => explicitly cleared.
    if (modelId === undefined || modelId === null) {
      continue;
    }

    const label = field === "defaultModelId" ? "default" : "backup";
    const modelConfig = getModelConfigByModelId(modelId);
    if (!modelConfig) {
      return new Err(
        new WorkspaceModelSettingsError(
          "invalid_model",
          field,
          `Unknown ${label} model "${modelId}".`
        )
      );
    }
    if (isAutoModel(modelConfig)) {
      return new Err(
        new WorkspaceModelSettingsError(
          "model_is_auto",
          field,
          `The "Auto" model cannot be selected as the ${label} model.`
        )
      );
    }
    if (!isModelEnabled(modelConfig, context)) {
      return new Err(
        new WorkspaceModelSettingsError(
          "model_not_enabled",
          field,
          `Model "${modelConfig.displayName}" is not enabled for this workspace and cannot be used as the ${label} model.`
        )
      );
    }
  }

  return new Ok(undefined);
}
