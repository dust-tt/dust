import type { Authenticator } from "@app/lib/auth";
import { getBillingCycle } from "@app/lib/client/subscription";
import {
  addPaymentGatedCommitToContract,
  getMetronomeCustomerStripeCustomerId,
} from "@app/lib/metronome/client";
import {
  AWU_PRIORITY_PURCHASED_COMMIT,
  CURRENCY_TO_CREDIT_TYPE_ID,
  getCreditTypeAwuId,
  getProductPrepaidCommitId,
} from "@app/lib/metronome/constants";
import { getCreditTypeFromContract } from "@app/lib/metronome/coupons";
import { getActiveContract, isLegacyPlan } from "@app/lib/metronome/plan_type";
import { AWU_PRICE_PER_CREDIT } from "@app/lib/metronome/types";
import { getStripeClient } from "@app/lib/plans/stripe";
import logger from "@app/logger/logger";
import type { SupportedCurrency } from "@app/types/currency";
import { isSubscriptionMetronomeBilled } from "@app/types/plan";
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
  amountCredits: number;
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

  const { metronomeCustomerId } = workspace;

  if (
    !subscription ||
    !metronomeCustomerId ||
    isSubscriptionMetronomeBilled(subscription)
  ) {
    return new Err({ code: "not_metronome_billed" });
  }

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
  const currency = currencyResult.value;

  // Metronome wants invoice unit prices in the credit type's units: cents
  // for USD, whole units for EUR (matches the rate-card convention; see
  // `metronomeAmount`). AWU_PRICE_PER_CREDIT is per-credit in the
  // currency's natural unit ($0.01 / €0.0087):
  //   USD: 0.01 USD * 100 = 1 cent per credit
  //   EUR: 0.0087 EUR per credit (Metronome allows decimal unit prices)
  const invoiceUnitPrice =
    currency === "usd"
      ? AWU_PRICE_PER_CREDIT.usd * 100
      : AWU_PRICE_PER_CREDIT.eur;

  const now = new Date();
  const oneYearFromNow = new Date(now);
  oneYearFromNow.setUTCFullYear(oneYearFromNow.getUTCFullYear() + 1);

  const editResult = await addPaymentGatedCommitToContract({
    metronomeCustomerId,
    metronomeContractId,
    productId: getProductPrepaidCommitId(),
    accessAmount: amountCredits,
    accessCreditTypeId: getCreditTypeAwuId(),
    accessStartingAt: now,
    accessEndingBefore: oneYearFromNow,
    invoiceUnitPrice,
    invoiceQuantity: amountCredits,
    invoiceCreditTypeId: CURRENCY_TO_CREDIT_TYPE_ID[currency],
    invoiceTimestamp: now,
    priority: AWU_PRIORITY_PURCHASED_COMMIT,
    name: `Credit top-up: ${amountCredits.toLocaleString()} credits`,
    uniquenessKey: `awuPurchase-${workspace.sId}-${now.getTime()}`,
    // Stamped on the Stripe invoice Metronome pushes downstream so the
    // existing eligibility check (`isAwuPurchaseInvoice`) still recognises
    // pending AWU purchases.
    stripeInvoiceMetadata: {
      awu_purchase: "true",
      awu_amount_credits: String(amountCredits),
      workspace_id: workspace.sId,
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
    },
    "[AWU Purchase] Payment-gated commit created — Metronome will invoice and unlock on payment"
  );

  return new Ok({ amountCredits });
}
