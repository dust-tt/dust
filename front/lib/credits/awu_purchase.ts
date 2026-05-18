import type { Authenticator } from "@app/lib/auth";
import { getBillingCycle } from "@app/lib/client/subscription";
import {
  createMetronomeCredit,
  getMetronomeCustomerStripeCustomerId,
} from "@app/lib/metronome/client";
import {
  AWU_PRIORITY_PURCHASED_COMMIT,
  getCreditTypeAwuId,
  getProductPrepaidCommitId,
} from "@app/lib/metronome/constants";
import { getCreditTypeFromContract } from "@app/lib/metronome/coupons";
import { getActiveContract, isLegacyPlan } from "@app/lib/metronome/plan_type";
import {
  finalizeInvoice,
  getStripeClient,
  makeAwuPurchaseInvoiceForCustomer,
  payInvoice,
} from "@app/lib/plans/stripe";
import logger from "@app/logger/logger";
import type { SupportedCurrency } from "@app/types/currency";
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
        | "no_stripe_customer"
        | "pending_purchase";
    }
  | {
      canPurchase: true;
      remainingCycleCredits: number;
      currency: SupportedCurrency;
    };

export type AwuPurchaseResult = {
  invoiceId: string;
  amountCredits: number;
  amountCents: number;
  paymentUrl: string | null;
};

export type AwuPurchaseError =
  | { code: "not_metronome_billed" }
  | { code: "legacy_plan" }
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

/**
 * Resolves the billing currency from the active Metronome contract's rate
 * card — the source of truth for Metronome-billed workspaces. The Stripe
 * customer's `currency` field is unreliable (only set after the first paid
 * invoice) and its `address.country` may not be populated, so deriving
 * currency from the contract guarantees the invoice matches what Metronome
 * is configured to bill.
 */
async function resolveAwuPurchaseCurrency(
  workspaceId: string
): Promise<Result<SupportedCurrency, Error>> {
  const contract = await getActiveContract(workspaceId);
  if (!contract) {
    return new Err(new Error("No active Metronome contract found"));
  }
  const creditTypeResult = await getCreditTypeFromContract(contract);
  if (creditTypeResult.isErr()) {
    return new Err(creditTypeResult.error);
  }
  return new Ok(creditTypeResult.value.currency);
}

async function checkAwuPurchaseEligibility(
  auth: Authenticator
): Promise<Result<AwuEligibilityOk, { code: AwuEligibilityErrorCode }>> {
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();

  if (!subscription?.metronomeContractId || !workspace.metronomeCustomerId) {
    return new Err({ code: "not_metronome_billed" });
  }

  const { metronomeCustomerId } = workspace;

  const onLegacyPlan = await isLegacyPlan(workspace.sId);
  if (onLegacyPlan) {
    return new Err({ code: "legacy_plan" });
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

  const billingCycle = getBillingCycle(subscription.startDate);
  if (!billingCycle) {
    return {
      canPurchase: true,
      remainingCycleCredits: MAX_AWU_PURCHASE_CREDITS_PER_CYCLE,
      currency,
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
  const alreadyPurchasedThisCycleCredits = paidInvoices.data
    .filter((inv) => inv.metadata?.awu_purchase === "true")
    .reduce((sum, inv) => sum + (inv.amount_paid ?? 0), 0);

  return {
    canPurchase: true,
    remainingCycleCredits: Math.max(
      0,
      MAX_AWU_PURCHASE_CREDITS_PER_CYCLE - alreadyPurchasedThisCycleCredits
    ),
    currency,
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

  const { stripeCustomerId, stripe } = eligibility.value;
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.subscription()!;

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
  const alreadyPurchasedThisCycleCredits = paidInvoices.data
    .filter((inv) => inv.metadata?.awu_purchase === "true")
    .reduce((sum, inv) => sum + (inv.amount_paid ?? 0), 0);

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

  const invoiceResult = await makeAwuPurchaseInvoiceForCustomer({
    stripeCustomerId,
    workspaceId: workspace.sId,
    currency: currencyResult.value,
    amountCredits,
  });
  if (invoiceResult.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        amountCredits,
        error: invoiceResult.error.error_message,
      },
      "[AWU Purchase] Failed to create Stripe invoice"
    );
    return new Err({
      code: "purchase_failed",
      message: invoiceResult.error.error_message,
    });
  }
  const invoice = invoiceResult.value;

  const finalizeResult = await finalizeInvoice(invoice);
  if (finalizeResult.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        invoiceId: invoice.id,
        error: finalizeResult.error.error_message,
      },
      "[AWU Purchase] Failed to finalize Stripe invoice"
    );
    return new Err({
      code: "purchase_failed",
      message: finalizeResult.error.error_message,
    });
  }

  const payResult = await payInvoice(finalizeResult.value);
  if (payResult.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        invoiceId: invoice.id,
        error: payResult.error.error_message,
      },
      "[AWU Purchase] Failed to pay Stripe invoice"
    );
    return new Err({
      code: "purchase_failed",
      message: payResult.error.error_message,
    });
  }

  const { paymentUrl } = payResult.value;

  logger.info(
    {
      workspaceId: workspace.sId,
      invoiceId: invoice.id,
      amountCredits,
      requiresAction: paymentUrl !== null,
    },
    "[AWU Purchase] Invoice created and paid, credits will be granted via webhook"
  );

  return new Ok({
    invoiceId: invoice.id,
    amountCredits,
    amountCents: amountCredits,
    paymentUrl,
  });
}

