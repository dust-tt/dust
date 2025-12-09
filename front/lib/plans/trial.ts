import type { PlanModel, SubscriptionModel } from "@app/lib/models/planModel";
import type { PlanAttributes } from "@app/lib/plans/free_plans";
import type { SubscriptionType } from "@app/types";

// These limits are applied to all plans during the trial period.
const TRIAL_LIMITS: Partial<PlanAttributes> = {
  maxUsersInWorkspace: 5,
  maxMessages: 100,
  maxMessagesTimeframe: "day",
  maxImagesPerWeek: 50,
};

export function getTrialVersionForPlan(plan: PlanModel): PlanAttributes {
  return {
    ...plan.get(),
    ...TRIAL_LIMITS,
  };
}

export function isTrial(
  subscription: SubscriptionType | SubscriptionModel
): boolean {
  return subscription.trialing === true;
}
