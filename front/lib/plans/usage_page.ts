import type { PlanType } from "@app/types/plan";
import { isCreditPricedPlan } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

// The Usage page is available to credit-priced workspaces, and to legacy-contract
// workspaces in read-only mode behind a flag.
export function isUsagePageEnabled(
  plan: PlanType,
  featureFlags: WhitelistableFeature[]
): boolean {
  return (
    isCreditPricedPlan(plan) || featureFlags.includes("usage_page_read_only")
  );
}
