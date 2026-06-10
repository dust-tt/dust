import { PaymentMethodRow } from "@app/components/checkout/PaymentMethodRow";
import config from "@app/lib/api/config";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import {
  BUSINESS_PLAN_COST_MONTHLY,
  CP_MAX_SEAT_COST_MONTHLY,
  CP_MAX_SEAT_COST_YEARLY,
  CP_PRO_SEAT_COST_MONTHLY,
  CP_PRO_SEAT_COST_YEARLY,
  getPriceAsString,
  PRO_PLAN_COST_MONTHLY,
  PRO_PLAN_COST_YEARLY,
  useUserBillingCurrency,
} from "@app/lib/client/subscription";
import { isWhitelistedBusinessPlan } from "@app/lib/plans/plan_codes";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import { useKillSwitches } from "@app/lib/swr/kill";
import {
  useAuthContext,
  useCheckBusinessActivation,
  useConfirmPayment,
  useCreateCheckoutSession,
  useInitiateBusinessActivation,
  usePreparePayment,
  useValidateCoupon,
  useWorkspaceSeatsCount,
} from "@app/lib/swr/workspaces";
import type { CouponType } from "@app/types/coupon";
import type { BillingPeriod } from "@app/types/plan";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
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
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useCallback, useEffect, useRef, useState } from "react";
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

const couponFormSchema = z.object({
  couponCode: z.string().min(1, "Please enter a promotion code"),
});

type CouponFormValues = z.infer<typeof couponFormSchema>;

