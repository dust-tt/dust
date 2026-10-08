import { PaymentMethodRow } from "@app/components/checkout/PaymentMethodRow";
import { seatTypeDisplayName } from "@app/components/workspace/billing/seatTypeUtils";
import { useDocumentScrollMode } from "@app/hooks/useDocumentScrollMode";
import { useFormatErrorDescription } from "@app/hooks/useFormatErrorDescription";
import config from "@app/lib/api/config";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import {
  CP_MAX_SEAT_COST_MONTHLY,
  CP_MAX_SEAT_COST_YEARLY,
  CP_PRO_SEAT_COST_MONTHLY,
  CP_PRO_SEAT_COST_YEARLY,
  getPriceAsString,
  useIsMetronomeCheckout,
  useRedirectAwayFromCheckoutIfAlreadyPaid,
  useUserBillingCurrency,
} from "@app/lib/client/subscription";
import { formatNumber } from "@app/lib/i18n/format";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  useAuthContext,
  useCheckBusinessActivation,
  useCheckoutReceiptUrl,
  useCreateCheckoutSession,
  useInitiateBusinessActivation,
  usePreparePayment,
  useValidateCoupon,
} from "@app/lib/swr/workspaces";
import type { CouponType } from "@app/types/coupon";
import type { BillingPeriod } from "@app/types/plan";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  CheckCircle,
  Chip,
  DustLogoSquare,
  Icon,
  Input,
  Spinner,
  Tag01,
  XCircle,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// Lazily initialised at module level so Stripe.js is loaded only when the embedded
// checkout is actually rendered, and never re-loaded on re-renders.
let stripePromise: ReturnType<typeof loadStripe> | null = null;
function getStripePromise() {
  if (!stripePromise) {
    stripePromise = loadStripe(config.getStripePublishableKey());
  }
  return stripePromise;
}

function getCouponFormSchema(t: (descriptor: MessageDescriptor) => string) {
  return z.object({
    couponCode: z.string().min(1, t(msg`Please enter a promotion code`)),
  });
}

type CouponFormValues = z.infer<ReturnType<typeof getCouponFormSchema>>;

type CheckoutPhase =
  | "card_capture" // Phase 1 — Stripe setup iframe
  | "payment_review" // Phase 2 — tax breakdown + confirm button
  | "confirming" // Phase 3 — POST /business-activation
  | "waiting_for_payment" // Phase 4 — polling Redis for Metronome webhook result
  | "checkout_success" // Phase 5 — success screen, user continues manually
  | "error"; // Terminal error

type PhaseError =
  | { kind: "setup_failed" }
  | { kind: "payment_failed" }
  | { kind: "metronome_error" }
  | { kind: "internal_error" }
  | { kind: "invalid_coupon" }
  | { kind: "activation_failed" }
  | { kind: "generic" };

function useBillingPeriodParam(): BillingPeriod {
  const raw = useSearchParam("billingPeriod");
  return raw === "yearly" ? "yearly" : "monthly";
}

function useSeatTypeParam(): "pro" | "max" | null {
  const raw = useSearchParam("seatType");
  return raw === "pro" || raw === "max" ? raw : null;
}

