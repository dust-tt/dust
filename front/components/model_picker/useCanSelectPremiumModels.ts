import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { isCreditPricedPlan } from "@app/types/plan";

// Whether the workspace's plan lets its members pick premium models (and the
// Premium tier). Legacy, non usage-based plans only get them through the
// `claude_4_5_opus_feature` flag or an advanced-model plan.
export function useCanSelectPremiumModels(): boolean {
  const { hasFeature } = useFeatureFlags();
  const { subscription } = useAuth();

  return (
    isCreditPricedPlan(subscription.plan) ||
    subscription.plan.hasAdvancedModelAccess ||
    hasFeature("claude_4_5_opus_feature")
  );
}