type CheckoutPhase =
  | "card_capture" // Phase 1 — Stripe setup iframe
  | "payment_review" // Phase 2 — tax breakdown + confirm button
  | "confirming" // Phase 3 — POST /payment in progress
  | "waiting_for_payment" // Phase 4 — polling Redis for Metronome webhook result
  | "activating" // Phase 5 — mutating auth context, redirecting
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
  const owner = useWorkspace();
  const router = useAppRouter();
  const billingPeriod = useBillingPeriodParam();
  const seatType = useSeatTypeParam();
  const targetUserId = useSearchParam("targetUserId");
  const { mutateAuthContext } = useAuthContext({ workspaceId: owner.sId });

  // Determine if CP checkout is enabled.
  const { hasFeature } = useFeatureFlags();
  const { killSwitches } = useKillSwitches();
  const isMetronomeEnabled =
    hasFeature("metronome_billing") ||
    !killSwitches?.includes("global_disable_metronome_billing");
  const isMetronomeCheckout =
    isMetronomeEnabled && hasFeature("metronome_cp_checkout") && !!seatType;

  const [phase, setPhase] = useState<CheckoutPhase>("card_capture");
  const [phaseError, setPhaseError] = useState<PhaseError | null>(null);
  const [setupSessionId, setSetupSessionId] = useState<string | null>(null);
  // For the waiting_for_payment phase: contract id to poll.
  const [pendingContractId, setPendingContractId] = useState<string | null>(
    null
  );
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

  const { seatsCount } = useWorkspaceSeatsCount({
    workspaceId: owner.sId,
  });
  const { createSession, isCreating } = useCreateCheckoutSession({
    workspaceId: owner.sId,
  });
  const { confirmPayment, isConfirming: isConfirmingLegacy } =
    useConfirmPayment({
      workspaceId: owner.sId,
    });
  const { initiateBusinessActivation, isInitiating } =
    useInitiateBusinessActivation({ workspaceId: owner.sId });
  const isConfirming = isMetronomeCheckout ? isInitiating : isConfirmingLegacy;
  const { validateCoupon } = useValidateCoupon({ workspaceId: owner.sId });

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

  // Poll checkout payment status while in waiting_for_payment phase.
  const { checkoutPayment } = useCheckBusinessActivation({
    workspaceId: owner.sId,
    contractId: pendingContractId,
    disabled: phase !== "waiting_for_payment",
    pollIntervalMs: phase === "waiting_for_payment" ? 1500 : 0,
  });

  // React to Redis activation status.
  useEffect(() => {
    if (phase !== "waiting_for_payment" || !checkoutPayment) {
      return;
    }
    if (checkoutPayment.status === "succeeded") {
      setPhase("activating");
      void (async () => {
        await Promise.all([
          mutateAuthContext(),
          new Promise<void>((resolve) => setTimeout(resolve, 2000)),
        ]);
        void router.replace(`/w/${owner.sId}`);
      })();
    } else if (checkoutPayment.status === "failed") {
      setPhaseError({ kind: "activation_failed" });
      setPhase("error");
    }
    // pending: keep polling
  }, [phase, checkoutPayment, mutateAuthContext, router, owner.sId]);

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
    const bodyEl = document.body;
    const hadDark = htmlEl.classList.contains("dark");
    // biome-ignore lint/plugin/noSparkleClassInFront: s-dark is needed for Sparkle dark mode
    const hadSDark = htmlEl.classList.contains("s-dark");
    const hadNight = bodyEl.classList.contains("bg-background-night");

    htmlEl.classList.remove("dark");
    // biome-ignore lint/plugin/noSparkleClassInFront: s-dark is needed for Sparkle dark mode
    htmlEl.classList.remove("s-dark");
    bodyEl.classList.remove("bg-background-night");

    return () => {
      if (hadDark) {
        htmlEl.classList.add("dark");
      }
      if (hadSDark) {
        // biome-ignore lint/plugin/noSparkleClassInFront: s-dark is needed for Sparkle dark mode
        htmlEl.classList.add("s-dark");
      }
      if (hadNight) {
        bodyEl.classList.add("bg-background-night");
      }
    };
  }, []);

  // Phase "card_capture": init (or re-init on billingPeriod change).
  useEffect(() => {
    if (!isInitialized || phase !== "card_capture") {
      return;
    }
    void initSession();
  }, [isInitialized, phase, initSession]);

  const handleConfirmPayment = useCallback(async () => {
    if (!setupSessionId || confirmCalledRef.current) {
      return;
    }
    confirmCalledRef.current = true;
    setPhase("confirming");

    if (isMetronomeCheckout) {
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
      setPendingContractId(result.contractId);
      setPhase("waiting_for_payment");
      return;
    }

    // Legacy path.
    const result = await confirmPayment({ setupSessionId });
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

    // Payment and provisioning succeeded — show success state for 2s, then redirect.
    setPhase("activating");
    await Promise.all([
      mutateAuthContext(),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);
    void router.replace(`/w/${owner.sId}`);
  }, [
    setupSessionId,
    isMetronomeCheckout,
    initiateBusinessActivation,
    confirmPayment,
    mutateAuthContext,
    router,
    owner.sId,
  ]);

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
    setPendingContractId(null);
    resetCoupon();
    confirmCalledRef.current = false;
    setPhase("card_capture");
  }, [resetCoupon]);

  const handleRemoveCoupon = async () => {
    setAppliedCoupon(null);
    resetCoupon();
    setIsSessionRefreshing(true);
    await initSession();
    setIsSessionRefreshing(false);
  };

  const handleApplyCoupon = handleCouponSubmit(async ({ couponCode }) => {
    const result = await validateCoupon(couponCode.trim());
    if (!result.ok) {
      setCouponError("couponCode", { message: result.message });
      return;
    }
    setAppliedCoupon(result.coupon);
    setShowCouponInput(false);
    setIsSessionRefreshing(true);
    await initSession(couponCode.trim());
    setIsSessionRefreshing(false);
  });

  const showActualTax = preparePayment !== null;

  const currency = showActualTax ? preparePayment.currency : fallbackCurrency;
  const seats = seatsCount ?? 1;
  const isBusiness = isWhitelistedBusinessPlan(owner);

  // Compute seat price for order summary.
  // CP checkout: USD prices only. Yearly = per-month price × 12.
  // Legacy: use existing plan cost constants.
  let seatPriceCents: number;
  if (isMetronomeCheckout && seatType) {
    const monthlyPrice =
      seatType === "pro" ? CP_PRO_SEAT_COST_MONTHLY : CP_MAX_SEAT_COST_MONTHLY;
    const yearlyMonthlyPrice =
      seatType === "pro" ? CP_PRO_SEAT_COST_YEARLY : CP_MAX_SEAT_COST_YEARLY;
    seatPriceCents =
      billingPeriod === "monthly"
        ? monthlyPrice * 100
        : yearlyMonthlyPrice * 12 * 100;
  } else {
    const seatPricePerMonthCents =
      (isBusiness
        ? BUSINESS_PLAN_COST_MONTHLY
        : billingPeriod === "monthly"
          ? PRO_PLAN_COST_MONTHLY
          : PRO_PLAN_COST_YEARLY) * 100;
    const monthsInPeriod = billingPeriod === "yearly" ? 12 : 1;
    seatPriceCents = seatPricePerMonthCents * monthsInPeriod;
  }

  const seatCountForSummary = isMetronomeCheckout ? 1 : seats;
  const subtotalCents = seatPriceCents * seatCountForSummary;
  const couponDiscountCents =
    appliedCoupon !== null
      ? Math.min(appliedCoupon.amount * 100, subtotalCents)
      : 0;
  const totalDueTodayCents = subtotalCents - couponDiscountCents;

  // Plan display name.
  const planDisplayName = isMetronomeCheckout
    ? seatType === "pro"
      ? "Pro seat"
      : "Max seat"
    : isBusiness
      ? "Business plan"
      : "Pro plan";

  if (!isInitialized) {
    return null;
  }

  // Full-page spinner only on first load (and hosted redirect). After a restart the
  // two-pane layout stays visible and the right pane shows its own spinner.
  const isInitialLoading =
    phase === "card_capture" && !clientSecret && !hasHadSessionRef.current;

  if (!isSessionRefreshing && isInitialLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner size="xl" />
      </main>
    );
  }

  return (
    <main className="flex h-screen overflow-hidden">
      {/* Left pane: order summary + coupon */}
      <div className="flex w-1/2 flex-col gap-14 overflow-y-auto bg-gray-50 p-24">
        <div>
          <Icon visual={DustLogoSquare} size="lg" />
        </div>

        <div className="flex flex-col gap-11">
          <div className="flex flex-col">
            <h1 className="text-5xl font-semibold text-foreground">
              {planDisplayName}
            </h1>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {billingPeriod === "yearly"
                ? "billed annually"
                : "billed monthly"}
            </span>
          </div>

          <div className="flex flex-col text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground dark:text-muted-foreground-night">
                Price per seat
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
              <span className="text-muted-foreground dark:text-muted-foreground-night">
                Number of seats
              </span>
              <span>
                {showActualTax ? preparePayment.seatCount : seatCountForSummary}
              </span>
            </div>
            <div className="mt-6 flex justify-between border-t border-separator pt-3">
              <span className="text-lg">Subtotal</span>
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
                        placeholder="Enter promotion code"
                        {...registerCoupon("couponCode")}
                        disabled={isApplyingCoupon}
                        className="flex-1"
                      />
                      <Button
                        label={isApplyingCoupon ? "Applying…" : "Apply"}
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
                      Add promotion code
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
                  <p className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                    {getPriceAsString({
                      currency,
                      priceInCents: appliedCoupon.amount * 100,
                    })}
                    {appliedCoupon.durationMonths !== null
                      ? ` valid for ${appliedCoupon.durationMonths} month${appliedCoupon.durationMonths > 1 ? "s" : ""}`
                      : " valid for 1 month"}
                  </p>
                </div>
              )}
            </div>

            {phase !== "card_capture" ? (
              <>
                <div className="mt-3 flex justify-between">
                  <span className="text-lg">Taxes</span>
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
                    Total due with taxes
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
                    Total due excl. taxes
                  </span>
                  <span className="text-base font-semibold">
                    {getPriceAsString({
                      currency,
                      priceInCents: totalDueTodayCents,
                    })}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground dark:text-muted-foreground-night">
                  Your country selection determines the applicable taxes and
                  billing currency.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right pane: phase-dependent content — centered except when showing the Stripe iframe */}
      <div
        className={`flex w-1/2 flex-col overflow-y-auto p-24 ${phase === "card_capture" && clientSecret ? "" : phase === "payment_review" ? "justify-center" : "items-center justify-center"}`}
      >
        <RightPane
          phase={phase}
          phaseError={phaseError}
          clientSecret={clientSecret}
          isCreating={isCreating}
          isConfirming={isConfirming}
          isPreparePaymentLoading={isPreparePaymentLoading}
          isPreparePaymentError={isPreparePaymentError}
          cardBrand={preparePayment?.cardBrand}
          cardLast4={preparePayment?.cardLast4}
          sepaLast4={preparePayment?.sepaLast4}
          onRestart={handleRestart}
          onConfirmPayment={handleConfirmPayment}
          onCardCaptureComplete={handleCardCaptureComplete}
        />
      </div>
    </main>
  );
}

