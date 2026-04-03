import { MAX_DISCOUNT_PERCENT } from "@app/lib/api/assistant/token_pricing";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { createMetronomeCommit } from "@app/lib/metronome/client";
import type { CustomerFacingInvoiceInfo } from "@app/lib/plans/stripe";
import {
  ENTERPRISE_N30_PAYMENTS_DAYS,
  finalizeInvoice,
  getCreditAmountFromInvoice,
  getCreditPurchaseCouponId,
  isCreditPurchaseInvoice,
  isEnterpriseSubscription,
  MAX_PRO_INVOICE_ATTEMPTS_BEFORE_VOIDED,
  makeCreditPurchaseOneOffInvoice,
  payInvoice,
  voidInvoiceWithReason,
} from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";

import { CREDIT_EXPIRATION_DAYS } from "@app/types/credits";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import type Stripe from "stripe";

export async function startCreditFromProOneOffInvoice({
  auth,
  invoice,
  stripeSubscription,
}: {
  auth: Authenticator;
  invoice: Stripe.Invoice;
  stripeSubscription: Stripe.Subscription;
}): Promise<Result<undefined, Error>> {
  if (
    !isCreditPurchaseInvoice(invoice) ||
    isEnterpriseSubscription(stripeSubscription)
  ) {
    throw new Error(
      `Cannot process this invoice for credit purchase: ${invoice.id}\n` +
        `isCreditPurchaseInvoice: ${isCreditPurchaseInvoice(invoice)}\n` +
        `isEntrepriseSubscription: ${isEnterpriseSubscription(stripeSubscription)}`
    );
  }

  const workspace = auth.getNonNullableWorkspace();
  const creditAmountCents = getCreditAmountFromInvoice(invoice);

  if (creditAmountCents === null) {
    logger.error(
      {
        workspaceId: workspace.sId,
        invoiceId: invoice.id,
        creditAmountCents: invoice.metadata?.credit_amount_cents,
      },
      "[Credit Purchase] Invalid credit amount in invoice metadata"
    );
    getStatsDClient().increment("credits.top_up.error", 1, [
      `workspace_id:${workspace.sId}`,
      "type:committed",
      "customer:pro",
    ]);
    return new Err(new Error("Invalid credit amount in invoice metadata"));
  }

  const credit = await CreditResource.fetchByInvoiceOrLineItemId(
    auth,
    invoice.id
  );

  if (!credit) {
    logger.error(
      {
        workspaceId: workspace.sId,
        invoiceId: invoice.id,
      },
      "[Credit Purchase] Credit not found for invoice"
    );
    getStatsDClient().increment("credits.top_up.error", 1, [
      `workspace_id:${workspace.sId}`,
      "type:committed",
      "customer:pro",
    ]);
    return new Err(new Error("Credit not found for invoice"));
  }

  const startResult = await credit.start(auth);
  if (startResult.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        creditAmountCents,
        invoiceId: invoice.id,
        creditId: credit.id,
        expirationDate: credit.expirationDate,
      },
      "[Credit Purchase] Error starting credit"
    );
    getStatsDClient().increment("credits.top_up.error", 1, [
      `workspace_id:${workspace.sId}`,
      "type:committed",
      "customer:pro",
    ]);
    return new Err(startResult.error);
  }
  getStatsDClient().increment("credits.top_up.success", 1, [
    `workspace_id:${workspace.sId}`,
    "type:committed",
    "customer:pro",
  ]);

  if (creditAmountCents) {
    const metronomeResult = await addMetronomeCommitsForWorkspace({
      auth,
      amountCents: creditAmountCents,
    });
    if (metronomeResult.isErr()) {
      return new Err(metronomeResult.error);
    }
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      creditAmountCents,
      invoiceId: invoice.id,
      creditId: credit.id,
    },
    "[Credit Purchase] Successfully activated credit for Pro subscription"
  );
  return new Ok(undefined);
}

export async function voidFailedProCreditPurchaseInvoice({
  auth,
  invoice,
}: {
  auth: Authenticator;
  invoice: Stripe.Invoice;
}): Promise<Result<{ voided: boolean }, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  if (invoice.attempt_count < MAX_PRO_INVOICE_ATTEMPTS_BEFORE_VOIDED) {
    return new Ok({ voided: false });
  }

  const voidResult = await voidInvoiceWithReason(
    invoice.id,
    "failed_upfront_pro_credit_purchase"
  );
  if (voidResult.isErr()) {
    return new Err(voidResult.error);
  }

  const credit = await CreditResource.fetchByInvoiceOrLineItemId(
    auth,
    invoice.id
  );

  if (credit) {
    await credit.delete(auth);
  } else {
    logger.warn(
      {
        workspaceId: workspace.sId,
        invoiceId: invoice.id,
        attemptCount: invoice.attempt_count,
      },
      "[Credit Purchase] Credit not found for failed pro invoice"
    );
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      invoiceId: invoice.id,
      attemptCount: invoice.attempt_count,
    },
    "[Credit Purchase] Voided failed invoice and deleted pending credit"
  );

  return new Ok({ voided: true });
}