export function CheckoutPage() {
  const { t } = useLingui();
  const owner = useWorkspace();
  const router = useAppRouter();
  const billingPeriod = useBillingPeriodParam();
  const seatType = useSeatTypeParam();
  const targetUserId = useSearchParam("targetUserId");
  const { mutateAuthContext } = useAuthContext({ workspaceId: owner.sId });
  const shouldRedirectAwayFromCheckout =
    useRedirectAwayFromCheckoutIfAlreadyPaid();

  // On mobile the two panes stack vertically; enable document scroll so the
  // whole page (not just each pane) can scroll to reach the payment fields.
  const isMobile = useIsMobile();
  useDocumentScrollMode(isMobile);

  // Determine if CP checkout is enabled.
  const isMetronomeCheckout = useIsMetronomeCheckout();

  const [phase, setPhase] = useState<CheckoutPhase>("card_capture");
  const [phaseError, setPhaseError] = useState<PhaseError | null>(null);
  const [setupSessionId, setSetupSessionId] = useState<string | null>(null);
  // Prevents initSession from firing before URL params have been read on mount.
  const [isInitialized, setIsInitialized] = useState(false);

  // Read setup_session_id from URL on mount, then clean up the URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    const sessionId = url.searchParams.get("setup_session_id");
    url.searchParams.delete("setup_session_id");
    history.replaceState({}, "", url.toString());
    if (sessionId) {
      setSetupSessionId(sessionId);
      setPhase("payment_review");
    }
    setIsInitialized(true);
  }, []);

  // Card capture phase state.
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isSessionRefreshing, setIsSessionRefreshing] = useState(false);
  const [showCouponInput, setShowCouponInput] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<CouponType | null>(null);

  // Ref to prevent double-fire of the confirm effect.
  const confirmCalledRef = useRef(false);
  // Once the user has gone through card_capture at least once, skip the full-page
  // spinner on restart so the two-pane layout stays visible.
  const hasHadSessionRef = useRef(false);
  // Coupon code to pass to initSession when restarting from payment_review ("Change" button).
  // Cleared after each use so normal restarts and error retries start without a coupon.
  const pendingCouponForRestartRef = useRef<string | undefined>(undefined);

  const { createSession, isCreating } = useCreateCheckoutSession({
    workspaceId: owner.sId,
  });
  const { initiateBusinessActivation } = useInitiateBusinessActivation({
    workspaceId: owner.sId,
  });
  const { validateCoupon } = useValidateCoupon({ workspaceId: owner.sId });
  const formatErrorDescription = useFormatErrorDescription();

  const {
    preparePayment: livePreparePayment,
    isPreparePaymentLoading,
    isPreparePaymentError,
  } = usePreparePayment({
    workspaceId: owner.sId,
    setupSessionId,
    disabled: phase !== "payment_review",
  });

  const [preparePayment, setPreparePayment] =
    useState<typeof livePreparePayment>(null);
  useEffect(() => {
    if (livePreparePayment) {
      setPreparePayment(livePreparePayment);
    }
  }, [livePreparePayment]);

  // Poll the checkout status (by setup session id) from the confirming step
  // onward, so the stepper advances live — including the coupon (zero-payment)
  // flow, whose whole activation happens inside the confirming request. Status
  // only (no receipt URL) so the poll stays fast and we transition on
  // `succeeded` without waiting on the slow Stripe invoice-URL fetch.
  const isActivating =
    phase === "confirming" || phase === "waiting_for_payment";
  const { checkoutPayment } = useCheckBusinessActivation({
    workspaceId: owner.sId,
    setupSessionId,
    disabled: !isActivating,
    pollIntervalMs: 1500,
  });

  // Lazily fetch the Stripe receipt URL once on the success screen, so the "View
  // receipt" button appears when ready without blocking the success transition.
  const { receiptUrl } = useCheckoutReceiptUrl({
    workspaceId: owner.sId,
    setupSessionId,
    disabled: phase !== "checkout_success",
  });

  // React to Redis activation status. Runs from the confirming step too: for a
  // coupon checkout the record can reach `succeeded` before the confirming POST
  // resolves (see handleConfirmPayment, which won't clobber this transition).
  useEffect(() => {
    if (!isActivating || !checkoutPayment) {
      return;
    }
    if (checkoutPayment.status === "succeeded") {
      setPhase("checkout_success");
      void mutateAuthContext();
    } else if (checkoutPayment.status === "failed") {
      setPhaseError({ kind: "activation_failed" });
      setPhase("error");
    }
    // pending: keep polling
  }, [isActivating, checkoutPayment, mutateAuthContext]);

  const couponFormSchema = useMemo(() => getCouponFormSchema(t), [t]);
  const {
    register: registerCoupon,
    handleSubmit: handleCouponSubmit,
    watch: watchCoupon,
    reset: resetCoupon,
    setError: setCouponError,
    formState: { errors: couponErrors, isSubmitting: isApplyingCoupon },
  } = useForm<CouponFormValues>({
    resolver: zodResolver(couponFormSchema),
    defaultValues: { couponCode: "" },
  });

  const couponCodeValue = watchCoupon("couponCode");

  const fallbackCurrency = useUserBillingCurrency();

  const initSession = useCallback(
    async (couponCodeArg?: string) => {
      setClientSecret(null);
      const result = await createSession({
        billingPeriod,
        couponCode: couponCodeArg,
        ...(isMetronomeCheckout && seatType
          ? {
              seatType,
              targetUserId: targetUserId ?? undefined,
            }
          : {}),
      });
      if (!result) {
        void router.back();
        return;
      }
      switch (result.mode) {
        case "embedded":
          setClientSecret(result.clientSecret);
          setSetupSessionId(result.sessionId);
          return;
        case "hosted":
          void router.push(result.checkoutUrl);
          return;
        default:
          assertNeverAndIgnore(result);
      }
    },
    [
      billingPeriod,
      createSession,
      router,
      isMetronomeCheckout,
      seatType,
      targetUserId,
    ]
  );

  // Force light mode — Stripe embedded checkout does not support dark mode.
  useEffect(() => {
    const htmlEl = document.documentElement;
    const hadDark = htmlEl.classList.contains("dark");
    htmlEl.classList.remove("dark");

    return () => {
      if (hadDark) {
        htmlEl.classList.add("dark");
      }
    };
  }, []);

  // Phase "card_capture": init (or re-init on billingPeriod change).
  // Reads pendingCouponForRestartRef so that "Change" restarts preserve the applied coupon.
  useEffect(() => {
    if (!isInitialized || phase !== "card_capture") {
      return;
    }
    const couponCode = pendingCouponForRestartRef.current;
    pendingCouponForRestartRef.current = undefined;
    void initSession(couponCode);
  }, [isInitialized, phase, initSession]);

  const handleConfirmPayment = useCallback(async () => {
    if (!setupSessionId || confirmCalledRef.current) {
      return;
    }
    confirmCalledRef.current = true;
    setPhase("confirming");

    // CP path: dedicated business activation endpoint — always returns
    // activationPending or an error, never a direct success.
    const result = await initiateBusinessActivation({ setupSessionId });
    if (!result) {
      setPhaseError({ kind: "generic" });
      setPhase("error");
      return;
    }
    if ("error" in result) {
      switch (result.error) {
        case "setup_failed":
          setPhaseError({ kind: "setup_failed" });
          break;
        case "payment_failed":
          setPhaseError({ kind: "payment_failed" });
          break;
        case "metronome_error":
          setPhaseError({ kind: "metronome_error" });
          break;
        case "internal_error":
          setPhaseError({ kind: "internal_error" });
          break;
        case "invalid_coupon":
          setPhaseError({ kind: "invalid_coupon" });
          break;
        default:
          assertNeverAndIgnore(result.error);
          setPhaseError({ kind: "generic" });
      }
      setPhase("error");
      return;
    }
    // Only advance to waiting_for_payment if the poll hasn't already moved us on
    // (a coupon activation can reach succeeded/failed while this POST is still
    // in flight). Overwriting would flicker success → waiting → success.
    setPhase((prev) => (prev === "confirming" ? "waiting_for_payment" : prev));
  }, [setupSessionId, initiateBusinessActivation]);

  const handleCardCaptureComplete = useCallback(() => {
    setPhase("payment_review");
  }, []);

  const handleRestart = useCallback(() => {
    hasHadSessionRef.current = true;
    setClientSecret(null);
    setSetupSessionId(null);
    setPhaseError(null);
    setAppliedCoupon(null);
    setPreparePayment(null);
    pendingCouponForRestartRef.current = undefined;
    resetCoupon();
    confirmCalledRef.current = false;
    setPhase("card_capture");
  }, [resetCoupon]);

  // Called by the "Change" button in payment_review.
  // Preserves the applied coupon.
  const handleChangePaymentMethod = useCallback(() => {
    hasHadSessionRef.current = true;
    setClientSecret(null);
    setSetupSessionId(null);
    setPhaseError(null);
    pendingCouponForRestartRef.current = appliedCoupon?.code;
    confirmCalledRef.current = false;
    setPreparePayment(null);
    setPhase("card_capture");
  }, [appliedCoupon]);

  const handleRemoveCoupon = async () => {
    setAppliedCoupon(null);
    resetCoupon();
    setPreparePayment(null);
    setIsSessionRefreshing(true);
    await initSession();
    setIsSessionRefreshing(false);
  };

  const handleApplyCoupon = handleCouponSubmit(async ({ couponCode }) => {
    const result = await validateCoupon(couponCode.trim(), "subscription");
    if (!result.ok) {
      setCouponError("couponCode", {
        message: formatErrorDescription(result.error),
      });
      return;
    }
    setAppliedCoupon(result.coupon);
    setShowCouponInput(false);
    setIsSessionRefreshing(true);
    await initSession(couponCode.trim());
    setIsSessionRefreshing(false);
  });

  // When a coupon fully covers the cost there is nothing to charge: the backend
  // skips the payment-gated commit and activates directly, so we drop the
  // "Processing payment" step and go straight to "Activating your workspace".
  // Detected from the prepared total (available during confirming) or, once
  // polling, from the server-computed amount on the checkout record.
  const isZeroPaymentCheckout =
    preparePayment?.totalCents === 0 ||
    checkoutPayment?.initialAmountCents === 0;

  const checkoutSteps = isZeroPaymentCheckout
    ? CHECKOUT_STEPS_NO_PAYMENT
    : CHECKOUT_STEPS;

  // Active step, driven by the polled checkout record's state (which we now poll
  // from the confirming step onward):
  // - record progress "activating" (markCheckoutPaymentActivating): the final
  //   "Activating your workspace" step — checked first so it wins even while the
  //   confirming POST is still in flight (the coupon flow activates in there).
  // - confirming, record still pending (setCheckoutPaymentPending): "Setting up
  //   your subscription" (step 0).
  // - waiting_for_payment, record still pending: "Processing payment" for a paid
  //   checkout; still "Setting up" for a zero-payment one (nothing to charge).
  const activeStepIndex =
    checkoutPayment?.progress === "activating"
      ? checkoutSteps.length - 1
      : phase === "confirming"
        ? 0
        : isZeroPaymentCheckout
          ? 0
          : 1;

  const showActualTax = preparePayment !== null;

  const currency = showActualTax ? preparePayment.currency : fallbackCurrency;

  // Compute seat price for order summary.
  // CP checkout: USD prices only. Yearly = per-month price × 12.
  const monthlyPrice =
    seatType === "pro" ? CP_PRO_SEAT_COST_MONTHLY : CP_MAX_SEAT_COST_MONTHLY;
  const yearlyMonthlyPrice =
    seatType === "pro" ? CP_PRO_SEAT_COST_YEARLY : CP_MAX_SEAT_COST_YEARLY;
  const seatPriceCents =
    billingPeriod === "monthly"
      ? monthlyPrice * 100
      : yearlyMonthlyPrice * 12 * 100;

  const seatCountForSummary = 1;
  const subtotalCents = seatPriceCents * seatCountForSummary;
  const couponDiscountCents =
    appliedCoupon !== null
      ? Math.min(appliedCoupon.amount * 100, subtotalCents)
      : 0;
  const totalDueTodayCents = subtotalCents - couponDiscountCents;

  // Plan display name.
  const planDisplayName = seatType === "pro" ? t`Pro seat` : t`Max seat`;

  const couponAmount = appliedCoupon
    ? getPriceAsString({ currency, priceInCents: appliedCoupon.amount * 100 })
    : "";
  const couponDurationMonths = appliedCoupon?.durationMonths ?? 1;
  const couponValidityLabel = t`${couponAmount} valid for ${plural(
    couponDurationMonths,
    { one: "# month", other: "# months" }
  )}`;

  if (!isInitialized) {
    return null;
  }

  if (shouldRedirectAwayFromCheckout) {
    return null;
  }

  // Full-page spinner only on first load (and hosted redirect). After a restart the
  // two-pane layout stays visible and the right pane shows its own spinner.
  const isInitialLoading =
    phase === "card_capture" && !clientSecret && !hasHadSessionRef.current;

  if (!isSessionRefreshing && isInitialLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </main>
    );
  }

  if (phase === "checkout_success") {
    return (
      <CheckoutSuccessPage
        seatType={seatType}
        receiptUrl={receiptUrl}
        owner={owner}
      />
    );
  }

  return (
    <main className="flex min-h-screen flex-col md:flex-row md:overflow-hidden">
      {/* Left pane: order summary + coupon */}
      <div className="flex w-full flex-col gap-14 overflow-y-auto bg-muted-background p-6 md:w-1/2 md:p-24">
        <div>
          <Icon visual={DustLogoSquare} size="lg" />
        </div>

        <div className="flex flex-col gap-11">
          <div className="flex flex-col">
            <h1 className="text-5xl font-semibold text-foreground">
              {planDisplayName}
            </h1>
            <span className="text-sm text-muted-foreground">
              {billingPeriod === "yearly"
                ? t`billed annually`
                : t`billed monthly`}
            </span>
          </div>

          <div className="flex flex-col text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                <Trans>Price per seat</Trans>
              </span>
              <span>
                {getPriceAsString({
                  currency,
                  priceInCents: showActualTax
                    ? preparePayment.pricePerSeatCents
                    : seatPriceCents,
                })}
              </span>
            </div>
            <div className="mt-3 flex justify-between">
              <span className="text-muted-foreground">
                <Trans>Number of seats</Trans>
              </span>
              <span>
                {showActualTax ? preparePayment.seatCount : seatCountForSummary}
              </span>
            </div>
            <div className="mt-6 flex justify-between border-t border-separator pt-3">
              <span className="text-lg">
                <Trans>Subtotal</Trans>
              </span>
              <span className="text-base">
                {getPriceAsString({
                  currency,
                  priceInCents: showActualTax
                    ? preparePayment.subtotalCents
                    : subtotalCents,
                })}
              </span>
            </div>

            <div
              className={
                phase === "card_capture" || appliedCoupon ? "min-h-20" : ""
              }
            >
              {!appliedCoupon &&
                phase === "card_capture" &&
                (showCouponInput ? (
                  <div className="my-4 flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder={t`Enter promotion code`}
                        {...registerCoupon("couponCode")}
                        disabled={isApplyingCoupon}
                        className="flex-1"
                      />
                      <Button
                        label={isApplyingCoupon ? t`Applying…` : t`Apply`}
                        disabled={isApplyingCoupon || !couponCodeValue.trim()}
                        onClick={handleApplyCoupon}
                        size="sm"
                        variant="outline"
                      />
                    </div>
                    {couponErrors.couponCode && (
                      <p className="text-sm text-warning-500">
                        {couponErrors.couponCode.message}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="my-4">
                    <button
                      type="button"
                      onClick={() => setShowCouponInput(true)}
                      className="text-sm font-semibold underline"
                    >
                      <Trans>Add promotion code</Trans>
                    </button>
                  </div>
                ))}

              {appliedCoupon && (
                <div className="my-4 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <Chip
                      size="xs"
                      color="primary"
                      icon={Tag01}
                      label={appliedCoupon.code}
                      onRemove={
                        phase === "card_capture"
                          ? handleRemoveCoupon
                          : undefined
                      }
                    />
                    <span className="text-sm text-success-500">
                      −
                      {getPriceAsString({
                        currency,
                        priceInCents: couponDiscountCents,
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {couponValidityLabel}
                  </p>
                </div>
              )}
            </div>

            {phase !== "card_capture" ? (
              <>
                <div className="mt-3 flex justify-between">
                  <span className="text-lg">
                    <Trans>Taxes</Trans>
                  </span>
                  <span className="text-base">
                    {showActualTax
                      ? getPriceAsString({
                          currency,
                          priceInCents: preparePayment.taxCents,
                        })
                      : "—"}
                  </span>
                </div>
                <div className="mt-3 flex justify-between border-t border-separator pt-3">
                  <span className="text-lg font-semibold">
                    <Trans>Total due with taxes</Trans>
                  </span>
                  <span className="text-base font-semibold">
                    {showActualTax
                      ? getPriceAsString({
                          currency,
                          priceInCents: preparePayment.totalCents,
                        })
                      : "—"}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between border-t border-separator pt-3">
                  <span className="text-lg font-semibold">
                    <Trans>Total due excl. taxes</Trans>
                  </span>
                  <span className="text-base font-semibold">
                    {getPriceAsString({
                      currency,
                      priceInCents: totalDueTodayCents,
                    })}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  <Trans>
                    Your country selection determines the applicable taxes and
                    billing currency.
                  </Trans>
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right pane: phase-dependent content.
          payment_review + error + confirming/waiting_for_payment (progress steps): top padding of 296px aligns
          content with the "Price per seat" row in the left pane.
          card_capture (with Stripe iframe): uniform p-24 with no centering so the iframe fills from the top.
          All other phases (spinners): centered. */}
      <div
        className={`flex w-full flex-col overflow-y-auto bg-white md:w-1/2 ${
          phase === "card_capture" && clientSecret
            ? "p-6 md:p-24"
            : phase === "payment_review" ||
                phase === "error" ||
                phase === "confirming" ||
                phase === "waiting_for_payment"
              ? "p-6 md:px-24 md:pb-24 md:pt-[296px]"
              : "items-center justify-center p-6 md:p-24"
        }`}
      >
        <RightPane
          phase={phase}
          phaseError={phaseError}
          checkoutSteps={checkoutSteps}
          activeStepIndex={activeStepIndex}
          clientSecret={clientSecret}
          isCreating={isCreating}
          isPreparePaymentLoading={isPreparePaymentLoading}
          isPreparePaymentError={isPreparePaymentError}
          cardBrand={preparePayment?.cardBrand}
          cardLast4={preparePayment?.cardLast4}
          sepaLast4={preparePayment?.sepaLast4}
          onRestart={handleRestart}
          onChangePaymentMethod={handleChangePaymentMethod}
          onConfirmPayment={handleConfirmPayment}
          onCardCaptureComplete={handleCardCaptureComplete}
        />
      </div>
    </main>
  );
}

interface CheckoutSuccessPageProps {
  seatType: "pro" | "max" | null;
  receiptUrl: string | null;
  owner: LightWorkspaceType;
}

function CheckoutSuccessPage({
  seatType,
  receiptUrl,
  owner,
}: CheckoutSuccessPageProps) {
  const { t } = useLingui();
  const router = useAppRouter();
  const planName = seatTypeDisplayName(seatType === "max" ? "max" : "pro", t);
  const monthlyCredits = formatNumber(seatType === "max" ? 40_000 : 8_000);

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4 bg-white px-6 pb-24 pt-6">
      <Icon visual={CheckCircle} size="2xl" className="text-success-500" />
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          <Trans>You're all set!</Trans>
        </h1>
        <p className="text-base text-muted-foreground">
          <Trans>
            Your <span className="font-semibold">{planName}</span> seat is ready
            with <span className="font-semibold">{monthlyCredits}</span> credits
            a month. Let's build something.
          </Trans>
        </p>
      </div>
      <div className="flex gap-4">
        {receiptUrl && (
          <Button
            label={t`View receipt`}
            variant="outline"
            size="md"
            onClick={() => window.open(receiptUrl, "_blank")}
          />
        )}
        <Button
          label={t`Start building`}
          size="md"
          onClick={() => void router.replace(`/w/${owner.sId}`)}
        />
      </div>
    </main>
  );
}

interface RightPaneProps {
  phase: CheckoutPhase;
  phaseError: PhaseError | null;
  checkoutSteps: readonly MessageDescriptor[];
  activeStepIndex: number;
  clientSecret: string | null;
  isCreating: boolean;
  isPreparePaymentLoading: boolean;
  isPreparePaymentError: boolean;
  cardBrand?: string;
  cardLast4?: string;
  sepaLast4?: string;
  onRestart: () => void;
  onChangePaymentMethod: () => void;
  onConfirmPayment: () => void;
  onCardCaptureComplete: () => void;
}

function RightPane({
  phase,
  phaseError,
  checkoutSteps,
  activeStepIndex,
  clientSecret,
  isCreating,
  isPreparePaymentLoading,
  isPreparePaymentError,
  cardBrand,
  cardLast4,
  sepaLast4,
  onRestart,
  onChangePaymentMethod,
  onConfirmPayment,
  onCardCaptureComplete,
}: RightPaneProps) {
  const { t } = useLingui();

  switch (phase) {
    case "card_capture":
      if (isCreating || !clientSecret) {
        return <Spinner size="lg" />;
      }
      return (
        <div className="pb-24">
          <EmbeddedCheckoutProvider
            stripe={getStripePromise()}
            options={{ clientSecret, onComplete: onCardCaptureComplete }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      );

    case "payment_review":
      if (isPreparePaymentError) {
        return (
          <CheckoutError
            title={t`Couldn't load payment details`}
            description={
              <>
                <Trans>
                  Your payment was not processed and you have not been charged.
                  Please try again.
                </Trans>
                <br />
                <Trans>
                  If the issue persists, contact us at{" "}
                  <a
                    href="mailto:support@dust.tt"
                    className="text-primary underline"
                  >
                    support@dust.tt
                  </a>
                  .
                </Trans>
              </>
            }
            onRetry={onRestart}
          />
        );
      }
      return (
        <div
          className={`flex w-full flex-col gap-4 ${isPreparePaymentLoading ? "items-center" : ""}`}
        >
          {isPreparePaymentLoading ? (
            <Spinner size="lg" />
          ) : (
            <>
              <div className="flex flex-col gap-1 pb-4">
                <h2 className="text-2xl font-semibold text-foreground">
                  <Trans>Select payment method</Trans>
                </h2>
                <p className="text-sm text-muted-foreground">
                  <Trans>Your available payment method is shown below</Trans>
                </p>
              </div>
              {cardBrand && cardLast4 ? (
                <PaymentMethodRow
                  paymentMethod={{
                    type: "card",
                    brand: cardBrand,
                    last4: cardLast4,
                  }}
                  onRestart={onChangePaymentMethod}
                />
              ) : sepaLast4 ? (
                <PaymentMethodRow
                  paymentMethod={{ type: "sepa_debit", last4: sepaLast4 }}
                  onRestart={onChangePaymentMethod}
                />
              ) : null}
              <Button
                label={t`Confirm payment`}
                onClick={onConfirmPayment}
                size="md"
                className="w-full"
              />
            </>
          )}
        </div>
      );

    case "confirming":
    case "waiting_for_payment":
      return (
        <CheckoutProgress
          steps={checkoutSteps}
          activeStepIndex={activeStepIndex}
        />
      );

    case "checkout_success":
      return null;

    case "error":
      switch (phaseError?.kind) {
        case "metronome_error":
          return (
            <CheckoutError
              title={t`Something went wrong with your subscription`}
              description={
                <>
                  <Trans>
                    Your subscription could not be activated. You have not been
                    charged. Please try again.
                  </Trans>
                  <br />
                  <Trans>
                    If the issue persists, contact us at{" "}
                    <a
                      href="mailto:support@dust.tt"
                      className="text-primary underline"
                    >
                      support@dust.tt
                    </a>
                    .
                  </Trans>
                </>
              }
              onRetry={onRestart}
            />
          );
        case "invalid_coupon":
          return (
            <CheckoutError
              title={t`Coupon no longer valid`}
              description={t`This coupon is no longer valid. You have not been charged. Please try again with a different code.`}
              onRetry={onRestart}
            />
          );
        case "setup_failed":
        case "payment_failed":
        case "activation_failed":
        default:
          return (
            <CheckoutError
              title={t`Payment failed`}
              description={
                <>
                  <Trans>
                    Your payment could not be processed and you have not been
                    charged. Please try again.
                  </Trans>
                  <br />
                  <Trans>
                    If the issue persists, contact us at{" "}
                    <a
                      href="mailto:support@dust.tt"
                      className="text-primary underline"
                    >
                      support@dust.tt
                    </a>
                    .
                  </Trans>
                </>
              }
              onRetry={onRestart}
            />
          );
      }

    default:
      assertNeverAndIgnore(phase);
      return null;
  }
}

// Steps shown during the confirming / waiting_for_payment phases, in the order
// they happen server-side: the subscription (Metronome customer + contract) is
// set up while confirming, then payment is charged and the workspace activated
// while polling for the webhook result.
const CHECKOUT_STEPS: readonly MessageDescriptor[] = [
  msg`Setting up your subscription`,
  msg`Processing payment`,
  msg`Activating your workspace`,
];

// Zero-payment (coupon covers the full cost): no charge happens, so the
// "Processing payment" step is dropped.
const CHECKOUT_STEPS_NO_PAYMENT: readonly MessageDescriptor[] = [
  msg`Setting up your subscription`,
  msg`Activating your workspace`,
];

interface CheckoutProgressProps {
  steps: readonly MessageDescriptor[];
  activeStepIndex: number;
}

function CheckoutProgress({ steps, activeStepIndex }: CheckoutProgressProps) {
  const { t } = useLingui();

  return (
    <div className="flex flex-col gap-4">
      {steps.map((step, index) => {
        const label = t(step);
        const isDone = index < activeStepIndex;
        const isActive = index === activeStepIndex;
        return (
          <div key={label} className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center">
              {isDone ? (
                <Icon
                  visual={CheckCircle}
                  size="sm"
                  className="text-success-500"
                />
              ) : isActive ? (
                <Spinner size="xs" />
              ) : (
                <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
              )}
            </div>
            <span
              className={`text-sm ${
                isDone || isActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface CheckoutErrorProps {
  title: string;
  description: ReactNode;
  onRetry?: () => void;
}

function CheckoutError({ title, description, onRetry }: CheckoutErrorProps) {
  const { t } = useLingui();

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <Icon visual={XCircle} size="2xl" className="text-warning-500" />
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry && <Button label={t`Try again`} onClick={onRetry} />}
    </div>
  );
}
