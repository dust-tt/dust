import type { Authenticator } from "@app/lib/auth";
import { getBillingCycle } from "@app/lib/client/subscription";
import {
  computeAwuInvoiceUnitPrice,
  resolveAwuPurchaseCurrency,
  resolveAwuPurchaseDiscountPercent,
} from "@app/lib/credits/awu_pricing";
import {
  recordAwuPurchaseAttemptSyncFailure,
  setAwuPurchaseAttemptPending,
} from "@app/lib/credits/awu_purchase_status";
import {
  addPaymentGatedCommitToContract,
  floorToHourISO,
  getMetronomeCustomerStripeCustomerId,
} from "@app/lib/metronome/client";
import {
  AWU_PRIORITY_PURCHASED_COMMIT,
  CARRY_ON_RENEWAL_CUSTOM_FIELD_KEY,
  CURRENCY_TO_CREDIT_TYPE_ID,
  getCreditTypeAwuId,
  getProductPrepaidCommitId,
  oneYearAfter,
} from "@app/lib/metronome/constants";
import { USAGE_TAG } from "@app/lib/metronome/setup_common";
import { isEnterprisePlanPrefix } from "@app/lib/plans/plan_codes";
import { getStripeClient } from "@app/lib/plans/stripe";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import logger from "@app/logger/logger";
import type { SupportedCurrency } from "@app/types/currency";
import {
  isCreditPricedPlan,
  isSubscriptionMetronomeBilled,
} from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type Stripe from "stripe";
import {
  MAX_AWU_PURCHASE_CREDITS_PER_CYCLE,
  MIN_AWU_PURCHASE_CREDITS,
} from "./awu_purchase_constants";

export type AwuPurchaseInfo =
  | {
      canPurchase: false;
      reason:
        | "not_metronome_billed"
        | "legacy_plan"
        | "enterprise_plan"
        | "no_stripe_customer"
        | "pending_purchase";
    }
  | {
      canPurchase: true;
      remainingCycleCredits: number;
      currency: SupportedCurrency;
      discountPercent: number;
      paymentMethod:
        | { type: "card"; brand: string; last4: string }
        | { type: "sepa_debit"; last4: string }
        | null;
    };

export type AwuPurchaseResult = {
  amountCredits: number;
};

export type GetAwuPurchaseInfoResponseBody = AwuPurchaseInfo;

export type PostAwuPurchaseResponseBody = {
  amountCredits: number;
};

export type AwuPurchaseError =
  | { code: "not_metronome_billed" }
  | { code: "legacy_plan" }
  | { code: "enterprise_plan" }
  | { code: "no_stripe_customer" }
  | { code: "pending_purchase" }
  | { code: "invalid_amount"; message: string }
  | { code: "purchase_failed"; message: string };

type AwuEligibilityErrorCode = Extract<
  AwuPurchaseInfo,
  { canPurchase: false }
>["reason"];

type AwuEligibilityOk = {
  metronomeCustomerId: string;
  stripeCustomerId: string;
  stripe: Stripe;
};

function getAwuPurchasedCreditsFromInvoice(invoice: Stripe.Invoice): number {
  if (invoice.metadata?.awu_purchase !== "true") {
    return 0;
  }

  const amountCreditsString = invoice.metadata?.awu_amount_credits;
  if (!amountCreditsString) {
    return 0;
  }

  const amountCredits = Number.parseInt(amountCreditsString, 10);
  if (!Number.isFinite(amountCredits)) {
    return 0;
  }

  return amountCredits;
}

async function checkAwuPurchaseEligibility(
  auth: Authenticator
): Promise<Result<AwuEligibilityOk, { code: AwuEligibilityErrorCode }>> {
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();

  const { metronomeCustomerId } = workspace;

  if (
    !subscription ||
    !metronomeCustomerId ||
    !isSubscriptionMetronomeBilled(subscription)
  ) {
    return new Err({ code: "not_metronome_billed" });
  }

  if (!isCreditPricedPlan(subscription.plan)) {
    return new Err({ code: "legacy_plan" });
  }

  if (isEnterprisePlanPrefix(subscription.plan.code)) {
    const config =
      await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
    if (!config?.topUpEnabled) {
      return new Err({ code: "enterprise_plan" });
    }
  }

  const stripeCustomerResult =
    await getMetronomeCustomerStripeCustomerId(metronomeCustomerId);
  if (stripeCustomerResult.isErr() || !stripeCustomerResult.value) {
    return new Err({ code: "no_stripe_customer" });
  }
  const stripeCustomerId = stripeCustomerResult.value;

  const stripe = getStripeClient();
  const openInvoices = await stripe.invoices.list({
    customer: stripeCustomerId,
    status: "open",
  });
  const hasPending = openInvoices.data.some(
    (inv) => inv.metadata?.awu_purchase === "true"
  );
  if (hasPending) {
    return new Err({ code: "pending_purchase" });
  }

  return new Ok({ metronomeCustomerId, stripeCustomerId, stripe });
}

