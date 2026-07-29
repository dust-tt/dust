import type { PlanType } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export function isSCIMEnabled(
  plan: PlanType,
  featureFlags: WhitelistableFeature[]
): boolean {
  return plan.limits.users.isSCIMAllowed || featureFlags.includes("allow_scim");
}
