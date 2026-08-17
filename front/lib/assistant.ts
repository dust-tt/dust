import { isProviderWhitelisted } from "@app/lib/api/assistant/provider_whitelist";
import {
  isCreditPricedPlanPrefix,
  isUpgraded,
} from "@app/lib/plans/plan_codes";
import { isByokProviderId } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import type { PlanType } from "@app/types/plan";
import type { RegionType } from "@app/types/region";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

// False if the model requires an on-demand/dust-only feature flag (not GA).
export function isModelReleased(m: ModelConfigurationType): boolean {
  return !m.availableIfOneOf?.featureFlag;
}

function checkModelSpecificAccessRules(
  modelConfiguration: ModelConfigurationType,
  {
    featureFlags,
    plan,
  }: {
    featureFlags: WhitelistableFeature[];
    plan: PlanType | null;
  }
): boolean {
  const { availableIfOneOf, largeModel } = modelConfiguration;

  // First check: downgraded plans only have access to the small models.
  if (largeModel && !isUpgraded(plan)) {
    return false;
  }

  // Second check: if we have a model-specific override rule, we honor it.
  if (availableIfOneOf) {
    const { creditPricedPlan, plansWithAdvancedModels, featureFlag } =
      availableIfOneOf;

    const passesCreditPlanCondition =
      creditPricedPlan === true &&
      plan !== null &&
      isCreditPricedPlanPrefix(plan.code);

    const passesAdvancedModelCondition =
      plansWithAdvancedModels === true && plan?.hasAdvancedModelAccess === true;

    const passesFeatureFlagCondition =
      featureFlag !== undefined && featureFlags.includes(featureFlag);

    return (
      passesCreditPlanCondition ||
      passesAdvancedModelCondition ||
      passesFeatureFlagCondition
    );
  }

  // If there's no override and no downgraded-plan restriction, the model is allowed.
  return true;
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
  const hasAccess = checkModelSpecificAccessRules(m, {
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
