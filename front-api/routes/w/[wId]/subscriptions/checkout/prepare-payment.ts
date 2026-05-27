import { getStripeCheckoutSessionStatus } from "@app/lib/api/stripe/checkout_status";
import { isMetronomeBillingEnabled } from "@app/lib/api/subscription";
import { getBillingCurrencyForCountry } from "@app/lib/plans/billing_currency";
import { calculateTax, getStripeClient } from "@app/lib/plans/stripe";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import type { SupportedCurrency } from "@app/types/currency";
import { isString } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export type GetPreparePaymentResponseBody =
  | { status: "pending" }
  | {
      status: "success";
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
      sepaLast4?: string;
    };

// Mounted at /api/w/:wId/subscriptions/checkout/prepare-payment.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetPreparePaymentResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const useMetronomeBilling = await isMetronomeBillingEnabled(auth);
    if (!useMetronomeBilling) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Metronome billing is not enabled for this workspace.",
        },
      });
    }

    // Prevent HTTP caching as session status can change on every call.
    ctx.header("Cache-Control", "no-store");

    const setup_session_id = ctx.req.query("setup_session_id");
    if (!isString(setup_session_id)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Missing or invalid setup_session_id query parameter.",
        },
      });
    }

    // onComplete fires on the client before Stripe marks the session complete server-side.
    // We return "pending" so the client can retry instead of blocking here.
    const sessionStatus =
      await getStripeCheckoutSessionStatus(setup_session_id);
    if (sessionStatus?.status !== "complete") {
      return ctx.json<GetPreparePaymentResponseBody>({ status: "pending" });
    }

    const stripe = getStripeClient();
    const setupSession = await stripe.checkout.sessions.retrieve(
      setup_session_id,
      { expand: ["setup_intent", "setup_intent.payment_method"] }
    );

    const setupIntent = setupSession.setup_intent;
    if (
      !setupIntent ||
      isString(setupIntent) ||
      setupIntent.status !== "succeeded"
    ) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Setup session has not completed successfully.",
        },
      });
    }
    if (setupSession.client_reference_id !== owner.sId) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Setup intent does not correspond to the current workspace.",
        },
      });
    }

    const { seatCount: seatCountStr, pricePerSeatCents: pricePerSeatCentsStr } =
      setupSession.metadata ?? {};

    if (!isString(seatCountStr) || !isString(pricePerSeatCentsStr)) {
      return apiError(ctx, {
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
      return apiError(ctx, {
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
    let sepaLast4: string | undefined;
    if (rawPaymentMethod && !isString(rawPaymentMethod)) {
      if (rawPaymentMethod.card) {
        cardBrand = rawPaymentMethod.card.brand;
        cardLast4 = rawPaymentMethod.card.last4;
      } else if (rawPaymentMethod.sepa_debit) {
        sepaLast4 = rawPaymentMethod.sepa_debit.last4 ?? undefined;
      }
    }

    const customer = await stripe.customers.retrieve(stripeCustomerId);
    if (customer.deleted) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Stripe customer has been deleted.",
        },
      });
    }
    const country = customer.address?.country ?? "US";
    const currency = getBillingCurrencyForCountry(country, true);

    // Apply coupon discount to the tax base if a coupon was stored in session metadata.
    // No validation here — enforcement happens in POST /payment.
    const couponCode = setupSession.metadata?.couponCode;
    let discountedSubtotalCents = subtotalCents;
    if (couponCode) {
      const coupon = await CouponResource.findByCode(couponCode);
      if (coupon) {
        discountedSubtotalCents = Math.max(
          0,
          subtotalCents - coupon.amount * 100
        );
      }
    }

    const taxResult = await calculateTax({
      stripeCustomerId,
      amountCents: discountedSubtotalCents,
      currency,
    });
    if (taxResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: taxResult.error.error_message,
        },
      });
    }

    return ctx.json<GetPreparePaymentResponseBody>({
      status: "success",
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
      sepaLast4,
    });
  }
);

export default app;
