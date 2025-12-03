import type Stripe from "stripe";

import type { Authenticator } from "@app/lib/auth";
import {
  countEligibleUsersForFreeCredits,
  getCustomerStatus,
} from "@app/lib/credits/free";
import { isEnterpriseSubscription } from "@app/lib/plans/stripe";

// $50 per user per month for Pro subscriptions.
const MAX_PRO_CREDIT_PER_USER_CENTS = 5000;
// $1000 absolute cap for Pro subscriptions.
const MAX_PRO_CREDIT_TOTAL_CENTS = 100_000;
// $1000 cap for Enterprise subscriptions.
const MAX_ENTERPRISE_CREDIT_CENTS = 100_000;

export type CreditPurchaseLimits =
  | { canPurchase: false; reason: "trialing" }
  | { canPurchase: true; maxAmountCents: number };

/**
 * Computes the maximum amount of credits a workspace can purchase.
 *
 * Rules:
 * - Pro in trial: cannot purchase credits
 * - Pro paying: $50/user/month, capped at $1000
 * - Enterprise: $1000
 */
export async function getCreditPurchaseLimits(
  auth: Authenticator,
  stripeSubscription: Stripe.Subscription
): Promise<CreditPurchaseLimits> {
  const isEnterprise = isEnterpriseSubscription(stripeSubscription);

  if (isEnterprise) {
    return {
      canPurchase: true,
      maxAmountCents: MAX_ENTERPRISE_CREDIT_CENTS,
    };
  }

  // For Pro subscriptions, check if they're paying or trialing.
  const customerStatus = await getCustomerStatus(stripeSubscription);

  if (customerStatus !== "paying") {
    return {
      canPurchase: false,
      reason: "trialing",
    };
  }

  // Pro paying: $50/user/month, capped at $1000.
  const workspace = auth.getNonNullableWorkspace();
  const userCount = await countEligibleUsersForFreeCredits(workspace);
  const maxAmountCents = Math.min(
    userCount * MAX_PRO_CREDIT_PER_USER_CENTS,
    MAX_PRO_CREDIT_TOTAL_CENTS
  );

  return {
    canPurchase: true,
    maxAmountCents,
  };
}
