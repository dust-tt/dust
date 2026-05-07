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
  useWorkspaceSeatsCount,
} from "@app/lib/swr/workspaces";
import type { BillingPeriod } from "@app/types/plan";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { DustLogoSquare, Icon, Spinner } from "@dust-tt/sparkle";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useCallback, useEffect, useState } from "react";

// Lazily initialised at module level so Stripe.js is loaded only when the embedded
// checkout is actually rendered, and never re-loaded on re-renders.
let stripePromise: ReturnType<typeof loadStripe> | null = null;
function getStripePromise() {
  if (!stripePromise) {
    stripePromise = loadStripe(config.getStripePublishableKey());
  }
  return stripePromise;
}

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

  const [clientSecret, setClientSecret] = useState<string | null>(null);

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

  const totalDueTodayCents = subtotalCents;

  if (isInitialLoading || !clientSecret) {
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
