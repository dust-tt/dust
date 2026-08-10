import { isProviderWhitelisted } from "@app/lib/api/assistant/provider_whitelist";
import {
  isCreditPricedPlanPrefix,
  isUpgraded,
} from "@app/lib/plans/plan_codes";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import { isByokProviderId } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import type { PlanType } from "@app/types/plan";
import type { RegionType } from "@app/types/region";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

function isAdvancedModel(m: ModelConfigurationType): boolean {
  return m.availableIfOneOf?.plansWithAdvancedModels === true;
}

export function getAdvancedModels(): ModelConfigurationType[] {
  return SUPPORTED_MODEL_CONFIGS.filter(isAdvancedModel);
}

// False if the model requires an on-demand/dust-only feature flag (not GA).
export function isModelReleased(m: ModelConfigurationType): boolean {
  return !m.availableIfOneOf?.featureFlag;
}

function hasModelAccess(
  m: ModelConfigurationType,
  {
    featureFlags,
    plan,
  }: {
    featureFlags: WhitelistableFeature[];
    plan: PlanType | null;
  }
): boolean {
  // Dust-only override used to expose advanced models in the model picker.
  if (featureFlags.includes("models_picker") && isAdvancedModel(m)) {
    return true;
  }

  const availability = m.availableIfOneOf;
  if (!availability) {
    return !m.largeModel || isUpgraded(plan);
  }

  const { creditPricedPlan, plansWithAdvancedModels, featureFlag } =
    availability;

  const hasConfiguredAccess =
    (creditPricedPlan === true &&
      plan !== null &&
      isCreditPricedPlanPrefix(plan.code)) ||
    (plansWithAdvancedModels === true &&
      plan?.hasAdvancedModelAccess === true) ||
    (featureFlag !== undefined && featureFlags.includes(featureFlag));

  if (!hasConfiguredAccess) {
    return false;
  }

  // A credit-priced-plan condition makes the configured alternatives the
  // complete large-model access rule. Other large models retain the legacy
  // upgraded-plan prerequisite.
  return !m.largeModel || isUpgraded(plan) || creditPricedPlan === true;
}

// Returns true if the model is available to the workspace for build.
export function isModelAvailable(
  m: ModelConfigurationType,
  {
    featureFlags,
    plan,
    regionalModelsOnly,
    region,
  }: {
    featureFlags: WhitelistableFeature[];
    plan: PlanType | null;
    regionalModelsOnly: boolean;
    region: RegionType;
  }
) {
  const hasAccess = hasModelAccess(m, {
    featureFlags,
    plan,
  });

  if (!hasAccess) {
    return false;
  }

  if (plan?.isByok && !isByokProviderId(m.providerId)) {
    return false;
  }

  if (regionalModelsOnly && m.regionalAvailability[region] !== true) {
    return false;
  }

  return true;
}

// Returns true if the model is enabled for the workspace.
export function isModelEnabled(
  m: ModelConfigurationType,
  {
    featureFlags,
    plan,
    regionalModelsOnly,
    region,
    whitelistedProviders,
  }: {
    featureFlags: WhitelistableFeature[];
    plan: PlanType | null;
    regionalModelsOnly: boolean;
    region: RegionType;
    whitelistedProviders: Set<ModelProviderIdType>;
  }
) {
  return (
    isModelAvailable(m, { featureFlags, plan, regionalModelsOnly, region }) &&
    isProviderWhitelisted(whitelistedProviders, m.providerId)
  );
}

export function filterEnabledModels(
  models: ModelConfigurationType[],
  {
    featureFlags,
    plan,
    regionalModelsOnly,
    region,
    whitelistedProviders,
  }: {
    featureFlags: WhitelistableFeature[];
    plan: PlanType | null;
    regionalModelsOnly: boolean;
    region: RegionType;
    whitelistedProviders: Set<ModelProviderIdType>;
  }
): ModelConfigurationType[] {
  return models.filter((m) =>
    isModelEnabled(m, {
      featureFlags,
      plan,
      regionalModelsOnly,
      region,
      whitelistedProviders,
    })
  );
}
