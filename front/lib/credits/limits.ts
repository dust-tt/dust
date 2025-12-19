import type Stripe from "stripe";

import type { Authenticator } from "@app/lib/auth";
import { countEligibleUsersForCredits } from "@app/lib/credits/common";
import { getCustomerPaymentStatus } from "@app/lib/credits/free";
import { isEnterpriseSubscription } from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";

// $50 per user per month for Pro subscriptions.
const MAX_PRO_CREDIT_PER_USER_MICRO_USD = 50_000_000;
// $1000 absolute cap for Pro subscriptions.
const MAX_PRO_CREDIT_TOTAL_MICRO_USD = 1_000_000_000;
// $1000 minimum cap for Enterprise subscriptions.
const MIN_ENTERPRISE_CREDIT_MICRO_USD = 1_000_000_000;

export type CreditPurchaseLimits =
  | {
      canPurchase: false;
      reason: "trialing" | "payment_issue" | "pending_payment";
    }
  | { canPurchase: true; maxAmountMicroUsd: number };

/**
 * Computes the maximum amount of credits a workspace can purchase in the
 * current billing cycle.
 *
 * Rules:
 * - Pro in trial: cannot purchase credits
 * - Pro with payment issues: cannot purchase credits
 * - Pro paying: $50/user/month, capped at $1000 per billing cycle
 * - Enterprise: max($1000, half of pay-as-you-go cap) per billing cycle
 *
 * The limits are per billing cycle. Already purchased committed credits
 * in the current billing cycle are subtracted from the maximum.
 */
export async function getCreditPurchaseLimits(
  auth: Authenticator,
  stripeSubscription: Stripe.Subscription
): Promise<CreditPurchaseLimits> {
  const isEnterprise = isEnterpriseSubscription(stripeSubscription);

  if (isEnterprise) {
    // Enterprise limit: max($1000, half of pay-as-you-go cap).
    const programmaticConfig =
      await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
    const paygCapMicroUsd = programmaticConfig?.paygCapMicroUsd ?? 0;
    const enterpriseMaxMicroUsd = Math.max(
      MIN_ENTERPRISE_CREDIT_MICRO_USD,
      Math.floor(paygCapMicroUsd / 2)
    );

    const alreadyPurchased = await getAlreadyPurchasedInCycle(
      auth,
      stripeSubscription
    );
    const remainingMicroUsd = Math.max(
      0,
      enterpriseMaxMicroUsd - alreadyPurchased
    );
    return {
      canPurchase: true,
      maxAmountMicroUsd: remainingMicroUsd,
    };
  }

  // For Pro subscriptions, check if they're paying or trialing.
  const customerStatus = await getCustomerPaymentStatus(stripeSubscription);

  if (customerStatus === "trialing") {
    return {
      canPurchase: false,
      reason: "trialing",
    };
  }

  if (customerStatus === "not_paying") {
    return {
      canPurchase: false,
      reason: "payment_issue",
    };
  }

  // Check for any pending committed credits first
  const pendingCredits = await CreditResource.listPendingCommitted(auth);
  if (pendingCredits.length > 0) {
    return {
      canPurchase: false,
      reason: "pending_payment",
    };
  }

  // Pro paying: $50/user/month, capped at $1000 per billing cycle.
  const workspace = auth.getNonNullableWorkspace();
  const userCount = await countEligibleUsersForCredits(workspace);
  const cycleMaxMicroUsd = Math.min(
    userCount * MAX_PRO_CREDIT_PER_USER_MICRO_USD,
    MAX_PRO_CREDIT_TOTAL_MICRO_USD
  );

  const alreadyPurchased = await getAlreadyPurchasedInCycle(
    auth,
    stripeSubscription
  );
  const remainingMicroUsd = Math.max(0, cycleMaxMicroUsd - alreadyPurchased);

  return {
    canPurchase: true,
    maxAmountMicroUsd: remainingMicroUsd,
  };
}

/**
 * Gets the total amount of committed credits already purchased in the current
 * billing cycle.
 */
async function getAlreadyPurchasedInCycle(
  auth: Authenticator,
  stripeSubscription: Stripe.Subscription
): Promise<number> {
  const periodStart = new Date(stripeSubscription.current_period_start * 1000);
  const periodEnd = new Date(stripeSubscription.current_period_end * 1000);

  return CreditResource.sumCommittedCreditsPurchasedInPeriod(
    auth,
    periodStart,
    periodEnd
  );
}