/**
 * Called by the Stripe webhook (invoice.paid) to grant AWU credits in Metronome
 * once payment is confirmed.
 */
export async function grantAwuCreditsFromPaidInvoice({
  invoice,
  auth,
}: {
  invoice: Stripe.Invoice;
  auth: Authenticator;
}): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();

  const amountCreditsStr = invoice.metadata?.awu_amount_credits;
  if (!amountCreditsStr) {
    logger.error(
      { invoiceId: invoice.id, workspaceId: workspace.sId },
      "[AWU Purchase] Paid invoice missing awu_amount_credits metadata"
    );
    return;
  }
  const amountCredits = parseInt(amountCreditsStr, 10);
  if (isNaN(amountCredits) || amountCredits <= 0) {
    logger.error(
      { invoiceId: invoice.id, workspaceId: workspace.sId, amountCreditsStr },
      "[AWU Purchase] Invalid awu_amount_credits in invoice metadata"
    );
    return;
  }

  if (!workspace.metronomeCustomerId) {
    logger.error(
      { invoiceId: invoice.id, workspaceId: workspace.sId },
      "[AWU Purchase] Workspace has no Metronome customer ID"
    );
    return;
  }

  const now = new Date();
  const oneYearFromNow = new Date(now);
  oneYearFromNow.setUTCFullYear(oneYearFromNow.getUTCFullYear() + 1);

  const grantResult = await createMetronomeCredit({
    metronomeCustomerId: workspace.metronomeCustomerId,
    productId: getProductPrepaidCommitId(),
    creditTypeId: getCreditTypeAwuId(),
    amount: amountCredits,
    startingAt: now.toISOString(),
    endingBefore: oneYearFromNow.toISOString(),
    name: `AWU credit top-up: ${amountCredits.toLocaleString()} credits`,
    idempotencyKey: `awuPurchase-${workspace.sId}-${invoice.id}`,
    priority: AWU_PRIORITY_PURCHASED_COMMIT,
  });

  if (grantResult.isErr()) {
    throw new Error(
      `[AWU Purchase] Failed to grant Metronome credits: ${grantResult.error.message} (invoiceId=${invoice.id}, workspaceId=${workspace.sId}, amountCredits=${amountCredits})`
    );
  }

  logger.info(
    { invoiceId: invoice.id, workspaceId: workspace.sId, amountCredits },
    "[AWU Purchase] Successfully granted AWU credits from webhook"
  );
}