export async function getAwuPurchaseInfo(
  auth: Authenticator
): Promise<AwuPurchaseInfo> {
  const eligibility = await checkAwuPurchaseEligibility(auth);
  if (eligibility.isErr()) {
    return { canPurchase: false, reason: eligibility.error.code };
  }

  const { stripeCustomerId, stripe } = eligibility.value;
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.subscription()!;

  const currencyResult = await resolveAwuPurchaseCurrency(workspace.sId);
  if (currencyResult.isErr()) {
    logger.error(
      { workspaceId: workspace.sId, error: currencyResult.error.message },
      "[AWU Purchase] Failed to resolve currency"
    );
    return { canPurchase: false, reason: "no_stripe_customer" };
  }
  const currency = currencyResult.value;

  const discountPercent = await resolveAwuPurchaseDiscountPercent(auth);

  // Fetch default payment method for display.
  let paymentMethod:
    | { type: "card"; brand: string; last4: string }
    | { type: "sepa_debit"; last4: string }
    | null = null;
  try {
    const customer = await stripe.customers.retrieve(stripeCustomerId, {
      expand: ["invoice_settings.default_payment_method"],
    });
    if (!("deleted" in customer)) {
      const pmRaw = customer.invoice_settings?.default_payment_method;
      const pm: Stripe.PaymentMethod | null =
        pmRaw && typeof pmRaw !== "string" ? pmRaw : null;
      if (pm?.type === "card" && pm.card) {
        paymentMethod = {
          type: "card",
          brand: pm.card.brand ?? "unknown",
          last4: pm.card.last4 ?? "",
        };
      } else if (pm?.type === "sepa_debit" && pm.sepa_debit) {
        paymentMethod = {
          type: "sepa_debit",
          last4: pm.sepa_debit.last4 ?? "",
        };
      }
    }
  } catch {
    // Non-fatal — display without payment method info.
  }

  const billingCycle = getBillingCycle(subscription.startDate);
  if (!billingCycle) {
    return {
      canPurchase: true,
      remainingCycleCredits: MAX_AWU_PURCHASE_CREDITS_PER_CYCLE,
      currency,
      discountPercent,
      paymentMethod,
    };
  }

  const cycleStartSeconds = Math.floor(
    billingCycle.cycleStart.getTime() / 1000
  );
  const paidInvoices = await stripe.invoices.list({
    customer: stripeCustomerId,
    status: "paid",
    created: { gte: cycleStartSeconds },
  });
  const alreadyPurchasedThisCycleCredits = paidInvoices.data.reduce(
    (sum, inv) => sum + getAwuPurchasedCreditsFromInvoice(inv),
    0
  );

  return {
    canPurchase: true,
    remainingCycleCredits: Math.max(
      0,
      MAX_AWU_PURCHASE_CREDITS_PER_CYCLE - alreadyPurchasedThisCycleCredits
    ),
    currency,
    discountPercent,
    paymentMethod,
  };
}

