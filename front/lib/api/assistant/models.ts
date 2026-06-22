import { config as regionConfig } from "@app/lib/api/regions/config";
import { isModelEnabled } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { isByokTransitioningPlan } from "@app/lib/plans/plan_codes";
import {
  CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
} from "@app/types/assistant/models/anthropic";
import {
  GEMINI_2_5_FLASH_MODEL_CONFIG,
  GEMINI_3_1_PRO_MODEL_CONFIG,
  GEMINI_3_FLASH_MODEL_CONFIG,
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

    return allByokProviderIds;
  }

  const providersHealth = auth.providersHealth();

  const configuredProviders = new Set(
    Object.keys(providersHealth ?? {}) as ModelProviderIdType[]
  );

  // noop never needs credentials.
  configuredProviders.add("noop");

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
  GEMINI_3_1_PRO_MODEL_CONFIG,
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
