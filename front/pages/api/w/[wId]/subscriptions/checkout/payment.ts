/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
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
import { wakeLock } from "@app/lib/wake_lock";
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
        | "internal_error"
        | "invalid_coupon";
    };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostCheckoutPaymentResponseBody>>,
  auth: Authenticator
): Promise<void> {
  return wakeLock(
    async () => {
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
          await SubscriptionResource.fetchActiveByWorkspaceModelId(
            workspace.id
          );
        if (activeSubscription?.metronomeContractId) {
          return res.status(200).json({ success: true });
        }
      }

      const stripe = getStripeClient();
      const setupSession = await stripe.checkout.sessions.retrieve(
        setupSessionId,
        {
          expand: ["setup_intent", "setup_intent.payment_method"],
        }
      );

      const setupIntent = setupSession.setup_intent;
      if (
        !setupIntent ||
        isString(setupIntent) ||
        setupIntent.status !== "succeeded"
      ) {
        return res.status(200).json({ error: "setup_failed" });
      }
      if (setupSession.client_reference_id !== owner.sId) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "Setup intent does not correspond to the current workspace.",
          },
        });
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
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message:
              "Setup session metadata is missing billingPeriod, seatCount or pricePerSeatCents.",
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

      const shouldEnforceFirstPeriodPayment =
        rawPaymentMethod !== null &&
        !isString(rawPaymentMethod) &&
        rawPaymentMethod.type === "card";

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

      // Coupon: validate + create pending redemption before charging.
      const couponCode = setupSession.metadata?.couponCode;
      let coupon: CouponResource | undefined;
      let pendingRedemption: CouponRedemptionResource | undefined;

      if (couponCode) {
        const found = await CouponResource.findByCode(couponCode);
        if (!found) {
          return res.status(200).json({ error: "invalid_coupon" });
        }
        const validation = found.validateRedemption();
        if (validation.isErr()) {
          return res.status(200).json({ error: "invalid_coupon" });
        }
        const existing =
          await CouponRedemptionResource.findActiveOrPendingByCouponAndWorkspace(
            auth,
            { coupon: found }
          );
        if (existing) {
          return res.status(200).json({ error: "invalid_coupon" });
        }
        const pendingResult = await CouponRedemptionResource.createPending(
          auth,
          { coupon: found }
        );
        if (pendingResult.isErr()) {
          logger.error(
            {
              workspaceId: owner.sId,
              couponCode,
              error: pendingResult.error.message,
            },
            "[Checkout] Failed to create pending coupon redemption"
          );
          return res.status(200).json({ error: "invalid_coupon" });
        }
        pendingRedemption = pendingResult.value;
        coupon = found;
      }

      const couponAmountCents = coupon ? coupon.amount * 100 : 0;
      const effectiveSubtotalCents = Math.max(
        0,
        subtotalCents - couponAmountCents
      );

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
              {
                err: rollbackResult.error,
                workspaceId: owner.sId,
              },
              "[Checkout] Failed to rollback coupon redemption after setDefaultPaymentMethod failure"
            );
          }
        }
        return res.status(200).json({ error: "payment_failed" });
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
          return res.status(200).json({ error: "payment_failed" });
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
        return res.status(500).json({ error: "metronome_error" });
      }

      return res.status(200).json({ success: true });
    },
    { endpoint: req.url ?? null }
  );
}

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