export async function createEnterpriseCreditPurchase({
  auth,
  stripeSubscriptionId,
  amountMicroUsd,
  discountPercent,
  startDate,
  expirationDate,
  boughtByUserId,
  customerFacingInfo,
}: {
  auth: Authenticator;
  stripeSubscriptionId: string;
  amountMicroUsd: number;
  discountPercent?: number;
  startDate?: Date;
  expirationDate?: Date;
  boughtByUserId?: number;
  customerFacingInfo?: CustomerFacingInvoiceInfo;
}): Promise<
  Result<{ credit: CreditResource; invoiceOrLineItemId: string }, Error>
> {
  if (discountPercent !== undefined && discountPercent > MAX_DISCOUNT_PERCENT) {
    return new Err(
      new Error(
        `Discount cannot exceed ${MAX_DISCOUNT_PERCENT}% (would result in selling below cost)`
      )
    );
  }

  const workspace = auth.getNonNullableWorkspace();

  let couponId;
  if (discountPercent) {
    const couponResult = await getCreditPurchaseCouponId(discountPercent);
    if (couponResult.isErr()) {
      logger.error(
        {
          panic: true,
          error: couponResult.error.message,
          workspaceId: workspace.sId,
          discountPercent,
        },
        "[Credit Purchase] Failed to create or retrieve coupon"
      );
      return couponResult;
    }
    couponId = couponResult.value;
  } else {
    couponId = undefined;
  }

  const invoiceResult = await makeCreditPurchaseOneOffInvoice({
    stripeSubscriptionId,
    amountMicroUsd,
    couponId,
    customerFacingInfo,
    collectionMethod: "send_invoice",
    daysUntilDue: ENTERPRISE_N30_PAYMENTS_DAYS,
  });

  if (invoiceResult.isErr()) {
    logger.error(
      {
        error: invoiceResult.error.error_message,
        workspaceId: workspace.sId,
        amountMicroUsd,
        discountPercent,
      },
      "[Credit Purchase] Failed to create enterprise credit purchase invoice"
    );
    return new Err(new Error(invoiceResult.error.error_message));
  }

  const invoice = invoiceResult.value;

  const credit = await CreditResource.makeNew(auth, {
    type: "committed",
    initialAmountMicroUsd: amountMicroUsd,
    consumedAmountMicroUsd: 0,
    discount: discountPercent,
    invoiceOrLineItemId: invoice.id,
    boughtByUserId,
  });

  const finalizeResult = await finalizeInvoice(invoice);
  if (finalizeResult.isErr()) {
    logger.error(
      {
        error: finalizeResult.error.error_message,
        workspaceId: workspace.sId,
        invoiceId: invoice.id,
      },
      "[Credit Purchase] Failed to finalize enterprise credit purchase invoice"
    );
    return new Err(new Error(finalizeResult.error.error_message));
  }

  const startResult = await credit.start(auth, {
    startDate,
    expirationDate,
  });

  if (startResult.isErr()) {
    logger.error(
      {
        error: startResult.error.message,
        workspaceId: workspace.sId,
        invoiceOrLineItemId: invoice.id,
      },
      "[Credit Purchase] Failed to start credit after creation"
    );
    getStatsDClient().increment("credits.top_up.error", 1, [
      `workspace_id:${workspace.sId}`,
      "type:committed",
      "customer:enterprise",
    ]);
    return new Err(startResult.error);
  }

  getStatsDClient().increment("credits.top_up.success", 1, [
    `workspace_id:${workspace.sId}`,
    "type:committed",
    "customer:enterprise",
  ]);

  const metronomeResult = await addMetronomeCommitsForWorkspace({
    auth,
    amountCents: amountMicroUsd / 10_000,
    startDate,
    expirationDate,
  });
  if (metronomeResult.isErr()) {
    return new Err(metronomeResult.error);
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      amountMicroUsd,
      discountPercent,
      invoiceOrLineItemId: invoice.id,
      expirationDate: credit.expirationDate,
    },
    "[Credit Purchase] Enterprise credit purchase invoice created and credit activated"
  );

  return new Ok({ credit, invoiceOrLineItemId: invoice.id });
}

