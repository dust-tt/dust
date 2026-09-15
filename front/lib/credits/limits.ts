import type { Authenticator } from "@app/lib/auth";
import { getCustomerPaymentStatus } from "@app/lib/credits/free";
import { getBillingCycleFromDay } from "@app/lib/plans/billing_cycle";
import { isEnterprisePlanPrefix } from "@app/lib/plans/plan_codes";
import { isEnterpriseSubscription } from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import type { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import type Stripe from "stripe";

// $5000 flat cap per billing cycle for Pro subscriptions.
const MAX_PRO_CREDIT_TOTAL_MICRO_USD = 5_000_000_000;
// $5000 minimum cap for Enterprise subscriptions.
const MIN_ENTERPRISE_CREDIT_MICRO_USD = 5_000_000_000;

export type CreditPurchaseLimits =
  | {
      canPurchase: false;
      reason: "trialing" | "payment_issue" | "pending_payment";
    }
  | { canPurchase: true; maxAmountMicroUsd: number };

// Where the workspace is billed from. Drives Enterprise detection, the
// billing-cycle bounds, and the Stripe-only trial / payment-issue guard.
type CreditPurchaseLimitsContext =
  | { type: "stripe-subscription"; stripeSubscription: Stripe.Subscription }
  | { type: "metronome"; subscription: SubscriptionResource };

/**
 * Computes the maximum amount of credits a workspace can purchase in the
 * current billing cycle.
 *
 * Rules:
 * - Pro in trial: cannot purchase credits (Stripe-billed only)
 * - Pro with payment issues: cannot purchase credits (Stripe-billed only)
 * - Pro paying: flat $5000 per billing cycle
 * - Enterprise: max($5000, half of pay-as-you-go cap) per billing cycle
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
    //  - Stripe-billed (legacy programmatic): max($5000, half of PAYG cap)
    //    derived from `programmatic_usage_configuration.paygCapMicroUsd`.
    //  - Metronome (credit-priced): flat $5000 floor. The credit-config PAYG
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

  // Pro paying: flat $5000 per billing cycle.
  const alreadyPurchased =
    await CreditResource.sumCommittedCreditsPurchasedInPeriod(
      auth,
      cycleStart,
      cycleEnd
    );

  return {
    canPurchase: true,
    maxAmountMicroUsd: Math.max(
      0,
      MAX_PRO_CREDIT_TOTAL_MICRO_USD - alreadyPurchased
    ),
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
