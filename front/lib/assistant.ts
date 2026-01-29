import { isUpgraded } from "@app/lib/plans/plan_codes";
import type {
  ModelConfigurationType,
  PlanType,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";
import { isProviderWhitelisted } from "@app/types";

// Returns true if the model is available to the workspace, regardless of whether it is whitelisted or not.
export function isModelAvailable(
  m: ModelConfigurationType,
  featureFlags: WhitelistableFeature[],
  plan: PlanType | null
) {
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
