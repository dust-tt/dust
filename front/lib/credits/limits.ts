import type { Authenticator } from "@app/lib/auth";
import { getBillingCycleFromDay } from "@app/lib/client/subscription";
import { countEligibleUsersForCredits } from "@app/lib/credits/common";
import { getCustomerPaymentStatus } from "@app/lib/credits/free";
import { isEnterprisePlanPrefix } from "@app/lib/plans/plan_codes";
import { isEnterpriseSubscription } from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import type { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import type Stripe from "stripe";

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

// Where the workspace is billed from. Drives Enterprise detection, the
// billing-cycle bounds, and the Stripe-only trial / payment-issue guard.
export type CreditPurchaseLimitsContext =
  | { type: "stripe-subscription"; stripeSubscription: Stripe.Subscription }
  | { type: "metronome"; subscription: SubscriptionResource };

/**
 * Computes the maximum amount of credits a workspace can purchase in the
 * current billing cycle.
 *
 * Rules:
 * - Pro in trial: cannot purchase credits (Stripe-billed only)
 * - Pro with payment issues: cannot purchase credits (Stripe-billed only)
 * - Pro paying: $50/user/month, capped at $1000 per billing cycle
 * - Enterprise: max($1000, half of pay-as-you-go cap) per billing cycle
 *
 * Metronome-only workspaces skip the trial / payment-issue checks (no Stripe
 * subscription state to read; payment is on Stripe N+30 dunning).
 *
 * The limits are per billing cycle. Already purchased committed credits
 * in the current billing cycle are subtracted from the maximum.
 */
export async function getCreditPurchaseLimits(
  auth: Authenticator,
  context: CreditPurchaseLimitsContext
): Promise<CreditPurchaseLimits> {
  const isEnterprise =
    context.type === "stripe-subscription"
      ? isEnterpriseSubscription(context.stripeSubscription)
      : isEnterprisePlanPrefix(context.subscription.getPlan().code);

  const { cycleStart, cycleEnd } = getCycleBounds(context);

  if (isEnterprise) {
    // Enterprise limit:
    //  - Stripe-billed (legacy programmatic): max($1000, half of PAYG cap)
    //    derived from `programmatic_usage_configuration.paygCapMicroUsd`.
    //  - Metronome (credit-priced): flat $1000 floor. The credit-config PAYG
    //    cap is in AWU credits and isn't used to gate fiat credit purchases.
    let enterpriseMaxMicroUsd = MIN_ENTERPRISE_CREDIT_MICRO_USD;
    if (context.type === "stripe-subscription") {
      const programmaticConfig =
        await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
      const paygCapMicroUsd = programmaticConfig?.paygCapMicroUsd ?? 0;
      enterpriseMaxMicroUsd = Math.max(
        MIN_ENTERPRISE_CREDIT_MICRO_USD,
        Math.floor(paygCapMicroUsd / 2)
      );
    }

    const alreadyPurchased =
      await CreditResource.sumCommittedCreditsPurchasedInPeriod(
        auth,
        cycleStart,
        cycleEnd
      );
    return {
      canPurchase: true,
      maxAmountMicroUsd: Math.max(0, enterpriseMaxMicroUsd - alreadyPurchased),
    };
  }

  // Pro path. Stripe-billed gates on Stripe customer payment status; Metronome
  // contracts don't trial and are dunned via N+30 invoices.
  if (context.type === "stripe-subscription") {
    const customerStatus = await getCustomerPaymentStatus(
      context.stripeSubscription
    );
    if (customerStatus === "trialing") {
      return { canPurchase: false, reason: "trialing" };
    }
    if (customerStatus === "not_paying") {
      return { canPurchase: false, reason: "payment_issue" };
    }
  }

  const pendingCredits = await CreditResource.listPendingCommitted(auth);
  if (pendingCredits.length > 0) {
    return { canPurchase: false, reason: "pending_payment" };
  }

  // Pro paying: $50/user/month, capped at $1000 per billing cycle.
  const workspace = auth.getNonNullableWorkspace();
  const userCount = await countEligibleUsersForCredits(workspace);
  const cycleMaxMicroUsd = Math.min(
    userCount * MAX_PRO_CREDIT_PER_USER_MICRO_USD,
    MAX_PRO_CREDIT_TOTAL_MICRO_USD
  );

  const alreadyPurchased =
    await CreditResource.sumCommittedCreditsPurchasedInPeriod(
      auth,
      cycleStart,
      cycleEnd
    );

  return {
    canPurchase: true,
    maxAmountMicroUsd: Math.max(0, cycleMaxMicroUsd - alreadyPurchased),
  };
}

function getCycleBounds(context: CreditPurchaseLimitsContext): {
  cycleStart: Date;
  cycleEnd: Date;
} {
  if (context.type === "stripe-subscription") {
    return {
      cycleStart: new Date(
        context.stripeSubscription.current_period_start * 1000
      ),
      cycleEnd: new Date(context.stripeSubscription.current_period_end * 1000),
    };
  }
  // Metronome-only: anchor to subscription.startDate's day-of-month.
  const billingCycleStartDay = new Date(
    context.subscription.startDate
  ).getUTCDate();
  return getBillingCycleFromDay(billingCycleStartDay, new Date(), true);
}
