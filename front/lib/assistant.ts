import type { RegionType } from "@app/lib/api/regions/config";
import {
  isDustCompanyPlan,
  isEntreprisePlanPrefix,
  isUpgraded,
} from "@app/lib/plans/plan_codes";
import { isByokProviderId } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import type { PlanType } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { WorkspaceType } from "@app/types/user";

export function isEnterpriseOrDust(plan: PlanType | null): boolean {
  return (
    plan !== null &&
    (isEntreprisePlanPrefix(plan.code) || isDustCompanyPlan(plan.code))
  );
}

// Returns true if the model is available to the workspace for build.
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
  if (m.largeModel && !isUpgraded(plan)) {
    return false;
  }

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
      isModelAvailable(m, { featureFlags, plan, owner, region }) &&
      whitelistedProviders.has(m.providerId)
  );
}
