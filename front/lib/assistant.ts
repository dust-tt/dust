import {
  isDustCompanyPlan,
  isEntreprisePlanPrefix,
} from "@app/lib/plans/plan_codes";
import { isProviderWhitelisted } from "@app/types/assistant/models/providers";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { PlanType } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { WorkspaceType } from "@app/types/user";

export function passEnterpriseAvalability(plan: PlanType | null): boolean {
  return (
    plan !== null &&
    (isEntreprisePlanPrefix(plan.code) || isDustCompanyPlan(plan.code))
  );
}

// Returns true if the model is available to the workspace for use.
export function isModelAvailable(
  m: ModelConfigurationType,
  featureFlags: WhitelistableFeature[],
  plan: PlanType | null
) {
  if (!m.availableIfUnion) {
    return true;
  }

  const { enterprise, featureFlag } = m.availableIfUnion;

  if (enterprise === true && passEnterpriseAvalability(plan)) {
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

  if (!m.customAvailableIf) {
    return true;
  }

  const { featureFlag: customAssistantFeatureFlag } = m.customAvailableIf;

  if (
    customAssistantFeatureFlag &&
    featureFlags.includes(customAssistantFeatureFlag)
  ) {
    return true;
  }

  return false;
}

// Returns true if the model is available to the workspace and is whitelisted.
export function isModelCustomAvailableAndWhitelisted(
  m: ModelConfigurationType,
  featureFlags: WhitelistableFeature[],
  plan: PlanType | null,
  owner: WorkspaceType
) {
  if (!isModelCustomAvailable(m, featureFlags, plan)) {
    return false;
  }

  return isProviderWhitelisted(owner, m.providerId);
}