export async function createProCreditPurchase({
  auth,
  stripeSubscriptionId,
  amountMicroUsd,
  discountPercent,
  boughtByUserId,
}: {
  auth: Authenticator;
  stripeSubscriptionId: string;
  amountMicroUsd: number;
  discountPercent?: number;
  boughtByUserId?: number;
}): Promise<Result<{ invoiceId: string; paymentUrl: string | null }, Error>> {
  if (discountPercent !== undefined && discountPercent > MAX_DISCOUNT_PERCENT) {
    return new Err(
      new Error(
        `Discount cannot exceed ${MAX_DISCOUNT_PERCENT}% (would result in selling below cost)`
      )
    );
  }

  const workspace = auth.getNonNullableWorkspace();

  let couponId;
  if (discountPercent) {
    const couponResult = await getCreditPurchaseCouponId(discountPercent);
    if (couponResult.isErr()) {
      logger.error(
        {
          panic: true,
          error: couponResult.error.message,
          workspaceId: workspace.sId,
          discountPercent,
        },
        "[Credit Purchase] Failed to create or retrieve coupon"
      );
      return couponResult;
    }
    couponId = couponResult.value;
  }

  const invoiceResult = await makeCreditPurchaseOneOffInvoice({
    stripeSubscriptionId,
    amountMicroUsd,
    couponId,
    collectionMethod: "charge_automatically",
    requestThreeDSecure: "challenge",
  });

  if (invoiceResult.isErr()) {
    logger.warn(
      {
        error: invoiceResult.error.error_message,
        workspaceId: workspace.sId,
        amountMicroUsd,
      },
      "[Credit Purchase] Failed to process credit purchase"
    );
    return new Err(new Error(invoiceResult.error.error_message));
  }

  const invoice = invoiceResult.value;

  await CreditResource.makeNew(auth, {
    type: "committed",
    initialAmountMicroUsd: amountMicroUsd,
    consumedAmountMicroUsd: 0,
    discount: discountPercent,
    invoiceOrLineItemId: invoice.id,
    boughtByUserId,
  });

  const finalizeResult = await finalizeInvoice(invoice);
  if (finalizeResult.isErr()) {
    logger.error(
      {
        panic: true,
        error: finalizeResult.error.error_message,
        workspaceId: workspace.sId,
        invoiceId: invoice.id,
        amountMicroUsd,
      },
      "[Credit Purchase] Failed to finalize credit purchase invoice"
    );
    return new Err(new Error(finalizeResult.error.error_message));
  }

  const payResult = await payInvoice(finalizeResult.value);
  if (payResult.isErr()) {
    logger.warn(
      {
        error: payResult.error.error_message,
        workspaceId: workspace.sId,
        invoiceId: invoice.id,
        amountMicroUsd,
      },
      "[Credit Purchase] Failed to pay credit purchase invoice"
    );
    return new Err(new Error(payResult.error.error_message));
  }

  const { paymentUrl } = payResult.value;

  logger.info(
    {
      workspaceId: workspace.sId,
      amountMicroUsd,
      discountPercent,
      invoiceId: invoice.id,
      requiresAction: paymentUrl !== null,
    },
    "[Credit Purchase] Credit purchase invoice created, credit will be started via webhook"
  );

  return new Ok({ invoiceId: invoice.id, paymentUrl });
}

export type DeleteCreditError =
  | { type: "credit_not_found" }
  | { type: "credit_already_started"; credit: CreditResource };

export async function deleteCreditFromVoidedInvoice({
  auth,
  invoice,
}: {
  auth: Authenticator;
  invoice: Stripe.Invoice;
}): Promise<Result<undefined, DeleteCreditError>> {
  assert(
    isCreditPurchaseInvoice(invoice),
    "deleteCreditFromVoidedInvoice called with non-credit-purchase invoice"
  );

  const credit = await CreditResource.fetchByInvoiceOrLineItemId(
    auth,
    invoice.id
  );

  if (!credit) {
    return new Err({ type: "credit_not_found" });
  }

  if (credit.startDate !== null) {
    return new Err({ type: "credit_already_started", credit });
  }

  await credit.delete(auth);

  return new Ok(undefined);
}

async function addMetronomeCommitsForWorkspace({
  auth,
  amountCents,
  startDate,
  expirationDate,
}: {
  auth: Authenticator;
  amountCents: number;
  startDate?: Date;
  expirationDate?: Date;
}): Promise<Result<void, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();

  const metronomeCustomerId = workspace.metronomeCustomerId;
  const metronomeContractId = subscription?.metronomeContractId;

  if (!metronomeCustomerId || !metronomeContractId) {
    logger.info(
      { subscription },
      "[Commit Purchase] Subscription missing Metronome contract ID, skipping credit addition"
    );
    logger.info(
      { workspaceId: workspace.sId, metronomeCustomerId, metronomeContractId },
      "[Commit Purchase] Workspace not provisioned in Metronome, skipping credit addition"
    );
    return new Ok(undefined);
  }

  const effectiveStartDate = startDate ?? new Date();
  const effectiveExpirationDate =
    expirationDate ??
    new Date(
      effectiveStartDate.getTime() +
        CREDIT_EXPIRATION_DAYS * 24 * 60 * 60 * 1000
    );

  const productId = config.getMetronomeCommitProductId();
  if (!productId) {
    return new Err(
      new Error(
        "[Commit Purchase] Metronome commit product ID not configured; cannot add commits for credit purchase"
      )
    );
  }

  const result = await createMetronomeCommit({
    metronomeCustomerId,
    contractId: metronomeContractId,
    productId,
    amountCents,
    startingAt: effectiveStartDate,
    endingBefore: effectiveExpirationDate,
    name: `Prepaid commit (${effectiveStartDate.toISOString()})`,
    idempotencyKey: `commit-${workspace.sId}-${effectiveStartDate.getTime()}-${amountCents}`,
  });

  if (result.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        metronomeCustomerId,
        metronomeContractId,
        amountCents,
        error: result.error.message,
      },
      "[Commit Purchase] Failed to add commits to Metronome"
    );
  }
  return result;
}
