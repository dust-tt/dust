import type { SubscriptionType } from "@dust-tt/types";

import type { Subscription } from "@app/lib/models";
import type { PlanAttributes } from "@app/lib/plans/free_plans";
import { FREE_TEST_PLAN_DATA } from "@app/lib/plans/free_plans";
import { TRIAL_PLAN_CODE } from "@app/lib/plans/plan_codes";

export const TRIAL_PLAN_DATA: PlanAttributes = {
  ...FREE_TEST_PLAN_DATA,
  code: TRIAL_PLAN_CODE,
  name: "Trial",
  maxUsersInWorkspace: 5,
};

export function isTrial(subscription: SubscriptionType | Subscription) {
  return subscription.status === "trialing";
}
