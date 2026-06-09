import { updateMembershipSeatAndTrack } from "@app/lib/api/membership";
import {
  isMetronomeCheckoutEnabled,
  restoreWorkspaceAfterSubscription,
} from "@app/lib/api/subscription";
import { Authenticator } from "@app/lib/auth";
import {
  type CheckoutPayment,
  getCheckoutPaymentStatus,
  markCheckoutPaymentFailed,
  markCheckoutPaymentSucceeded,
  recordCheckoutPaymentSyncFailure,
  setCheckoutPaymentPending,
} from "@app/lib/credits/checkout_payment_status";
import { metronomeAmount } from "@app/lib/metronome/amounts";
import {
  addPaymentGatedCommitToContract,
  floorToHourISO,
} from "@app/lib/metronome/client";
import {
  CURRENCY_TO_CREDIT_TYPE_ID,
  getProductSeatSubscriptionCommitId,
  PAYMENT_GATE_TYPE_CUSTOM_FIELD_KEY,
  PAYMENT_GATE_TYPE_SUBSCRIPTION_ACTIVATION,
  SEAT_PRIORITY_SUBSCRIPTION_COMMIT,
} from "@app/lib/metronome/constants";
import {
  ensureMetronomeCustomerForWorkspace,
  provisionMetronomeContract,
} from "@app/lib/metronome/contracts";
import {
  createCouponCredit,
  getCreditTypeFromPackage,
} from "@app/lib/metronome/coupons";
import { invalidateContractCache } from "@app/lib/metronome/plan_type";
import { SEAT_TAG } from "@app/lib/metronome/setup_common";
import {
  getBillingCurrencyForCountry,
  resolvePackageAliasForCurrency,
} from "@app/lib/plans/billing_currency";
import {
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
  CREDIT_PRICED_FREE_PLAN_CODE,
  FREE_NO_PLAN_CODE,
} from "@app/lib/plans/plan_codes";
import {
  getStripeClient,
  setStripeCustomerDefaultPaymentMethod,
} from "@app/lib/plans/stripe";
import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import {
  isSupportedCurrency,
  type SupportedCurrency,
} from "@app/types/currency";
import type { MembershipSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import {
  type CheckoutBillingPeriod,
  CheckoutBillingPeriodSchema,
  type CheckoutSeatType,
  CheckoutSeatTypeSchema,
} from "./types";

export type BusinessActivationError =
  | { type: "not_on_free_plan" }
  | { type: "invalid_coupon" }
  | { type: "metronome_error"; message: string };

function checkoutToMembershipSeatType(
  seatType: CheckoutSeatType,
  billingPeriod: CheckoutBillingPeriod
): MembershipSeatType {
  switch (seatType) {
    case "pro":
      return billingPeriod === "yearly" ? "pro_yearly" : "pro";
    case "max":
      return billingPeriod === "yearly" ? "max_yearly" : "max";
    default:
      assertNever(seatType);
  }
}

/**
 * Create a payment-gated Business subscription activation for a workspace
 * currently on CP_FREE_PLAN.
 *
 * Sequence:
 *  1. Validate workspace is on CP_FREE_PLAN.
 *  2. Ensure/create Metronome customer (linked to Stripe).
 *  3. Provision Business Metronome contract (stamped with DUST_PAYMENT_GATE_TYPE
 *     so contract.start skips the automatic plan swap).
 *  4. Validate coupon + create pending redemption if applicable.
 *  5. Write Redis pending activation status (with couponRedemptionId).
 *  6. Create payment-gated commit (Metronome invoices and unlocks on payment).
 *
 * The payment_gate.payment_status webhook handles the actual plan swap and seat
 * update once payment succeeds.
 */
export async function createPaymentGatedBusinessActivation({
  workspace,
  stripeCustomerId,
  setupSessionId,
  targetUserId,
  seatType,
  billingPeriod,
  currency,
  pricePerSeatCents,
  metronomePackageAlias,
  couponCode,
  userId,
}: {
  workspace: WorkspaceResource;
  stripeCustomerId: string;
  setupSessionId: string;
  targetUserId: string;
  seatType: CheckoutSeatType;
  billingPeriod: CheckoutBillingPeriod;
  currency: SupportedCurrency;
  pricePerSeatCents: number;
  metronomePackageAlias: string;
  couponCode?: string;
  userId: string;
}): Promise<
  Result<
    { activationPending: true; contractId: string },
    BusinessActivationError
  >
> {
  const lightWorkspace = renderLightWorkspaceType({ workspace });

  const validCurrency = isSupportedCurrency(currency) ? currency : "usd";
  const resolvedPackageAlias = resolvePackageAliasForCurrency(
    metronomePackageAlias,
    validCurrency
  );

  // Step 1: workspace must be on CP_FREE_PLAN.
  const activeSubscription =
    await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
  const planCode = activeSubscription?.getPlan().code;
  if (
    !activeSubscription ||
    (planCode !== CREDIT_PRICED_FREE_PLAN_CODE &&
      planCode !== FREE_NO_PLAN_CODE)
  ) {
    return new Err({ type: "not_on_free_plan" });
  }

  // Step 2: ensure Metronome customer with Stripe billing config.
  const customerResult = await ensureMetronomeCustomerForWorkspace({
    workspace: lightWorkspace,
    stripeCustomerId,
  });
  if (customerResult.isErr()) {
    return new Err({
      type: "metronome_error",
      message: customerResult.error.message,
    });
  }
  const { metronomeCustomerId } = customerResult.value;

  // Step 3: provision Business Metronome contract.
  // The PAYMENT_GATE_TYPE custom field tells the contract.start webhook to skip
  // the automatic subscription swap — payment_gate.payment_status handles it.
  const now = new Date(floorToHourISO(new Date()));
  const uniquenessKey = `subscription-activation-${workspace.sId}-${setupSessionId}`;
  const contractResult = await provisionMetronomeContract({
    metronomeCustomerId,
    workspace: lightWorkspace,
    packageAlias: resolvedPackageAlias,
    uniquenessKey,
    startingAt: now,
    planCode: CREDIT_PRICED_BUSINESS_PLAN_CODE,
    additionalCustomFields: {
      [PAYMENT_GATE_TYPE_CUSTOM_FIELD_KEY]:
        PAYMENT_GATE_TYPE_SUBSCRIPTION_ACTIVATION,
    },
  });
  if (contractResult.isErr()) {
    return new Err({
      type: "metronome_error",
      message: contractResult.error.message,
    });
  }
  const { metronomeContractId } = contractResult.value;

  // Step 4: coupon validation + pending redemption.
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
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
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
          workspaceId: workspace.sId,
          couponCode,
          error: pendingResult.error.message,
        },
        "[Business Activation] Failed to create pending coupon redemption"
      );
      return new Err({ type: "invalid_coupon" });
    }
    pendingRedemption = pendingResult.value;
    coupon = found;
  }

  const couponAmountCents = coupon ? coupon.amount * 100 : 0;
  const effectiveAmountCents = Math.max(
    0,
    pricePerSeatCents - couponAmountCents
  );

  // Step 5: write Redis pending status BEFORE calling Metronome so the webhook
  // handler can update it even if it races ahead of this function returning.
  await setCheckoutPaymentPending({
    workspaceId: workspace.sId,
    contractId: metronomeContractId,
    userId,
    targetUserId,
    seatType,
    billingPeriod,
    currency,
    initialAmountCents: effectiveAmountCents,
    metronomePackageAlias: resolvedPackageAlias,
    planCode: CREDIT_PRICED_BUSINESS_PLAN_CODE,
    couponCode,
    couponRedemptionId: pendingRedemption?.sId,
    uniquenessKey,
  });

  // Step 6: zero-amount fast path — no invoice to create, activate immediately.
  if (effectiveAmountCents === 0) {
    await handleSubscriptionActivationSuccess({
      workspace,
      contractId: metronomeContractId,
      invoiceId: "free-activation",
    });
    logger.info(
      {
        workspaceId: workspace.sId,
        metronomeContractId,
        seatType,
        billingPeriod,
        currency,
      },
      "[Business Activation] Zero-amount activation — skipped payment-gated commit, activated directly"
    );
    return new Ok({ activationPending: true, contractId: metronomeContractId });
  }

  // Step 7: create payment-gated commit.
  // Access side: fiat credit that offsets the first period's seat subscription invoice.
  // Invoice side: same amount charged to the customer via Stripe.
  const fiatCreditTypeId = CURRENCY_TO_CREDIT_TYPE_ID[currency];
  const amountNative = metronomeAmount(effectiveAmountCents, currency);

  const accessEndingBefore = new Date(now);
  accessEndingBefore.setUTCFullYear(accessEndingBefore.getUTCFullYear() + 1);

  const commitResult = await addPaymentGatedCommitToContract({
    metronomeCustomerId,
    metronomeContractId,
    productId: getProductSeatSubscriptionCommitId(),
    accessAmount: amountNative,
    accessCreditTypeId: fiatCreditTypeId,
    accessStartingAt: now,
    accessEndingBefore,
    invoiceUnitPrice: amountNative,
    invoiceQuantity: 1,
    invoiceCreditTypeId: fiatCreditTypeId,
    invoiceTimestamp: now,
    priority: SEAT_PRIORITY_SUBSCRIPTION_COMMIT,
    applicableProducTags: [SEAT_TAG],
    name: `Business subscription activation (${seatType} ${billingPeriod})`,
    uniquenessKey,
    stripeInvoiceMetadata: {
      subscription_activation: "true",
      workspace_id: workspace.sId,
      setup_session_id: setupSessionId,
      user_id: userId,
      target_user_id: targetUserId,
      seat_type: seatType,
      billing_period: billingPeriod,
      plan_code: CREDIT_PRICED_BUSINESS_PLAN_CODE,
    },
  });

  if (commitResult.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        metronomeContractId,
        error: commitResult.error.message,
      },
      "[Business Activation] Failed to create payment-gated commit"
    );
    // No webhook will fire — mark the Redis entry failed immediately so the
    // frontend polling loop surfaces the error.
    await recordCheckoutPaymentSyncFailure({
      workspaceId: workspace.sId,
      contractId: metronomeContractId,
      errorMessage: commitResult.error.message,
    });
    return new Err({
      type: "metronome_error",
      message: commitResult.error.message,
    });
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      metronomeContractId,
      editId: commitResult.value.editId,
      seatType,
      billingPeriod,
      effectiveAmountCents,
      currency,
    },
    "[Business Activation] Payment-gated commit created — waiting for payment webhook"
  );

  return new Ok({ activationPending: true, contractId: metronomeContractId });
}

