import type { PlanAttributes } from "@app/lib/resources/plan_resource";

// These limits are applied to all plans during the trial period.
export const TRIAL_LIMITS: Partial<PlanAttributes> = {
  maxUsersInWorkspace: 5,
  maxMessages: 100,
  maxMessagesTimeframe: "day",
};
