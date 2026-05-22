import { getWhitelistedProviders } from "@app/lib/api/assistant/models";
import type { RegionType } from "@app/lib/api/regions/config";
import type { Authenticator } from "@app/lib/auth";
import {
  isDustCompanyPlan,
  isEntreprisePlanPrefix,
  isUpgraded,
} from "@app/lib/plans/plan_codes";
import { CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import { GEMINI_3_PRO_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";
import { MISTRAL_MEDIUM_3_5_MODEL_CONFIG } from "@app/types/assistant/models/mistral";
import { GPT_5_5_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import { isByokProviderId } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import { GROK_4_MODEL_CONFIG } from "@app/types/assistant/models/xai";
import type { PlanType } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { WorkspaceType } from "@app/types/user";

export function isEnterpriseOrDust(plan: PlanType | null): boolean {
  return (
    plan !== null &&
    (isEntreprisePlanPrefix(plan.code) || isDustCompanyPlan(plan.code))
  );
}

export function getLargeWhitelistedModel(
  auth: Authenticator,
  excludeProviders: ReadonlySet<ModelProviderIdType> = new Set(),
  { forBatch = false }: { forBatch?: boolean } = {}
): ModelConfigurationType | null {
  return _getLargeWhitelistedModel(
    getWhitelistedProviders(auth).difference(excludeProviders),
    { forBatch }
  );
}

const LARGE_MODEL_CONFIGS: ModelConfigurationType[] = [
  CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
  GPT_5_5_MODEL_CONFIG,
  GEMINI_3_PRO_MODEL_CONFIG,
  MISTRAL_MEDIUM_3_5_MODEL_CONFIG,
  GROK_4_MODEL_CONFIG,
];

function _getLargeWhitelistedModel(
  whitelistedProviders: Set<ModelProviderIdType>,
  { forBatch: hasBatch }: { forBatch?: boolean } = {}
): ModelConfigurationType | null {
  const compatibleModels = LARGE_MODEL_CONFIGS.filter(
    (m) =>
      whitelistedProviders.has(m.providerId) &&
      (!hasBatch || m.supportsBatchProcessing)
  );

  return compatibleModels[0] ?? null;
}

// Returns true if the model is available to the workspace for use.
export function isModelAvailable(
  m: ModelConfigurationType,
  {
    featureFlags,
    plan,
    owner,
    region,
  }: {
    featureFlags: WhitelistableFeature[];
    plan: PlanType | null;
    owner: WorkspaceType;
    region: RegionType;
  }
) {
  if (plan?.isByok && !isByokProviderId(m.providerId)) {
    return false;
  }

  if (owner.regionalModelsOnly && m.regionalAvailability[region] !== true) {
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
  {
    featureFlags,
    plan,
    owner,
    region,
  }: {
    featureFlags: WhitelistableFeature[];
    plan: PlanType | null;
    owner: WorkspaceType;
    region: RegionType;
  }
) {
  if (!isModelAvailable(m, { featureFlags, plan, owner, region })) {
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
  {
    featureFlags,
    plan,
    owner,
    region,
    whitelistedProviders,
  }: {
    featureFlags: WhitelistableFeature[];
    plan: PlanType | null;
    owner: WorkspaceType;
    region: RegionType;
    whitelistedProviders: Set<ModelProviderIdType>;
  }
): ModelConfigurationType[] {
  return models.filter(
    (m) =>
      isModelCustomAvailable(m, { featureFlags, plan, owner, region }) &&
      whitelistedProviders.has(m.providerId)
  );
}
