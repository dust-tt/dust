import {
  isDustCompanyPlan,
  isEntreprisePlanPrefix,
  isUpgraded,
} from "@app/lib/plans/plan_codes";
import { isProviderWhitelisted } from "@app/types/assistant/models/providers";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { PlanType } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { WorkspaceType } from "@app/types/user";

export function isEnforcedByEnterpriseAvailability(
  m: ModelConfigurationType,
  plan: PlanType | null
): boolean {
  return (
    m.enforceEnterpriseAvailability === true &&
    plan !== null &&
    (isEntreprisePlanPrefix(plan.code) || isDustCompanyPlan(plan.code))
  );
}

// Returns true if the model is available to the workspace, regardless of whether it is whitelisted or not.
export function isModelAvailable(
  m: ModelConfigurationType,
  featureFlags: WhitelistableFeature[],
  plan: PlanType | null
) {
  if (m.enforceEnterpriseAvailability === true) {
    return (
      plan &&
      (isEntreprisePlanPrefix(plan.code) || isDustCompanyPlan(plan.code))
    );
  }

  if (m.featureFlag && !featureFlags.includes(m.featureFlag)) {
    return false;
  }

  if (
    m.customAssistantFeatureFlag &&
    !featureFlags.includes(m.customAssistantFeatureFlag)
  ) {
    return false;
  }

  if (m.largeModel && !isUpgraded(plan)) {
    return false;
  }
  return true;
}

// Returns true if the model is available to the workspace and is whitelisted.
export function isModelAvailableAndWhitelisted(
  m: ModelConfigurationType,
  featureFlags: WhitelistableFeature[],
  plan: PlanType | null,
  owner: WorkspaceType
) {
  if (!isModelAvailable(m, featureFlags, plan)) {
    return false;
  }

  return isProviderWhitelisted(owner, m.providerId);
}
