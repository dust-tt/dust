import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { PlanType } from "@app/types/plan";
import { isCreditPricedPlan } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Client-side mirror of the server-side `hasReinforcementEnabled` gate
 * (lib/reinforcement/workspace_check.ts), without the `allowReinforcement`
 * opt-in: self-improvement (self-improving skills) is available when the
 * workspace has the `reinforced_agents` feature flag, or is billed by
 * Metronome on a credit-priced plan.
 *
 * Prefer the `useIsSelfImprovementAvailable` hook; this helper is for code
 * that runs outside the auth context provider (e.g. the navigation config).
 */
export function computeIsSelfImprovementAvailable({
  owner,
  plan,
  featureFlags,
}: {
  owner: LightWorkspaceType;
  plan: PlanType;
  featureFlags: WhitelistableFeature[];
}): boolean {
  return (
    featureFlags.includes("reinforced_agents") ||
    (owner.metronomeCustomerId !== null && isCreditPricedPlan(plan))
  );
}

export function useIsSelfImprovementAvailable(): boolean {
  const { workspace, subscription } = useAuth();
  const { featureFlags } = useFeatureFlags();
  return computeIsSelfImprovementAvailable({
    owner: workspace,
    plan: subscription.plan,
    featureFlags,
  });
}
