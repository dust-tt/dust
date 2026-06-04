import { isMetronomeBillingEnabled } from "@app/lib/api/subscription";
import type { Authenticator } from "@app/lib/auth";
import { provisionMetronomeFirstPeriodSubscription } from "@app/lib/metronome/checkout";
import { getBillingCurrencyForCountry } from "@app/lib/plans/billing_currency";
import {
  chargeFirstPeriodInvoice,
  getStripeClient,
  setStripeCustomerDefaultPaymentMethod,
} from "@app/lib/plans/stripe";
import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import { z } from "zod";

export const PostCheckoutPaymentBodySchema = z.object({
  setupSessionId: z.string(),
});

export type PostCheckoutPaymentResponseBody =
  | { success: true }
  | {
      error:
        | "setup_failed"
        | "payment_failed"
        | "metronome_error"
        | "internal_error"
        | "invalid_coupon";
    };

export type CheckoutPaymentError =
  | { type: "metronome_not_enabled" }
  | { type: "setup_failed" }
  | { type: "workspace_mismatch" }
  | { type: "missing_metadata" }
  | { type: "missing_customer_id" }
  | { type: "missing_payment_method" }
  | { type: "customer_deleted" }
  | { type: "invalid_coupon" }
  | { type: "payment_failed" }
  | { type: "metronome_provisioning_failed" };

