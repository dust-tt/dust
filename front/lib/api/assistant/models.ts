import { config as regionConfig } from "@app/lib/api/regions/config";
import { isModelEnabled } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
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
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
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
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { getWorkspaceDefaultModelSetting } from "@app/types/user";

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

// Whether a given model is a real, supported model that is currently enabled
// for the workspace (provider whitelist + plan + region + feature flags). Used
// to validate the workspace default model an admin tries to pin.
export async function isModelEnabledForWorkspace(
  auth: Authenticator,
  { providerId, modelId }: { providerId: string; modelId: string }
): Promise<boolean> {
  const config = SUPPORTED_MODEL_CONFIGS.find(
    (m) => m.modelId === modelId && m.providerId === providerId
  );
  if (!config) {
    return false;
  }

  const featureFlags = await getFeatureFlags(auth);
  const context = {
    ...getModelEnablementContextWithoutFeatureFlag(auth),
    featureFlags,
  };
  return isModelEnabled(config, context);
}

// The model an admin pinned as the workspace default, looked up in the model
// registry. Returns `null` when unset or when the pinned model is no longer in
// the registry. Does NOT check availability or fall back — callers decide what
// to do when the pinned model is disabled (the global agents let their normal
// fallback handle it; `getWorkspaceDefaultModel` falls back to the live
// default).
export function getPinnedWorkspaceDefaultModel(
  auth: Authenticator
): ModelConfigurationType | null {
  const setting = getWorkspaceDefaultModelSetting(
    auth.getNonNullableWorkspace()
  );
  if (!setting) {
    return null;
  }
  return (
    SUPPORTED_MODEL_CONFIGS.find(
      (m) =>
        m.modelId === setting.modelId && m.providerId === setting.providerId
    ) ?? null
  );
}

// Resolves the workspace default model to a concrete, enabled model
// configuration. This is the single source of truth for "what the default model
// currently is": it backs every custom agent that follows the workspace
// default.
//
// - If an admin pinned a model and it is still enabled for the workspace, that
//   model is returned (the default is "frozen").
// - Otherwise (unset, or the pinned model is no longer available) it falls back
//   to the live best large model, which is exactly today's behavior.
export function getWorkspaceDefaultModel(
  auth: Authenticator,
  { featureFlags = [] }: { featureFlags?: WhitelistableFeature[] } = {}
): ModelConfigurationType | null {
  const pinned = getPinnedWorkspaceDefaultModel(auth);
  if (pinned) {
    const context = {
      ...getModelEnablementContextWithoutFeatureFlag(auth),
      featureFlags,
    };
    if (isModelEnabled(pinned, context)) {
      return pinned;
    }
  }

  return getLargeWhitelistedModel(auth);
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

// Returns the first candidate model that is enabled for the workspace. This is
// the canonical way to pick a model from a preference-ordered list: it runs the
// exact same isModelEnabled predicate (provider whitelist plus plan, region and
// feature-flag availability) that is enforced when a message is posted, so the
// chosen model can never be rejected later as "not supported". It falls through
// to the next candidate instead.
//
// The workspace feature flags must be passed in: selection happens in
// synchronous global-agent builders where they are not otherwise in scope, and
// using the real flags here is what keeps this check identical to the one
// enforced at message time rather than a second, divergent check.
export function selectEnabledModel(
  auth: Authenticator,
  candidates: ModelConfigurationType[],
  {
    featureFlags,
    excludeProviders = new Set(),
  }: {
    featureFlags: WhitelistableFeature[];
    excludeProviders?: ReadonlySet<ModelProviderIdType>;
  }
): ModelConfigurationType | null {
  const context = {
    ...getModelEnablementContextWithoutFeatureFlag(auth, excludeProviders),
    featureFlags,
  };

  return candidates.find((m) => isModelEnabled(m, context)) ?? null;
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