// ---------------------------------------------------------------------------
// Webhook activation handlers — called from process_webhook.ts
// ---------------------------------------------------------------------------

/**
 * Handle a successful payment_gate.payment_status webhook for a subscription
 * activation commit. Validates the Redis state, switches the workspace to
 * CP_BUSINESS_PLAN, updates the target user's seat type, and syncs Metronome.
 *
 * Fully idempotent: duplicate success webhooks are no-ops.
 */
export async function handleSubscriptionActivationSuccess({
  workspace,
  contractId,
  invoiceId,
}: {
  workspace: WorkspaceResource;
  contractId: string;
  invoiceId: string;
}): Promise<void> {
  const checkoutPayment = await getCheckoutPaymentStatus({
    workspaceId: workspace.sId,
    contractId,
  });

  if (!checkoutPayment) {
    // Not a subscription activation commit — nothing to do.
    return;
  }

  // Idempotency: already succeeded.
  if (checkoutPayment.status === "succeeded") {
    logger.info(
      { workspaceId: workspace.sId, contractId, invoiceId },
      "[Business Activation] payment_gate success: already marked succeeded, skipping"
    );
    return;
  }

  if (checkoutPayment.status !== "pending") {
    logger.warn(
      {
        workspaceId: workspace.sId,
        contractId,
        status: checkoutPayment.status,
      },
      "[Business Activation] payment_gate success: unexpected Redis status, skipping"
    );
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const lightWorkspace = renderLightWorkspaceType({ workspace });

  // Coupon credit: create on Business contract before switching plan.
  if (checkoutPayment.couponCode && checkoutPayment.couponRedemptionId) {
    const coupon = await CouponResource.findByCode(checkoutPayment.couponCode);
    const redemption = coupon
      ? await CouponRedemptionResource.fetchById(
          auth,
          checkoutPayment.couponRedemptionId
        )
      : null;
    if (coupon && redemption) {
      const creditTypeResult = await getCreditTypeFromPackage(
        checkoutPayment.metronomePackageAlias
      );
      if (creditTypeResult.isOk()) {
        const { creditTypeId, currency } = creditTypeResult.value;
        const creditResult = await createCouponCredit({
          metronomeCustomerId: workspace.metronomeCustomerId!,
          coupon,
          redemptionId: redemption.sId,
          redeemedAt: redemption.redeemedAt,
          creditTypeId,
          currency,
        });
        if (creditResult.isOk()) {
          await redemption.markActive(creditResult.value);
        } else {
          logger.error(
            {
              workspaceId: workspace.sId,
              couponCode: checkoutPayment.couponCode,
              error: creditResult.error.message,
            },
            "[Business Activation] Failed to create coupon credit on success — continuing"
          );
        }
      } else {
        logger.error(
          {
            workspaceId: workspace.sId,
            error: creditTypeResult.error.message,
          },
          "[Business Activation] Failed to get credit type for coupon — continuing"
        );
      }
    }
  }

  // Switch workspace DB subscription from CP_FREE_PLAN to CP_BUSINESS_PLAN.
  const activeSubscription =
    await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
  if (!activeSubscription) {
    logger.error(
      { workspaceId: workspace.sId, contractId },
      "[Business Activation] No active subscription found during webhook success — cannot activate"
    );
    return;
  }
  await activeSubscription.swapMetronomeContract({
    metronomeContractId: contractId,
    planCode: checkoutPayment.planCode,
  });
  await invalidateContractCache(workspace.sId);

  logger.info(
    { workspaceId: workspace.sId, contractId },
    "[Business Activation] Workspace switched to CP_BUSINESS_PLAN"
  );

  // Update target user membership seat type (also syncs Metronome seats).
  const targetUser = await UserResource.fetchById(checkoutPayment.targetUserId);
  if (!targetUser) {
    logger.error(
      {
        workspaceId: workspace.sId,
        targetUserId: checkoutPayment.targetUserId,
      },
      "[Business Activation] Target user not found during webhook success"
    );
  } else {
    const membershipSeatType = checkoutToMembershipSeatType(
      checkoutPayment.seatType,
      checkoutPayment.billingPeriod
    );
    const seatResult = await updateMembershipSeatAndTrack({
      user: targetUser,
      workspace: lightWorkspace,
      newSeatType: membershipSeatType,
      author: "no-author",
    });
    if (seatResult.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          targetUserId: checkoutPayment.targetUserId,
          membershipSeatType,
          error: seatResult.error,
        },
        "[Business Activation] Failed to update target user seat type"
      );
    } else {
      logger.info(
        {
          workspaceId: workspace.sId,
          targetUserId: checkoutPayment.targetUserId,
          membershipSeatType,
        },
        "[Business Activation] Target user seat updated"
      );
    }
  }

  // Restore workspace (unblock connectors, triggers, cancel scrub).
  await restoreWorkspaceAfterSubscription(auth);

  // Mark Redis activation succeeded.
  await markCheckoutPaymentSucceeded({
    workspaceId: workspace.sId,
    contractId,
    invoiceId,
  });

  logger.info(
    { workspaceId: workspace.sId, contractId, invoiceId },
    "[Business Activation] Subscription activation succeeded"
  );
}

