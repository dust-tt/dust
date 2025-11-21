import type Stripe from "stripe";

import { Authenticator } from "@app/lib/auth";
import type { Subscription } from "@app/lib/models/plan";
import {
  attachCreditPurchaseToSubscription,
  getCreditAmountFromInvoice,
  getStripeSubscription,
  isCreditPurchaseInvoice,
  isEnterpriseSubscription,
  makeAndMaybePayCreditPurchaseInvoice,
} from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import type { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

/**
 * Handles credit purchase activation from a Stripe invoice for Pro subscriptions.
 * (Enterprise subscriptions activate credits optimistically, so we skip them here.)
 *
 * @param invoice - The Stripe invoice that was paid
 * @param subscription - The subscription record with workspace included
 * @returns Result indicating success or failure
 */
export async function maybeStartCreditFromProOneOffInvoice({
  invoice,
  subscription,
}: {
  invoice: Stripe.Invoice;
  subscription: Subscription & { workspace: WorkspaceModel };
}): Promise<Result<undefined, Error>> {
  // Check if this is a credit purchase invoice
  if (!isCreditPurchaseInvoice(invoice)) {
    // Not a credit purchase invoice, nothing to do
    return new Ok(undefined);
  }

  if (typeof invoice.subscription !== "string") {
    return new Err(
      new Error(
        "Credit purchase invoice does not have a valid subscription ID."
      )
    );
  }

  const workspace = subscription.workspace;
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

  const stripeSubscription = await getStripeSubscription(invoice.subscription);
  if (!stripeSubscription) {
    logger.error(
      {
        workspaceId: workspace.sId,
        invoiceId: invoice.id,
      },
      "[Credit Purchase] Subscription not found"
    );
    return new Err(new Error("Subscription not found"));
  }
  // Check if this is an Enterprise subscription
  const isEnterprise = isEnterpriseSubscription(stripeSubscription);

  if (isEnterprise) {
    logger.info(
      {
        workspaceId: workspace.sId,
        invoiceId: invoice.id,
      },
      "[Credit Purchase] Skipping credit activation for Enterprise (already activated optimistically)"
    );
    return new Ok(undefined);
  }

  // Pro accounts - activate existing credit record (created in purchase API).
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

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

/**
 * Creates and activates a credit purchase for Enterprise subscriptions.
 * Attaches an invoice item to the subscription and immediately activates the credit.
 *
 * @param auth - Authenticator for the workspace
 * @param stripeSubscriptionId - Stripe subscription ID
 * @param amountCents - Credit amount in cents
 * @returns Result with credit info or error
 */
export async function createEnterpriseCreditPurchase({
  auth,
  stripeSubscriptionId,
  amountCents,
}: {
  auth: Authenticator;
  stripeSubscriptionId: string;
  amountCents: number;
}): Promise<Result<{ credit: CreditResource; invoiceItemId: string }, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  // Attach credit purchase to subscription
  const attachResult = await attachCreditPurchaseToSubscription({
    stripeSubscriptionId,
    amountCents,
  });

  if (attachResult.isErr()) {
    logger.error(
      {
        error: attachResult.error.error_message,
        workspaceId: workspace.sId,
        amountCents,
      },
      "[Credit Purchase] Failed to attach credit purchase to subscription"
    );
    return new Err(new Error(attachResult.error.error_message));
  }

  const invoiceItemId = attachResult.value;

  // Create credit with full amount
  const credit = await CreditResource.makeNew(auth, {
    type: "committed",
    initialAmountCents: amountCents,
    consumedAmountCents: 0,
    discount: null,
    invoiceOrLineItemId: invoiceItemId,
  });

  // Activate the credit immediately (optimistic activation for Enterprise)
  const startResult = await credit.start();

  if (startResult.isErr()) {
    logger.error(
      {
        error: startResult.error.message,
        workspaceId: workspace.sId,
        invoiceItemId,
      },
      "[Credit Purchase] Failed to start credit after creation"
    );
    return new Err(startResult.error);
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      amountCents,
      invoiceItemId,
      expirationDate: credit.expirationDate,
    },
    "[Credit Purchase] Credit purchase attached to subscription and activated"
  );

  return new Ok({ credit, invoiceItemId });
}

/**
 * Creates a credit purchase for Pro subscriptions.
 * Creates and pays a one-off invoice. Credit will be activated via webhook when paid.
 *
 * @param auth - Authenticator for the workspace
 * @param stripeSubscriptionId - Stripe subscription ID
 * @param amountCents - Credit amount in cents
 * @returns Result with invoice ID or error
 */
export async function createProCreditPurchase({
  auth,
  stripeSubscriptionId,
  amountCents,
}: {
  auth: Authenticator;
  stripeSubscriptionId: string;
  amountCents: number;
}): Promise<Result<{ invoiceId: string }, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  // Create and pay one-off invoice
  const invoiceResult = await makeAndMaybePayCreditPurchaseInvoice({
    stripeSubscriptionId,
    amountCents,
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

  // Create credit record (will be activated via webhook when paid)
  await CreditResource.makeNew(auth, {
    type: "committed",
    initialAmountCents: amountCents,
    consumedAmountCents: 0,
    discount: null,
    invoiceOrLineItemId: invoice.id,
  });

  logger.info(
    {
      workspaceId: workspace.sId,
      amountCents,
      invoiceId: invoice.id,
    },
    "[Credit Purchase] Credit purchase invoice created, credit will be started via webhook"
  );

  return new Ok({ invoiceId: invoice.id });
}
