/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { isMetronomeBillingEnabled } from "@app/lib/api/subscription";
import type { Authenticator } from "@app/lib/auth";
import { getBillingCurrencyForCountry } from "@app/lib/plans/billing_currency";
import {
  finalizeInvoice,
  getStripeClient,
  makeFirstPeriodInvoiceForCustomer,
} from "@app/lib/plans/stripe";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const BodySchema = z.object({
  setupSessionId: z.string(),
});

export type PostCheckoutPaymentResponseBody =
  | { success: true }
  | {
      error:
        | "setup_failed"
        | "payment_failed"
        | "metronome_error"
        | "internal_error";
    };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostCheckoutPaymentResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  }

  const useMetronomeBilling = await isMetronomeBillingEnabled(auth);
  if (!useMetronomeBilling) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Metronome billing is not enabled for this workspace.",
      },
    });
  }

  const bodyValidation = BodySchema.safeParse(req.body);
  if (!bodyValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: fromError(bodyValidation.error).toString(),
      },
    });
  }

  const { setupSessionId } = bodyValidation.data;
  const owner = auth.getNonNullableWorkspace();

  // Idempotency guard: provisioning already completed.
  const workspace = await WorkspaceResource.fetchById(owner.sId);
  if (workspace) {
    const activeSubscription =
      await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
    if (activeSubscription?.metronomeContractId) {
      return res.status(200).json({ success: true });
    }
  }

  const stripe = getStripeClient();
  const setupSession = await stripe.checkout.sessions.retrieve(setupSessionId, {
    expand: ["setup_intent"],
  });

  const setupIntent = setupSession.setup_intent;
  if (
    !setupIntent ||
    isString(setupIntent) ||
    setupIntent.status !== "succeeded"
  ) {
    return res.status(200).json({ error: "setup_failed" });
  }

  const { seatCount: seatCountStr, pricePerSeatCents: pricePerSeatCentsStr } =
    setupSession.metadata ?? {};

  if (!isString(seatCountStr) || !isString(pricePerSeatCentsStr)) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message:
          "Setup session metadata is missing seatCount or pricePerSeatCents.",
      },
    });
  }

  const seatCount = Number(seatCountStr);
  const pricePerSeatCents = Number(pricePerSeatCentsStr);
  const subtotalCents = seatCount * pricePerSeatCents;
  const stripeCustomerId = setupSession.customer;

  if (!isString(stripeCustomerId)) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Setup session is missing a customer ID.",
      },
    });
  }

  const rawPaymentMethod = setupIntent.payment_method;
  const paymentMethodId =
    rawPaymentMethod === null
      ? null
      : isString(rawPaymentMethod)
        ? rawPaymentMethod
        : rawPaymentMethod.id;

  if (!paymentMethodId) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Setup intent is missing a payment method.",
      },
    });
  }

  const customer = await stripe.customers.retrieve(stripeCustomerId);
  if (customer.deleted) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Stripe customer has been deleted.",
      },
    });
  }
  const country = customer.address?.country ?? "US";
  const currency = getBillingCurrencyForCountry(country, true);

  const invoiceResult = await makeFirstPeriodInvoiceForCustomer({
    stripeCustomerId,
    paymentMethodId,
    subtotalCents,
    seatCount,
    setupSessionId,
    currency,
  });
  if (invoiceResult.isErr()) {
    logger.error(
      {
        panic: true,
        workspaceId: owner.sId,
        error: invoiceResult.error.error_message,
      },
      "[Checkout] Failed to create first-period invoice"
    );
    return res.status(500).json({ error: "payment_failed" });
  }

  const finalizeResult = await finalizeInvoice(invoiceResult.value);
  if (finalizeResult.isErr()) {
    logger.error(
      {
        panic: true,
        workspaceId: owner.sId,
        error: finalizeResult.error.error_message,
        invoiceId: invoiceResult.value.id,
      },
      "[Checkout] Failed to finalize first-period invoice"
    );
    return res.status(500).json({ error: "payment_failed" });
  }

  let payResult;
  try {
    payResult = await stripe.invoices.pay(finalizeResult.value.id);

    if (payResult.status !== "paid") {
      logger.error(
        {
          panic: true,
          workspaceId: owner.sId,
          invoiceId: finalizeResult.value.id,
        },
        "[Checkout] First-period invoice payment failed"
      );
      return res.status(500).json({ error: "payment_failed" });
    }
  } catch (payError) {
    logger.error(
      {
        panic: true,
        workspaceId: owner.sId,
        error: normalizeError(payError).message,
        invoiceId: finalizeResult.value.id,
      },
      "[Checkout] First-period invoice payment failed"
    );
    return res.status(500).json({ error: "payment_failed" });
  }

  return res.status(200).json({ success: true });
}

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
