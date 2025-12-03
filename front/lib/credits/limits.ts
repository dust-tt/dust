import type Stripe from "stripe";

import type { Authenticator } from "@app/lib/auth";
import {
  countEligibleUsersForFreeCredits,
  getCustomerStatus,
} from "@app/lib/credits/free";
import { isEnterpriseSubscription } from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";

// $50 per user per month for Pro subscriptions.
const MAX_PRO_CREDIT_PER_USER_CENTS = 5000;
// $1000 absolute cap for Pro subscriptions.
const MAX_PRO_CREDIT_TOTAL_CENTS = 100_000;
// $1000 cap for Enterprise subscriptions.
const MAX_ENTERPRISE_CREDIT_CENTS = 100_000;

export type CreditPurchaseLimits =
  | { canPurchase: false; reason: "trialing" | "payment_issue" }
  | { canPurchase: true; maxAmountCents: number };

/**
 * Returns the billing cycle boundaries from a Stripe subscription.
 */
function getBillingCycleBounds(stripeSubscription: Stripe.Subscription): {
  periodStart: Date;
  periodEnd: Date;
} {
  return {
    periodStart: new Date(stripeSubscription.current_period_start * 1000),
    periodEnd: new Date(stripeSubscription.current_period_end * 1000),
  };
}

/**
 * Computes the maximum amount of credits a workspace can purchase in a single
 * transaction, taking into account purchases already made in the current
 * billing cycle.
 *
 * Rules:
 * - Pro in trial: cannot purchase credits
 * - Pro paying: $50/user/month, capped at $1000 per billing cycle
 * - Enterprise: $1000 per billing cycle
 */
export async function getCreditPurchaseLimits(
  auth: Authenticator,
  stripeSubscription: Stripe.Subscription
): Promise<CreditPurchaseLimits> {
  const isEnterprise = isEnterpriseSubscription(stripeSubscription);
  const { periodStart, periodEnd } = getBillingCycleBounds(stripeSubscription);

  // Get already purchased credits in this billing cycle.
  const alreadyPurchasedCents =
    await CreditResource.sumCommittedCreditsPurchasedInPeriod(
      auth,
      periodStart,
      periodEnd
    );

  if (isEnterprise) {
    const remainingCents = Math.max(
      0,
      MAX_ENTERPRISE_CREDIT_CENTS - alreadyPurchasedCents
    );
    return {
      canPurchase: true,
      maxAmountCents: remainingCents,
    };
  }

  // For Pro subscriptions, check if they're paying or trialing.
  const customerStatus = await getCustomerStatus(stripeSubscription);

  if (customerStatus === "trialing") {
    return {
      canPurchase: false,
      reason: "trialing",
    };
  }

  if (customerStatus === null) {
    return {
      canPurchase: false,
      reason: "payment_issue",
    };
  }

  // Pro paying: $50/user/month, capped at $1000 per billing cycle.
  const workspace = auth.getNonNullableWorkspace();
  const userCount = await countEligibleUsersForFreeCredits(workspace);
  const cycleMaxCents = Math.min(
    userCount * MAX_PRO_CREDIT_PER_USER_CENTS,
    MAX_PRO_CREDIT_TOTAL_CENTS
  );
  const remainingCents = Math.max(0, cycleMaxCents - alreadyPurchasedCents);

  return {
    canPurchase: true,
    maxAmountCents: remainingCents,
  };
}
