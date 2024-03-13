import type { SubscriptionType } from "@dust-tt/types";

import type { Plan, Subscription } from "@app/lib/models";
import type { PlanAttributes } from "@app/lib/plans/free_plans";

// These limits are applied to all plans during the trial period.
const TRIAL_LIMITS: Partial<PlanAttributes> = {
  maxUsersInWorkspace: 5,
};

export function getTrialVersionForPlan(plan: Plan): PlanAttributes {
  return {
    ...plan.get(),
    ...TRIAL_LIMITS,
  };
}

export function isTrial(subscription: SubscriptionType | Subscription) {
  return subscription.status === "trialing";
}
