import type { SubscriptionType } from "@dust-tt/types";

const TRIAL_LIMITS = {
  maxUsersInWorkspace: 5,
};

export function isTrial(subscription: SubscriptionType) {
  return subscription.status === "trialing";
}

export function getTrialLimits() {
  return TRIAL_LIMITS;
}
