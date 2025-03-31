import type { PlanAttributes } from "@app/lib/plans/free_plans";
import type { PlanModel, Subscription } from "@app/lib/resources/storage/models/plans";
import type { SubscriptionType } from "@app/types";
// These limits are applied to all plans during the trial period.
const TRIAL_LIMITS: Partial<PlanAttributes> = {
  maxUsersInWorkspace: 5,
  maxMessages: 100,
  maxMessagesTimeframe: "day",
};

export function getTrialVersionForPlan(plan: PlanModel): PlanAttributes {
  return {
    ...plan.get(),
    ...TRIAL_LIMITS,
  };
}

export function isTrial(
  subscription: SubscriptionType | Subscription
): boolean {
  return subscription.trialing === true;
}
