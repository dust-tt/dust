import type { PlanType } from "@app/types/plan";

export function isSCIMEnabled(plan: PlanType): boolean {
  return plan.limits.users.isSCIMAllowed;
}