/**
 * Handle a failed payment_gate.payment_status webhook for a subscription
 * activation commit. Keeps the workspace on CP_FREE_PLAN, rolls back the coupon
 * redemption, and updates the Redis status so the polling UI can surface the error.
 *
 * Fully idempotent: duplicate failure webhooks are no-ops.
 *
 * Open question (spec §15.1): whether to cancel/sunset the Business Metronome
 * contract after failure is left as a manual/future cleanup step.
 */
export async function handleSubscriptionActivationFailure({
  workspace,
  contractId,
  invoiceId,
  errorMessage,
}: {
  workspace: WorkspaceResource;
  contractId: string;
  invoiceId: string | undefined;
  errorMessage: string;
}): Promise<void> {
  const checkoutPayment = await getCheckoutPaymentStatus({
    workspaceId: workspace.sId,
    contractId,
  });

  if (!checkoutPayment) {
    return;
  }

  // Already in a terminal state — idempotent no-op.
  if (checkoutPayment.status !== "pending") {
    return;
  }

  // Rollback pending coupon redemption.
  if (checkoutPayment.couponCode && checkoutPayment.couponRedemptionId) {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const coupon = await CouponResource.findByCode(checkoutPayment.couponCode);
    const redemption = coupon
      ? await CouponRedemptionResource.fetchById(
          auth,
          checkoutPayment.couponRedemptionId
        )
      : null;
    if (coupon && redemption) {
      const rollbackResult = await redemption.rollback(coupon);
      if (rollbackResult.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            couponCode: checkoutPayment.couponCode,
            error: rollbackResult.error.message,
          },
          "[Business Activation] Failed to rollback coupon redemption on payment failure"
        );
      }
    }
  }

  await markCheckoutPaymentFailed({
    workspaceId: workspace.sId,
    contractId,
    errorMessage,
    invoiceId,
  });

  logger.warn(
    {
      workspaceId: workspace.sId,
      contractId,
      invoiceId,
      errorMessage,
    },
    "[Business Activation] Subscription activation failed — workspace remains on CP_FREE_PLAN"
  );
}

