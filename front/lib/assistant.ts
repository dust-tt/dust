import type { Authenticator } from "@app/lib/auth";
import {
  isByokTransitioningPlan,
  isDustCompanyPlan,
  isEntreprisePlanPrefix,
  isUpgraded,
} from "@app/lib/plans/plan_codes";
import {
  CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
} from "@app/types/assistant/models/anthropic";
import {
  GEMINI_2_5_FLASH_MODEL_CONFIG,
  GEMINI_3_FLASH_MODEL_CONFIG,
  GEMINI_3_PRO_MODEL_CONFIG,
} from "@app/types/assistant/models/google_ai_studio";
import {
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
} from "@app/types/assistant/models/mistral";
import {
  GPT_5_4_MODEL_CONFIG,
  GPT_5_MINI_MODEL_CONFIG,
} from "@app/types/assistant/models/openai";
import {
  BYOK_MODEL_PROVIDER_IDS,
  isByokProviderId,
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
import type { PlanType } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export function isEnterpriseOrDust(plan: PlanType | null): boolean {
  return (
    plan !== null &&
    (isEntreprisePlanPrefix(plan.code) || isDustCompanyPlan(plan.code))
  );
}

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

export function getFastestWhitelistedModel(
  auth: Authenticator
): ModelConfigurationType | null {
  const whitelistedProviders = getWhitelistedProviders(auth);
  if (whitelistedProviders.has("mistral")) {
    return MISTRAL_SMALL_MODEL_CONFIG;
  }
  if (whitelistedProviders.has("google_ai_studio")) {
    return GEMINI_2_5_FLASH_MODEL_CONFIG;
  }
  return _getSmallWhitelistedModel(whitelistedProviders);
}

export function getSmallWhitelistedModel(
  auth: Authenticator
): ModelConfigurationType | null {
  const whitelistedProviders = getWhitelistedProviders(auth);
  return _getSmallWhitelistedModel(whitelistedProviders);
}

export function getLargeWhitelistedModel(
  auth: Authenticator
): ModelConfigurationType | null {
  const whitelistedProviders = getWhitelistedProviders(auth);
  return _getLargeWhitelistedModel(whitelistedProviders);
}

function _getSmallWhitelistedModel(
  whitelistedProviders: Set<ModelProviderIdType>
): ModelConfigurationType | null {
  if (whitelistedProviders.has("openai")) {
    return GPT_5_MINI_MODEL_CONFIG;
  }
  if (whitelistedProviders.has("anthropic")) {
    return CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG;
  }
  if (whitelistedProviders.has("google_ai_studio")) {
    return GEMINI_3_FLASH_MODEL_CONFIG;
  }
  if (whitelistedProviders.has("mistral")) {
    return MISTRAL_SMALL_MODEL_CONFIG;
  }
  if (whitelistedProviders.has("xai")) {
    return GROK_4_1_FAST_NON_REASONING_MODEL_CONFIG;
  }
  return null;
}

function _getLargeWhitelistedModel(
  whitelistedProviders: Set<ModelProviderIdType>
): ModelConfigurationType | null {
  if (whitelistedProviders.has("anthropic")) {
    return CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG;
  }
  if (whitelistedProviders.has("openai")) {
    return GPT_5_4_MODEL_CONFIG;
  }
  if (whitelistedProviders.has("google_ai_studio")) {
    return GEMINI_3_PRO_MODEL_CONFIG;
  }
  if (whitelistedProviders.has("mistral")) {
    return MISTRAL_LARGE_MODEL_CONFIG;
  }
  if (whitelistedProviders.has("xai")) {
    return GROK_4_MODEL_CONFIG;
  }
  return null;
}

// Returns true if the model is available to the workspace for use.
export function isModelAvailable(
  m: ModelConfigurationType,
  featureFlags: WhitelistableFeature[],
  plan: PlanType | null
) {
  if (plan?.isByok && !isByokProviderId(m.providerId)) {
    return false;
  }

  if (!m.availableIfOneOf) {
    return true;
  }

  const { enterprise, featureFlag } = m.availableIfOneOf;

  if (enterprise === true && isEnterpriseOrDust(plan)) {
    return true;
  }

  if (featureFlag && featureFlags.includes(featureFlag)) {
    return true;
  }

  return false;
}

// Returns true if the model is available to the workspace for build.
export function isModelCustomAvailable(
  m: ModelConfigurationType,
  featureFlags: WhitelistableFeature[],
  plan: PlanType | null
) {
  if (!isModelAvailable(m, featureFlags, plan)) {
    return false;
  }

  if (m.customAvailableIf) {
    return (
      m.customAvailableIf.featureFlag &&
      featureFlags.includes(m.customAvailableIf.featureFlag)
    );
  }

  if (m.largeModel && !isUpgraded(plan)) {
    return false;
  }

  return true;
}

export function filterCustomAvailableAndWhitelistedModels(
  models: ModelConfigurationType[],
  featureFlags: WhitelistableFeature[],
  auth: Authenticator
): ModelConfigurationType[] {
  const plan = auth.plan();
  const whitelistedProviders = getWhitelistedProviders(auth);

  return models.filter(
    (m) =>
      isModelCustomAvailable(m, featureFlags, plan) &&
      whitelistedProviders.has(m.providerId)
  );
}