interface RightPaneProps {
  phase: CheckoutPhase;
  phaseError: PhaseError | null;
  clientSecret: string | null;
  isCreating: boolean;
  isConfirming: boolean;
  isPreparePaymentLoading: boolean;
  isPreparePaymentError: boolean;
  cardBrand?: string;
  cardLast4?: string;
  sepaLast4?: string;
  onRestart: () => void;
  onConfirmPayment: () => void;
  onCardCaptureComplete: () => void;
}

function RightPane({
  phase,
  phaseError,
  clientSecret,
  isCreating,
  isConfirming,
  isPreparePaymentLoading,
  isPreparePaymentError,
  cardBrand,
  cardLast4,
  sepaLast4,
  onRestart,
  onConfirmPayment,
  onCardCaptureComplete,
}: RightPaneProps) {
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
          <div className="flex flex-col items-center gap-6 text-center">
            <Icon visual={XCircle} size="2xl" className="text-warning-500" />
            <div className="flex flex-col gap-3">
              <h2 className="text-2xl font-semibold text-foreground">
                Couldn&apos;t load payment details
              </h2>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                Your payment was not processed and you have not been charged.
                Please try again.
                <br />
                If the issue persists, contact us at{" "}
                <a
                  href="mailto:support@dust.tt"
                  className="text-primary underline"
                >
                  support@dust.tt
                </a>
                .
              </p>
            </div>
            <Button label="Try again" onClick={onRestart} />
          </div>
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
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-semibold text-foreground">
                  Select payment method
                </h2>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Your available payment method is shown below
                </p>
              </div>
              {cardBrand && cardLast4 ? (
                <PaymentMethodRow
                  paymentMethod={{
                    type: "card",
                    brand: cardBrand,
                    last4: cardLast4,
                  }}
                  onRestart={onRestart}
                />
              ) : sepaLast4 ? (
                <PaymentMethodRow
                  paymentMethod={{ type: "sepa_debit", last4: sepaLast4 }}
                  onRestart={onRestart}
                />
              ) : null}
              <Button
                label="Confirm payment"
                onClick={onConfirmPayment}
                size="md"
                className="w-full"
              />
            </>
          )}
        </div>
      );

    case "confirming":
      return (
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Processing payment…
          </p>
        </div>
      );

    case "waiting_for_payment":
      return (
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Processing payment…
          </p>
        </div>
      );

    case "activating":
      return (
        <div className="flex flex-col items-center gap-6 text-center">
          <Icon visual={CheckCircle} size="2xl" className="text-success-500" />
          <h2 className="text-2xl font-semibold text-foreground">
            Thanks for subscribing
          </h2>
        </div>
      );

    case "error": {
      if (phaseError?.kind === "metronome_error") {
        return (
          <div className="flex flex-col items-center gap-6 text-center">
            <Icon visual={XCircle} size="2xl" className="text-warning-500" />
            <div className="flex flex-col gap-3">
              <h2 className="text-2xl font-semibold text-foreground">
                Something went wrong in your subscription
              </h2>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                Your payment was processed but we encountered an issue setting
                up your subscription. Please contact us at{" "}
                <a
                  href="mailto:support@dust.tt"
                  className="text-primary underline"
                >
                  support@dust.tt
                </a>{" "}
                and we&apos;ll get this sorted out right away.
              </p>
            </div>
          </div>
        );
      }
      if (phaseError?.kind === "activation_failed") {
        return (
          <div className="flex flex-col items-center gap-6 text-center">
            <Icon visual={XCircle} size="2xl" className="text-warning-500" />
            <div className="flex flex-col gap-3">
              <h2 className="text-2xl font-semibold text-foreground">
                Payment could not be processed
              </h2>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                Your subscription could not be activated. You have not been
                charged. Please try again.
                <br />
                If the issue persists, contact us at{" "}
                <a
                  href="mailto:support@dust.tt"
                  className="text-primary underline"
                >
                  support@dust.tt
                </a>
                .
              </p>
            </div>
            <Button label="Try again" onClick={onRestart} />
          </div>
        );
      }
      if (phaseError?.kind === "invalid_coupon") {
        return (
          <div className="flex flex-col items-center gap-6 text-center">
            <Icon visual={XCircle} size="2xl" className="text-warning-500" />
            <div className="flex flex-col gap-3">
              <h2 className="text-2xl font-semibold text-foreground">
                Coupon no longer valid
              </h2>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                This coupon is no longer valid. You have not been charged.
                Please try again with a different code.
              </p>
            </div>
            <Button label="Try again" onClick={onRestart} />
          </div>
        );
      }
      return (
        <div className="flex flex-col items-center gap-6 text-center">
          <Icon visual={XCircle} size="2xl" className="text-warning-500" />
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl font-semibold text-foreground">
              Payment failed
            </h2>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Your payment could not be processed and you have not been charged.
              Please try again.
              <br />
              If the issue persists, contact us at{" "}
              <a
                href="mailto:support@dust.tt"
                className="text-primary underline"
              >
                support@dust.tt
              </a>
              .
            </p>
          </div>
          <Button label="Try again" onClick={onRestart} />
        </div>
      );
    }

    default:
      assertNeverAndIgnore(phase);
      return null;
  }
}