export { checkoutToMembershipSeatType };

// ---------------------------------------------------------------------------
// HTTP-layer entry point — called from the POST /checkout/business-activation
// route handler.
// ---------------------------------------------------------------------------

export type BusinessActivationRequestError =
  | { type: "checkout_not_enabled" }
  | { type: "setup_failed" }
  | { type: "workspace_mismatch" }
  | { type: "missing_metadata" }
  | { type: "missing_customer_id" }
  | { type: "missing_payment_method" }
  | { type: "customer_deleted" }
  | { type: "non_card_payment_method" }
  | { type: "payment_failed" }
  | { type: "target_user_not_found" }
  | { type: "not_on_free_plan" }
  | { type: "invalid_coupon" }
  | { type: "metronome_error" };

export type PostBusinessActivationResponseBody =
  | { activationPending: true; contractId: string }
  | {
      error:
        | "setup_failed"
        | "payment_failed"
        | "metronome_error"
        | "internal_error"
        | "invalid_coupon";
    };

export type GetBusinessActivationResponseBody = {
  checkoutPayment: CheckoutPayment | null;
};

/**
 * Validate the completed Stripe setup session and kick off a payment-gated
 * Business subscription activation. Card-only — SEPA is not supported for
 * this flow.
 *
 * Called from POST /api/w/:wId/subscriptions/checkout/business-activation.
 */
