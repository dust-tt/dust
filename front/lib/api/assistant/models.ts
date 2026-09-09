import { PREFERRED_LARGE_MODEL_CONFIGS } from "@app/lib/api/assistant/model_preferences";
import { isProviderWhitelisted } from "@app/lib/api/assistant/provider_whitelist";
import { config as regionConfig } from "@app/lib/api/regions/config";
import { isModelEnabled } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { isByokTransitioningPlan } from "@app/lib/plans/plan_codes";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import { GEMINI_3_5_FLASH_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";
import { MISTRAL_SMALL_MODEL_CONFIG } from "@app/types/assistant/models/mistral";
import { isModelId } from "@app/types/assistant/models/models";
import { GPT_5_MINI_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import {
  BYOK_MODEL_PROVIDER_IDS,
  isModelProviderId,
  MODEL_PROVIDER_IDS,
} from "@app/types/assistant/models/providers";
import { isReasoningEffort } from "@app/types/assistant/models/reasoning";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
  ReasoningEffort,
  ResolvedRequestedModel,
} from "@app/types/assistant/models/types";
import {
  GROK_4_5_MODEL_CONFIG,
  GROK_4_6_MODEL_CONFIG,
} from "@app/types/assistant/models/xai";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

// Effective white-listed providers for the authenticated workspace: the configured value
// overlaid with the global provider kill switches. Resolved once at an async boundary and
// passed into the synchronous gating functions below, like featureFlags.
export async function getEffectiveWhiteListedProviders(
  auth: Authenticator
): Promise<ModelProviderIdType[] | null> {
  const owner = auth.getNonNullableWorkspace();
  return WorkspaceResource.getWhiteListedProvidersFilteredByKillSwitches(
    owner.whiteListedProviders
  );
}

export function getWhitelistedProviders(
  auth: Authenticator,
  whiteListedProvidersInput: ModelProviderIdType[] | null
): Set<ModelProviderIdType> {
  const plan = auth.getNonNullablePlan();
  const whiteListedProviders = new Set<ModelProviderIdType>(
    whiteListedProvidersInput ?? MODEL_PROVIDER_IDS
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

export { isProviderWhitelisted } from "@app/lib/api/assistant/provider_whitelist";

export function isProviderWhitelistedForAuth(
  auth: Authenticator,
  providerId: ModelProviderIdType,
  whiteListedProviders: ModelProviderIdType[] | null
): boolean {
  return isProviderWhitelisted(
    getWhitelistedProviders(auth, whiteListedProviders),
    providerId
  );
}

type ModelEnablementContext = Parameters<typeof isModelEnabled>[1];

function getModelEnablementContext(
  auth: Authenticator,
  whiteListedProviders: ModelProviderIdType[] | null,
  excludeProviders: ReadonlySet<ModelProviderIdType> = new Set(),
  featureFlags: WhitelistableFeature[] = []
): ModelEnablementContext {
  const owner = auth.getNonNullableWorkspace();

  return {
    featureFlags,
    plan: auth.plan(),
    regionalModelsOnly: owner.regionalModelsOnly,
    region: regionConfig.getCurrentRegion(),
    whitelistedProviders: getWhitelistedProviders(
      auth,
      whiteListedProviders
    ).difference(excludeProviders),
  };
}

// Returns the first candidate model that is enabled for the workspace. This is
// the canonical way to pick a model from a preference-ordered list: it runs the
// exact same isModelEnabled predicate (provider whitelist plus plan, region and
// feature-flag availability) that is enforced when a message is posted, so the
// chosen model can never be rejected later as "not supported". It falls through
// to the next candidate instead.
//
// The workspace feature flags and effective white-listed providers must be
// passed in: selection happens in synchronous global-agent builders where they
// are not otherwise in scope, and using the real values here is what keeps this
// check identical to the one enforced at message time rather than a second,
// divergent check. Resolve the providers with getEffectiveWhiteListedProviders
// at the nearest async boundary.
export function selectEnabledModel(
  auth: Authenticator,
  candidates: ModelConfigurationType[],
  {
    featureFlags,
    whiteListedProviders,
    excludeProviders = new Set(),
  }: {
    featureFlags: WhitelistableFeature[];
    whiteListedProviders: ModelProviderIdType[] | null;
    excludeProviders?: ReadonlySet<ModelProviderIdType>;
  }
): ModelConfigurationType | null {
  const context = getModelEnablementContext(
    auth,
    whiteListedProviders,
    excludeProviders,
    featureFlags
  );

  return candidates.find((m) => isModelEnabled(m, context)) ?? null;
}

const ORDERED_FAST_MODEL_CONFIGS: ModelConfigurationType[] = [
  MISTRAL_SMALL_MODEL_CONFIG,
  GEMINI_3_5_FLASH_MODEL_CONFIG,
];

export function getFastestWhitelistedModel(
  auth: Authenticator,
  {
    whiteListedProviders,
  }: { whiteListedProviders: ModelProviderIdType[] | null }
): ModelConfigurationType | null {
  const context = getModelEnablementContext(auth, whiteListedProviders);

  return (
    ORDERED_FAST_MODEL_CONFIGS.find((m) => isModelEnabled(m, context)) ??
    _getSmallWhitelistedModel(context)
  );
}

export function getSmallWhitelistedModel(
  auth: Authenticator,
  excludeProviders: ReadonlySet<ModelProviderIdType> = new Set(),
  {
    featureFlags = [],
    whiteListedProviders,
  }: {
    featureFlags?: WhitelistableFeature[];
    whiteListedProviders: ModelProviderIdType[] | null;
  }
): ModelConfigurationType | null {
  return _getSmallWhitelistedModel(
    getModelEnablementContext(
      auth,
      whiteListedProviders,
      excludeProviders,
      featureFlags
    )
  );
}

export function getLargeWhitelistedModel(
  auth: Authenticator,
  excludeProviders: ReadonlySet<ModelProviderIdType> = new Set(),
  {
    forBatch = false,
    featureFlags = [],
    whiteListedProviders,
  }: {
    forBatch?: boolean;
    featureFlags?: WhitelistableFeature[];
    whiteListedProviders: ModelProviderIdType[] | null;
  }
): ModelConfigurationType | null {
  return _getLargeWhitelistedModel(
    getModelEnablementContext(
      auth,
      whiteListedProviders,
      excludeProviders,
      featureFlags
    ),
    { forBatch }
  );
}

const ORDERED_SMALL_MODEL_CONFIGS: ModelConfigurationType[] = [
  GPT_5_MINI_MODEL_CONFIG,
  CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG,
  GEMINI_3_5_FLASH_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  GROK_4_6_MODEL_CONFIG,
  GROK_4_5_MODEL_CONFIG,
];

function _getSmallWhitelistedModel(
  context: ModelEnablementContext
): ModelConfigurationType | null {
  return (
    ORDERED_SMALL_MODEL_CONFIGS.find((m) => isModelEnabled(m, context)) ?? null
  );
}

function _getLargeWhitelistedModel(
  context: ModelEnablementContext,
  { forBatch: hasBatch }: { forBatch?: boolean } = {}
): ModelConfigurationType | null {
  return (
    PREFERRED_LARGE_MODEL_CONFIGS.find(
      (m) =>
        isModelEnabled(m, context) && (!hasBatch || m.supportsBatchProcessing)
    ) ?? null
  );
}

function isResolvedModel(m: {
  providerId: string | null;
  modelId: string | null;
  reasoningEffort: string | null;
}): m is ResolvedRequestedModel {
  return (
    m.providerId !== null &&
    m.modelId !== null &&
    m.reasoningEffort !== null &&
    isModelProviderId(m.providerId) &&
    isModelId(m.modelId) &&
    isReasoningEffort(m.reasoningEffort as ReasoningEffort)
  );
}

export function resolvedModelFromUserMessageRow(row: {
  requestedProviderId: string | null;
  requestedModelId: string | null;
  requestedReasoningEffort: string | null;
}): ResolvedRequestedModel | null {
  const { requestedProviderId, requestedModelId, requestedReasoningEffort } =
    row;
  const resolvedModel = {
    providerId: requestedProviderId,
    modelId: requestedModelId,
    reasoningEffort: requestedReasoningEffort,
  };
  if (!isResolvedModel(resolvedModel)) {
    return null;
  }

  return resolvedModel;
}

// Rebuilds a `ResolvedRequestedModel` from the raw agent|user-message columns, or null
// when no override was stored (or the stored values fail validation). Values are
// written by the resolver above, so validation is defensive.
export function resolvedModelFromAgentMessageRow(row: {
  resolvedProviderId: string | null;
  resolvedModelId: string | null;
  resolvedReasoningEffort: string | null;
}): ResolvedRequestedModel | null {
  const { resolvedProviderId, resolvedModelId, resolvedReasoningEffort } = row;
  const resolvedModel = {
    providerId: resolvedProviderId,
    modelId: resolvedModelId,
    reasoningEffort: resolvedReasoningEffort,
  };
  if (!isResolvedModel(resolvedModel)) {
    return null;
  }

  return resolvedModel;
}
