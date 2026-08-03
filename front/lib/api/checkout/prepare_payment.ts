import { getStripeCheckoutSessionStatus } from "@app/lib/api/stripe/checkout_status";
import { isMetronomeBillingEnabled } from "@app/lib/api/subscription";
import type { Authenticator } from "@app/lib/auth";
import { getBillingCurrencyForCountry } from "@app/lib/plans/billing_currency";
import { calculateTax, getStripeClient } from "@app/lib/plans/stripe";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import type { GetPreparePaymentResponseBody } from "@app/types/api/checkout/prepare_payment";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";

export type PreparePaymentError =
  | { type: "metronome_not_enabled" }
  | { type: "setup_not_succeeded" }
  | { type: "workspace_mismatch" }
  | { type: "missing_metadata" }
  | { type: "missing_customer_id" }
  | { type: "customer_deleted" }
  | { type: "tax_calculation_failed"; message: string };

export async function getPreparePaymentData(
  auth: Authenticator,
  setupSessionId: string
): Promise<Result<GetPreparePaymentResponseBody, PreparePaymentError>> {
  const useMetronomeBilling = await isMetronomeBillingEnabled(auth);
  if (!useMetronomeBilling) {
    return new Err({ type: "metronome_not_enabled" });
  }

  const owner = auth.getNonNullableWorkspace();

  // onComplete fires on the client before Stripe marks the session complete server-side.
  // We return "pending" so the client can retry instead of blocking here.
  const sessionStatus = await getStripeCheckoutSessionStatus(setupSessionId);
  if (sessionStatus?.status !== "complete") {
    return new Ok({ status: "pending" });
  }

  const stripe = getStripeClient();
  const setupSession = await stripe.checkout.sessions.retrieve(setupSessionId, {
    expand: ["setup_intent", "setup_intent.payment_method"],
  });

  const setupIntent = setupSession.setup_intent;
  if (
    !setupIntent ||
    isString(setupIntent) ||
    setupIntent.status !== "succeeded"
  ) {
    return new Err({ type: "setup_not_succeeded" });
  }

  if (setupSession.client_reference_id !== owner.sId) {
    return new Err({ type: "workspace_mismatch" });
  }

  const { seatCount: seatCountStr, pricePerSeatCents: pricePerSeatCentsStr } =
    setupSession.metadata ?? {};
  if (!isString(seatCountStr) || !isString(pricePerSeatCentsStr)) {
    return new Err({ type: "missing_metadata" });
  }

  const seatCount = Number(seatCountStr);
  const pricePerSeatCents = Number(pricePerSeatCentsStr);
  const subtotalCents = seatCount * pricePerSeatCents;
  const stripeCustomerId = setupSession.customer;

  if (!isString(stripeCustomerId)) {
    return new Err({ type: "missing_customer_id" });
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
    return new Err({ type: "customer_deleted" });
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
    return new Err({
      type: "tax_calculation_failed",
      message: taxResult.error.error_message,
    });
  }

  return new Ok({
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