export async function processBusinessActivation(
  auth: Authenticator,
  setupSessionId: string
): Promise<
  Result<
    { activationPending: true; contractId: string },
    BusinessActivationRequestError
  >
> {
  if (!(await isMetronomeCheckoutEnabled(auth))) {
    return new Err({ type: "checkout_not_enabled" });
  }

  const owner = auth.getNonNullableWorkspace();
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
    billingPeriod: billingPeriodRaw,
    pricePerSeatCents: pricePerSeatCentsStr,
    seatType: seatTypeRaw,
    targetUserId: targetUserIdRaw,
  } = setupSession.metadata ?? {};

  const seatTypeParsed = CheckoutSeatTypeSchema.safeParse(seatTypeRaw);
  const billingPeriodParsed =
    CheckoutBillingPeriodSchema.safeParse(billingPeriodRaw);
  if (
    !seatTypeParsed.success ||
    !billingPeriodParsed.success ||
    !isString(pricePerSeatCentsStr)
  ) {
    return new Err({ type: "missing_metadata" });
  }
  const seatType = seatTypeParsed.data;
  const billingPeriod = billingPeriodParsed.data;
  const pricePerSeatCents = Number(pricePerSeatCentsStr);

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

  // Card-only for this iteration.
  const isCardPayment =
    rawPaymentMethod !== null &&
    !isString(rawPaymentMethod) &&
    rawPaymentMethod.type === "card";
  if (!isCardPayment) {
    return new Err({ type: "non_card_payment_method" });
  }

  const customer = await stripe.customers.retrieve(stripeCustomerId);
  if (customer.deleted) {
    return new Err({ type: "customer_deleted" });
  }

  const country = customer.address?.country ?? "US";
  const currency = getBillingCurrencyForCountry(country, true);

  const setDefaultResult = await setStripeCustomerDefaultPaymentMethod({
    stripeCustomerId,
    paymentMethodId,
    workspaceId: owner.sId,
  });
  if (setDefaultResult.isErr()) {
    return new Err({ type: "payment_failed" });
  }

  // Resolve target user — defaults to the current user for onboarding subscribe.
  const effectiveTargetUserId =
    isString(targetUserIdRaw) && targetUserIdRaw
      ? targetUserIdRaw
      : auth.getNonNullableUser().sId;

  // Only admins may check out on behalf of another user.
  if (
    effectiveTargetUserId !== auth.getNonNullableUser().sId &&
    !auth.isAdmin()
  ) {
    return new Err({ type: "workspace_mismatch" });
  }

  const targetUser = await UserResource.fetchById(effectiveTargetUserId);
  if (!targetUser) {
    return new Err({ type: "target_user_not_found" });
  }
  const lightWorkspace = renderLightWorkspaceType({ workspace: owner });
  const targetMembership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user: targetUser,
      workspace: lightWorkspace,
    });
  if (!targetMembership) {
    return new Err({ type: "target_user_not_found" });
  }

  const workspace = await WorkspaceResource.fetchById(owner.sId);
  if (!workspace) {
    return new Err({ type: "missing_customer_id" });
  }

  const metronomePackageAlias =
    setupSession.metadata?.metronomePackageAlias ?? "";

  const activationResult = await createPaymentGatedBusinessActivation({
    workspace,
    stripeCustomerId,
    setupSessionId,
    targetUserId: effectiveTargetUserId,
    seatType,
    billingPeriod,
    currency,
    pricePerSeatCents,
    metronomePackageAlias,
    couponCode: setupSession.metadata?.couponCode,
    userId: auth.getNonNullableUser().sId,
  });

  if (activationResult.isErr()) {
    switch (activationResult.error.type) {
      case "not_on_free_plan":
        return new Err({ type: "not_on_free_plan" });
      case "invalid_coupon":
        return new Err({ type: "invalid_coupon" });
      case "metronome_error":
        return new Err({ type: "metronome_error" });
    }
  }

  return new Ok(activationResult.value);
}
