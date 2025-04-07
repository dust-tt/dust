import type { Subscription } from "@app/lib/resources/storage/models/plans";
import type { SubscriptionType } from "@app/types";

export function isTrial(
  subscription: SubscriptionType | Subscription
): boolean {
  return subscription.trialing === true;
}
