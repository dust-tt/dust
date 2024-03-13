import type { SubscriptionType } from "@dust-tt/types";

const TRIAL_LIMITS = {
  maxMessages: 50,
};

export function isTrial(subscription: SubscriptionType) {
  return subscription.status === "trialing";
}

export function getTrialLimits() {
  return TRIAL_LIMITS;
}
