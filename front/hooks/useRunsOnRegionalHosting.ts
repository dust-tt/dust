import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { usesCustomerCredentials } from "@app/lib/plans/plan_gateway";
import { isCreditPricedPlan } from "@app/types/plan";

/**
 * @cc [owner:Nils-Fedrigo,label:product] regional-hosting-mirrors-endpoint-filter
 * The client-side answer to "does this workspace run models on Dust-managed
 * regional hosting?". It mirrors `EU_AGENT_PLATFORM_ENDPOINT_FILTER`, which
 * every `*_eu_agent_platform` endpoint declares — change both together, and see
 * that constant for why provider-hosted EU endpoints are out of scope. BYOK and
 * gateway plans are excluded whatever the flag says: their models run on the
 * customer's own keys, not on our regional hosting.
 */
export function useRunsOnRegionalHosting(): boolean {
  const { subscription } = useAuth();
  const { hasFeature } = useFeatureFlags();

  if (usesCustomerCredentials(subscription.plan)) {
    return false;
  }

  return (
    hasFeature("use_vertex_for_supported_models") ||
    isCreditPricedPlan(subscription.plan)
  );
}
