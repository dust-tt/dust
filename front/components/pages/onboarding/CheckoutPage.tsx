import config from "@app/lib/api/config";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import {
  BUSINESS_PLAN_COST_MONTHLY,
  getPriceAsString,
  PRO_PLAN_COST_MONTHLY,
  PRO_PLAN_COST_YEARLY,
  useUserBillingCurrency,
} from "@app/lib/client/subscription";
import { isWhitelistedBusinessPlan } from "@app/lib/plans/plan_codes";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import {
  useCreateCheckoutSession,
  useValidateCoupon,
  useWorkspaceSeatsCount,
} from "@app/lib/swr/workspaces";
import type { CouponType } from "@app/types/coupon";
import type { BillingPeriod } from "@app/types/plan";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  Button,
  DustLogoSquare,
  Icon,
  Input,
  Spinner,
  TagIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useCallback, useEffect, useState } from "react";
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

const COUPONS_ENABLED = false;

const couponFormSchema = z.object({
  couponCode: z.string().min(1, "Please enter a promotion code"),
});

type CouponFormValues = z.infer<typeof couponFormSchema>;

function useBillingPeriodParam(): BillingPeriod {
  const raw = useSearchParam("billingPeriod");
  return raw === "yearly" ? "yearly" : "monthly";
}

export function CheckoutPage() {
  const owner = useWorkspace();
  const router = useAppRouter();

  const billingPeriod = useBillingPeriodParam();

  const { seatsCount, isSeatsCountLoading } = useWorkspaceSeatsCount({
    workspaceId: owner.sId,
  });

  const { createSession, isCreating } = useCreateCheckoutSession({
    workspaceId: owner.sId,
  });
  const { validateCoupon } = useValidateCoupon({ workspaceId: owner.sId });

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isSessionRefreshing, setIsSessionRefreshing] = useState(false);
  const [showCouponInput, setShowCouponInput] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<CouponType | null>(null);

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

  const initSession = useCallback(
    async (couponCodeArg?: string) => {
      setClientSecret(null);
      const result = await createSession({
        billingPeriod,
        couponCode: couponCodeArg,
      });
      if (!result) {
        void router.back();
        return;
      }
      switch (result.mode) {
        case "embedded":
          setClientSecret(result.clientSecret);
          return;
        case "hosted":
          void router.push(result.checkoutUrl);
          return;
        default:
          assertNeverAndIgnore(result);
      }
    },
    [billingPeriod, createSession, router]
  );

  // We have to enforce light mode to fit with stripe embedded checkout session
  // as there is not appearance selection field in EmbeddedCheckoutProvider
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

  // On mount, create an initial checkout session.
  useEffect(() => {
    void initSession();
  }, [initSession]);

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
    // Re-create session with the coupon code so it's stored in metadata.
    setIsSessionRefreshing(true);
    await initSession(couponCode.trim());
    setIsSessionRefreshing(false);
  });

  // Full-page spinner only on initial load; coupon re-creation keeps the left pane visible.
  const isInitialLoading = (isSeatsCountLoading || isCreating) && !clientSecret;

  const currency = useUserBillingCurrency();
  const seats = seatsCount ?? 1;

  const isBusiness = isWhitelistedBusinessPlan(owner);
  const seatPricePerMonthCents =
    (isBusiness
      ? BUSINESS_PLAN_COST_MONTHLY
      : billingPeriod === "monthly"
        ? PRO_PLAN_COST_MONTHLY
        : PRO_PLAN_COST_YEARLY) * 100;
  // Yearly billing charges 12 months upfront.
  const monthsInPeriod = billingPeriod === "yearly" ? 12 : 1;
  const seatPriceCents = seatPricePerMonthCents * monthsInPeriod;
  const subtotalCents = seatPriceCents * seats;

  const couponDiscountCents =
    appliedCoupon !== null
      ? Math.min(appliedCoupon.amount * 100, subtotalCents)
      : 0;
  const totalDueTodayCents = subtotalCents - couponDiscountCents;

  if (!isSessionRefreshing && (isInitialLoading || !clientSecret)) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner size="xl" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen">
      {/* Left pane: plan summary + coupon + total */}
      <div className="flex w-1/2 flex-col gap-14 p-24">
        {/* Logo */}
        <div>
          <Icon visual={DustLogoSquare} size="lg" />
        </div>

        <div className="flex flex-col gap-11">
          {/* Plan header */}
          <div className="flex flex-col">
            <span className="text-base text-muted-foreground">Your plan</span>
            <h1 className="text-5xl font-semibold text-foreground">
              {isBusiness ? "Business plan" : "Pro plan"}
            </h1>
            <span className="text-sm text-muted-foreground">
              {billingPeriod === "yearly"
                ? "billed annually"
                : "billed monthly"}
            </span>
          </div>

          {/* Line items */}
          <div className="flex flex-col text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Price per seat (excl. taxes)
              </span>
              <span>
                {getPriceAsString({
                  currency,
                  priceInCents: seatPriceCents,
                })}
              </span>
            </div>
            <div className="mt-3 flex justify-between">
              <span className="text-muted-foreground">Number of seats</span>
              <span>{seats}</span>
            </div>
            <div className="mt-6 flex justify-between border-t border-separator pt-3 font-medium">
              <span>Subtotal (excl. taxes)</span>
              <span>
                {getPriceAsString({
                  currency,
                  priceInCents: subtotalCents,
                })}
              </span>
            </div>

            {/* Promotion code: toggle button → input field */}
            {COUPONS_ENABLED &&
              !appliedCoupon &&
              (showCouponInput ? (
                <div className="mt-4 flex flex-col gap-2">
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
                <div className="mt-4 flex flex-col gap-2">
                  <Button
                    label="Add promotion code"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCouponInput(true)}
                    className="self-start bg-muted"
                  />
                </div>
              ))}

            {/* Applied coupon: pill + description */}
            {COUPONS_ENABLED && appliedCoupon && (
              <div className="mt-4 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-sm text-muted-foreground">
                    <Icon visual={TagIcon} size="xs" />
                    <span className="font-medium">{appliedCoupon.code}</span>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      className="ml-0.5 hover:text-foreground"
                    >
                      <Icon visual={XMarkIcon} size="xs" />
                    </button>
                  </div>
                  <span className="text-sm text-success-500">
                    −
                    {getPriceAsString({
                      currency,
                      priceInCents: couponDiscountCents,
                    })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {getPriceAsString({
                    currency,
                    priceInCents: appliedCoupon.amount * 100,
                  })}
                  {appliedCoupon.durationMonths !== null
                    ? ` for ${appliedCoupon.durationMonths} month${appliedCoupon.durationMonths > 1 ? "s" : ""}`
                    : " valid once"}
                </p>
              </div>
            )}

            {/* Total due today — always visible */}
            <div className="mt-6 flex justify-between border-t border-separator pt-3 text-base font-semibold">
              <span>Total due today (excl. taxes)</span>
              <span>
                {getPriceAsString({
                  currency,
                  priceInCents: totalDueTodayCents,
                })}
              </span>
            </div>

            <p className="mt-11 text-xs text-muted-foreground">
              Final currency and tax amount are determined by the country
              entered in the payment form.
            </p>
          </div>
        </div>
      </div>

      {/* Right pane: Stripe Embedded Checkout */}
      <div className="w-1/2 p-24">
        {isCreating || !clientSecret ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="pb-24">
            <EmbeddedCheckoutProvider
              stripe={getStripePromise()}
              options={{ clientSecret }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        )}
      </div>
    </main>
  );
}
