import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { isCreditPricedPlan } from "@app/types/plan";

/**
 * @cc [owner:Nils-Fedrigo,label:product] regional-hosting-mirrors-endpoint-filter
 * The client-side answer to "does this workspace run models on Dust-managed
 * regional hosting?". It mirrors the EU agent-platform endpoints' own filter
 * (`featureFlags contains use_vertex_for_supported_models` OR
 * `isCreditPriced`), so any surface claiming a hosting region must go through
 * it. Change both together. A BYOK plan is excluded whatever the flag says: its
 * models run on the customer's own provider keys, not on our regional hosting.
 */
export function useRunsOnRegionalHosting(): boolean {
  const { subscription } = useAuth();
  const { hasFeature } = useFeatureFlags();

  if (subscription.plan.isByok) {
    return false;
  }

  return (
    hasFeature("use_vertex_for_supported_models") ||
    isCreditPricedPlan(subscription.plan)
  );
}
