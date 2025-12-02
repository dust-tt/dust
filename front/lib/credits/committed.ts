import type Stripe from "stripe";

import type { Authenticator } from "@app/lib/auth";
import {
  ENTERPRISE_N30_PAYMENTS_DAYS,
  finalizeInvoice,
  getCreditAmountFromInvoice,
  getCreditPurchaseCouponId,
  isCreditPurchaseInvoice,
  isEnterpriseSubscription,
  makeOneOffInvoice,
  payInvoice,
} from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

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
    return new Err(new Error("Credit not found for invoice"));
  }

  const startResult = await credit.start();
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
    return new Err(startResult.error);
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

export async function createEnterpriseCreditPurchase({
  auth,
  stripeSubscriptionId,
  amountCents,
  discountPercent,
  startDate,
  expirationDate,
}: {
  auth: Authenticator;
  stripeSubscriptionId: string;
  amountCents: number;
  discountPercent?: number;
  startDate?: Date;
  expirationDate?: Date;
}): Promise<
  Result<{ credit: CreditResource; invoiceOrLineItemId: string }, Error>
> {
  const workspace = auth.getNonNullableWorkspace();

  let couponId;
  if (discountPercent) {
    const couponResult = await getCreditPurchaseCouponId(discountPercent);
    if (couponResult.isErr()) {
      logger.error(
        {
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

  const invoiceResult = await makeOneOffInvoice({
    stripeSubscriptionId,
    amountCents,
    couponId,
    collectionMethod: "send_invoice",
    daysUntilDue: ENTERPRISE_N30_PAYMENTS_DAYS,
  });

  if (invoiceResult.isErr()) {
    logger.error(
      {
        error: invoiceResult.error.error_message,
        workspaceId: workspace.sId,
        amountCents,
        discountPercent,
      },
      "[Credit Purchase] Failed to create enterprise credit purchase invoice"
    );
    return new Err(new Error(invoiceResult.error.error_message));
  }

  const invoice = invoiceResult.value;

  const credit = await CreditResource.makeNew(auth, {
    type: "committed",
    initialAmountCents: amountCents,
    consumedAmountCents: 0,
    discount: discountPercent,
    invoiceOrLineItemId: invoice.id,
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

  const startResult = await credit.start(startDate, expirationDate);

  if (startResult.isErr()) {
    logger.error(
      {
        error: startResult.error.message,
        workspaceId: workspace.sId,
        invoiceOrLineItemId: invoice.id,
      },
      "[Credit Purchase] Failed to start credit after creation"
    );
    return new Err(startResult.error);
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      amountCents,
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
  amountCents,
  discountPercent,
}: {
  auth: Authenticator;
  stripeSubscriptionId: string;
  amountCents: number;
  discountPercent?: number;
}): Promise<Result<{ invoiceId: string; paymentUrl: string | null }, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  let couponId;
  if (discountPercent) {
    const couponResult = await getCreditPurchaseCouponId(discountPercent);
    if (couponResult.isErr()) {
      logger.error(
        {
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

  const invoiceResult = await makeOneOffInvoice({
    stripeSubscriptionId,
    amountCents,
    couponId,
    collectionMethod: "charge_automatically",
  });

  if (invoiceResult.isErr()) {
    logger.error(
      {
        error: invoiceResult.error.error_message,
        workspaceId: workspace.sId,
        amountCents,
      },
      "[Credit Purchase] Failed to process credit purchase"
    );
    return new Err(new Error(invoiceResult.error.error_message));
  }

  const invoice = invoiceResult.value;

  await CreditResource.makeNew(auth, {
    type: "committed",
    initialAmountCents: amountCents,
    consumedAmountCents: 0,
    discount: discountPercent,
    invoiceOrLineItemId: invoice.id,
  });

  const finalizeResult = await finalizeInvoice(invoice);
  if (finalizeResult.isErr()) {
    logger.error(
      {
        error: finalizeResult.error.error_message,
        workspaceId: workspace.sId,
        invoiceId: invoice.id,
        amountCents,
      },
      "[Credit Purchase] Failed to finalize credit purchase invoice"
    );
    return new Err(new Error(finalizeResult.error.error_message));
  }

  const payResult = await payInvoice(finalizeResult.value);
  if (payResult.isErr()) {
    logger.error(
      {
        error: payResult.error.error_message,
        workspaceId: workspace.sId,
        invoiceId: invoice.id,
        amountCents,
      },
      "[Credit Purchase] Failed to pay credit purchase invoice"
    );
    return new Err(new Error(payResult.error.error_message));
  }

  const { paymentUrl } = payResult.value;

  logger.info(
    {
      workspaceId: workspace.sId,
      amountCents,
      discountPercent,
      invoiceId: invoice.id,
      requiresAction: paymentUrl !== null,
    },
    "[Credit Purchase] Credit purchase invoice created, credit will be started via webhook"
  );

  return new Ok({ invoiceId: invoice.id, paymentUrl });
}
