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

// killed means the model has an incident
export type ModelEnablementStatus =
  | { status: "enabled" }
  | { status: "killed" }
  | { status: "provider_not_whitelisted" }
  | { status: "not_available" };

export type ModelEnablementContext = {
  featureFlags: WhitelistableFeature[];
  plan: PlanType | null;
  regionalModelsOnly: boolean;
  region: RegionType;
  whitelistedProviders: Set<ModelProviderIdType>;
  killedModelIds: ReadonlySet<string>;
};

export function getModelEnablementStatus(
  m: ModelConfigurationType,
  {
    featureFlags,
    plan,
    regionalModelsOnly,
    region,
    whitelistedProviders,
    killedModelIds,
  }: ModelEnablementContext
): ModelEnablementStatus {
  if (
    !isModelAvailable(m, { featureFlags, plan, regionalModelsOnly, region })
  ) {
    return { status: "not_available" };
  }

  if (!isProviderWhitelisted(whitelistedProviders, m.providerId)) {
    return { status: "provider_not_whitelisted" };
  }

  if (killedModelIds.has(m.modelId)) {
    return { status: "killed" };
  }

  return { status: "enabled" };
}

/**
 * Returns true if the model can run for the workspace right now.
 *
 * A killed model is not enabled: kills take it out of every path, so nothing
 * ever routes onto one automatically. Use `filterAvailableModels` for the
 * surfaces that must still show it as unavailable rather than hide it.
 */
export function isModelEnabled(
  m: ModelConfigurationType,
  context: ModelEnablementContext
) {
  return getModelEnablementStatus(m, context).status === "enabled";
}

/**
 * The models a workspace may see: the ones it can run, plus the killed ones.
 */
export function filterAvailableModels(
  models: ModelConfigurationType[],
  context: ModelEnablementContext
): ModelConfigurationType[] {
  return models.filter((m) => {
    const { status } = getModelEnablementStatus(m, context);

    return status === "enabled" || status === "killed";
  });
}