export async function processCheckoutPayment(
  auth: Authenticator,
  setupSessionId: string
): Promise<Result<{ success: true }, CheckoutPaymentError>> {
  const useMetronomeBilling = await isMetronomeBillingEnabled(auth);
  if (!useMetronomeBilling) {
    return new Err({ type: "metronome_not_enabled" });
  }

  const owner = auth.getNonNullableWorkspace();

  // Idempotency guard: provisioning already completed.
  const workspace = await WorkspaceResource.fetchById(owner.sId);
  if (workspace) {
    const activeSubscription =
      await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
    if (activeSubscription?.metronomeContractId) {
      return new Ok({ success: true });
    }
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
    return new Err({ type: "setup_failed" });
  }

  if (setupSession.client_reference_id !== owner.sId) {
    return new Err({ type: "workspace_mismatch" });
  }

  const {
    billingPeriod,
    seatCount: seatCountStr,
    pricePerSeatCents: pricePerSeatCentsStr,
  } = setupSession.metadata ?? {};

  if (
    !billingPeriod ||
    !isString(seatCountStr) ||
    !isString(pricePerSeatCentsStr)
  ) {
    return new Err({ type: "missing_metadata" });
  }

  const seatCount = Number(seatCountStr);
  const pricePerSeatCents = Number(pricePerSeatCentsStr);
  const subtotalCents = seatCount * pricePerSeatCents;
  const stripeCustomerId = setupSession.customer;

  if (!isString(stripeCustomerId)) {
    return new Err({ type: "missing_customer_id" });
  }

  const rawPaymentMethod = setupIntent.payment_method;
  const paymentMethodId =
    rawPaymentMethod === null
      ? null
      : isString(rawPaymentMethod)
        ? rawPaymentMethod
        : rawPaymentMethod.id;

  if (!paymentMethodId) {
    return new Err({ type: "missing_payment_method" });
  }

  const shouldEnforceFirstPeriodPayment =
    rawPaymentMethod !== null &&
    !isString(rawPaymentMethod) &&
    rawPaymentMethod.type === "card";

  const customer = await stripe.customers.retrieve(stripeCustomerId);
  if (customer.deleted) {
    return new Err({ type: "customer_deleted" });
  }

  const country = customer.address?.country ?? "US";
  const currency = getBillingCurrencyForCountry(country, true);

  // Coupon: validate + create pending redemption before charging.
  const couponCode = setupSession.metadata?.couponCode;
  let coupon: CouponResource | undefined;
  let pendingRedemption: CouponRedemptionResource | undefined;

  if (couponCode) {
    const found = await CouponResource.findByCode(couponCode);
    if (!found) {
      return new Err({ type: "invalid_coupon" });
    }
    const validation = found.validateRedemption();
    if (validation.isErr()) {
      return new Err({ type: "invalid_coupon" });
    }
    const existing =
      await CouponRedemptionResource.findActiveOrPendingByCouponAndWorkspace(
        auth,
        { coupon: found }
      );
    if (existing) {
      return new Err({ type: "invalid_coupon" });
    }
    const pendingResult = await CouponRedemptionResource.createPending(auth, {
      coupon: found,
    });
    if (pendingResult.isErr()) {
      logger.error(
        {
          workspaceId: owner.sId,
          couponCode,
          error: pendingResult.error.message,
        },
        "[Checkout] Failed to create pending coupon redemption"
      );
      return new Err({ type: "invalid_coupon" });
    }
    pendingRedemption = pendingResult.value;
    coupon = found;
  }

  const couponAmountCents = coupon ? coupon.amount * 100 : 0;
  const effectiveSubtotalCents = Math.max(0, subtotalCents - couponAmountCents);

  const user = auth.getNonNullableUser();
  const planCode = setupSession.metadata?.planCode ?? "";
  const metronomePackageAlias =
    setupSession.metadata?.metronomePackageAlias ?? "";

  // Set the payment method as the customer's Stripe default
  // for future Metronome-generated invoices (month 2+).
  const setDefaultPaymentMethodResult =
    await setStripeCustomerDefaultPaymentMethod({
      stripeCustomerId,
      paymentMethodId,
      workspaceId: owner.sId,
    });
  if (setDefaultPaymentMethodResult.isErr()) {
    if (pendingRedemption && coupon) {
      const rollbackResult = await pendingRedemption.rollback(coupon);
      if (rollbackResult.isErr()) {
        logger.error(
          { err: rollbackResult.error, workspaceId: owner.sId },
          "[Checkout] Failed to rollback coupon redemption after setDefaultPaymentMethod failure"
        );
      }
    }
    return new Err({ type: "payment_failed" });
  }

  if (shouldEnforceFirstPeriodPayment && effectiveSubtotalCents > 0) {
    const chargeResult = await chargeFirstPeriodInvoice({
      stripeCustomerId,
      paymentMethodId,
      billingPeriod,
      pricePerSeatCents,
      couponAmountCents,
      seatCount,
      setupSessionId,
      workspaceId: owner.sId,
      currency,
      couponCode,
    });
    if (chargeResult.isErr()) {
      if (pendingRedemption && coupon) {
        const rollbackResult = await pendingRedemption.rollback(coupon);
        if (rollbackResult.isErr()) {
          logger.error(
            { err: rollbackResult.error, workspaceId: owner.sId },
            "[Checkout] Failed to rollback coupon redemption after chargeFirstPeriodInvoice failure"
          );
        }
      }
      return new Err({ type: "payment_failed" });
    }
  }

  const provisionResult = await provisionMetronomeFirstPeriodSubscription({
    stripeCustomerId,
    currency,
    workspaceId: owner.sId,
    userId: user.sId,
    planCode,
    metronomePackageAlias,
    coupon,
    pendingRedemption,
    firstPeriodPaymentEnforced: shouldEnforceFirstPeriodPayment,
    firstPeriodPaymentCents: effectiveSubtotalCents,
    uniquenessKey: setupSessionId,
    now: new Date(),
  });

  if (provisionResult.isErr()) {
    logger.error(
      {
        panic: true,
        error: normalizeError(provisionResult.error).message,
        stripeCustomerId,
        currency,
        workspaceId: owner.sId,
        userId: user.sId,
        planCode,
        metronomePackageAlias,
        couponId: coupon?.sId,
        pendingRedemptionId: pendingRedemption?.sId,
        firstPeriodPaymentEnforced: shouldEnforceFirstPeriodPayment,
        firstPeriodPaymentCents: effectiveSubtotalCents,
        uniquenessKey: setupSessionId,
      },
      "[Checkout] Payment succeeded but Metronome provisioning failed"
    );
    return new Err({ type: "metronome_provisioning_failed" });
  }

  return new Ok({ success: true });
}