export async function purchaseAwuCredits(
  auth: Authenticator,
  { amountCredits }: { amountCredits: number }
): Promise<Result<AwuPurchaseResult, AwuPurchaseError>> {
  const eligibility = await checkAwuPurchaseEligibility(auth);
  if (eligibility.isErr()) {
    return new Err({ code: eligibility.error.code });
  }

  const { metronomeCustomerId, stripeCustomerId, stripe } = eligibility.value;
  const workspace = auth.getNonNullableWorkspace();
  // checkAwuPurchaseEligibility already verified both are set.
  const subscription = auth.subscription()!;
  const metronomeContractId = subscription.metronomeContractId!;

  if (amountCredits < MIN_AWU_PURCHASE_CREDITS) {
    return new Err({
      code: "invalid_amount",
      message: `Minimum purchase is ${MIN_AWU_PURCHASE_CREDITS.toLocaleString()} credits.`,
    });
  }

  const billingCycle = getBillingCycle(subscription.startDate);
  if (!billingCycle) {
    return new Err({
      code: "invalid_amount",
      message: "Could not determine billing cycle from subscription start date",
    });
  }
  const cycleStartSeconds = Math.floor(
    billingCycle.cycleStart.getTime() / 1000
  );
  const paidInvoices = await stripe.invoices.list({
    customer: stripeCustomerId,
    status: "paid",
    created: { gte: cycleStartSeconds },
  });
  const alreadyPurchasedThisCycleCredits = paidInvoices.data.reduce(
    (sum, inv) => sum + getAwuPurchasedCreditsFromInvoice(inv),
    0
  );

  const remaining =
    MAX_AWU_PURCHASE_CREDITS_PER_CYCLE - alreadyPurchasedThisCycleCredits;
  if (amountCredits > remaining) {
    return new Err({
      code: "invalid_amount",
      message: `Purchase would exceed the cycle limit. You can purchase up to ${remaining.toLocaleString()} more credits this cycle.`,
    });
  }

  const currencyResult = await resolveAwuPurchaseCurrency(workspace.sId);
  if (currencyResult.isErr()) {
    logger.error(
      { workspaceId: workspace.sId, error: currencyResult.error.message },
      "[AWU Purchase] Failed to resolve currency"
    );
    return new Err({
      code: "purchase_failed",
      message: currencyResult.error.message,
    });
  }
  const currency = currencyResult.value;

  const discountPercent = await resolveAwuPurchaseDiscountPercent(auth);

  const invoiceUnitPrice = computeAwuInvoiceUnitPrice({
    amountCredits,
    currency,
    discountPercent,
  });

  const now = new Date();

  const uniquenessKey = `awuPurchase-${workspace.sId}-${now.getTime()}`;

  // Record the attempt as pending BEFORE calling Metronome so the
  // `payment_gate.payment_status` webhook can update it on arrival —
  // the webhook can race ahead of this function returning.
  await setAwuPurchaseAttemptPending({
    workspaceId: workspace.sId,
    contractId: metronomeContractId,
    uniquenessKey,
    amountCredits,
  });

  const accessEndingBefore = oneYearAfter(now);

  const editResult = await addPaymentGatedCommitToContract({
    metronomeCustomerId,
    metronomeContractId,
    productId: getProductPrepaidCommitId(),
    accessAmount: amountCredits,
    accessCreditTypeId: getCreditTypeAwuId(),
    accessStartingAt: now,
    accessEndingBefore,
    invoiceUnitPrice,
    invoiceQuantity: 1,
    invoiceCreditTypeId: CURRENCY_TO_CREDIT_TYPE_ID[currency],
    invoiceTimestamp: now,
    priority: AWU_PRIORITY_PURCHASED_COMMIT,
    applicableProducTags: [USAGE_TAG],
    name:
      discountPercent > 0
        ? `Credit top-up: ${amountCredits.toLocaleString()} credits (${discountPercent}% discount)`
        : `Credit top-up: ${amountCredits.toLocaleString()} credits`,
    uniquenessKey,
    customFields: {
      [CARRY_ON_RENEWAL_CUSTOM_FIELD_KEY]: floorToHourISO(accessEndingBefore),
    },
    // Stamped on the Stripe invoice Metronome pushes downstream so the
    // existing eligibility check (`isAwuPurchaseInvoice`) still recognises
    // pending AWU purchases.
    stripeInvoiceMetadata: {
      awu_purchase: "true",
      awu_amount_credits: String(amountCredits),
      workspace_id: workspace.sId,
      ...(discountPercent > 0
        ? { awu_discount_percent: String(discountPercent) }
        : {}),
    },
  });

  if (editResult.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        amountCredits,
        error: editResult.error.message,
      },
      "[AWU Purchase] Failed to add payment-gated commit"
    );
    // No webhook will fire for an edit that never landed in Metronome —
    // flip the attempt to failed so the UI can show the error immediately.
    await recordAwuPurchaseAttemptSyncFailure({
      workspaceId: workspace.sId,
      errorMessage: editResult.error.message,
    });
    return new Err({
      code: "purchase_failed",
      message: editResult.error.message,
    });
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      editId: editResult.value.editId,
      amountCredits,
      discountPercent,
      invoiceUnitPrice,
      currency,
    },
    "[AWU Purchase] Payment-gated commit created — Metronome will invoice and unlock on payment"
  );

  return new Ok({ amountCredits });
}
