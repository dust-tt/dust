/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { isMetronomeBillingEnabled } from "@app/lib/api/subscription";
import type { Authenticator } from "@app/lib/auth";
import { getBillingCurrencyForCountry } from "@app/lib/plans/billing_currency";
import { calculateTax, getStripeClient } from "@app/lib/plans/stripe";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { getStripeCheckoutSessionStatus } from "@app/pages/api/stripe/webhook";
import type { SupportedCurrency } from "@app/types/currency";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

const SETUP_SESSION_POLL_INTERVAL_MS = 500;
const SETUP_SESSION_POLL_TIMEOUT_MS = 5_000;

async function pollUntilSetupSessionComplete(
  sessionId: string
): Promise<boolean> {
  const deadlineMs = Date.now() + SETUP_SESSION_POLL_TIMEOUT_MS;

  while (Date.now() < deadlineMs) {
    const result = await getStripeCheckoutSessionStatus(sessionId);
    if (result?.status === "complete") {
      return true;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, SETUP_SESSION_POLL_INTERVAL_MS)
    );
  }

  return false;
}

export type GetPreparePaymentResponseBody = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  seatCount: number;
  pricePerSeatCents: number;
  planCode: string;
  metronomePackageAlias: string;
  currency: SupportedCurrency;
  cardBrand?: string;
  cardLast4?: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetPreparePaymentResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
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

  const { setup_session_id } = req.query;
  if (!isString(setup_session_id)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid setup_session_id query parameter.",
      },
    });
  }

  // We are using the onComplete for checkout session completion.
  // This is a server-side event that can be triggered
  // before the session actually has completed.
  // This is why we need to check for session completion with polling.
  const isComplete = await pollUntilSetupSessionComplete(setup_session_id);
  if (!isComplete) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Setup session did not complete in time.",
      },
    });
  }

  const stripe = getStripeClient();
  const setupSession = await stripe.checkout.sessions.retrieve(
    setup_session_id,
    { expand: ["setup_intent", "setup_intent.payment_method"] }
  );
  logger.info(
    {
      sessionId: setup_session_id,
      sessionStatus: setupSession.status,
      setupIntentStatus: isString(setupSession.setup_intent)
        ? setupSession.setup_intent
        : setupSession.setup_intent?.status,
    },
    "Stripe setup session retrieved"
  );

  const setupIntent = setupSession.setup_intent;
  if (
    !setupIntent ||
    isString(setupIntent) ||
    setupIntent.status !== "succeeded"
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Setup session has not completed successfully.",
      },
    });
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

  const planCode = setupSession.metadata?.planCode ?? "";
  const metronomePackageAlias =
    setupSession.metadata?.metronomePackageAlias ?? "";

  const rawPaymentMethod = setupIntent.payment_method;
  let cardBrand: string | undefined;
  let cardLast4: string | undefined;
  if (
    rawPaymentMethod &&
    !isString(rawPaymentMethod) &&
    rawPaymentMethod.card
  ) {
    cardBrand = rawPaymentMethod.card.brand;
    cardLast4 = rawPaymentMethod.card.last4;
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

  const taxResult = await calculateTax({
    stripeCustomerId,
    amountCents: subtotalCents,
    currency,
  });
  if (taxResult.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: taxResult.error.error_message,
      },
    });
  }

  return res.status(200).json({
    subtotalCents,
    taxCents: taxResult.value.taxCents,
    totalCents: taxResult.value.totalCents,
    seatCount,
    pricePerSeatCents,
    planCode,
    metronomePackageAlias,
    currency,
    cardBrand,
    cardLast4,
  });
}

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
