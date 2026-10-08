import type { PlanType } from "@app/types/plan";

type PlanCredentialsSource = Pick<PlanType, "isByok" | "gateway">;

/**
 * @cc [owner:pmilliotte,label:security;product] customer-credentials-plans
 * MUST return true for every plan whose model calls are paid with credentials the customer owns: a
 * BYOK plan (`isByok`) and any plan routed through an AI gateway (`gateway` not null). Callers use
 * it to keep Dust-managed provider keys and Dust-hosted inference away from those workspaces.
 */
export function usesCustomerCredentials(plan: PlanCredentialsSource): boolean {
  return plan.isByok || plan.gateway !== null;
}
