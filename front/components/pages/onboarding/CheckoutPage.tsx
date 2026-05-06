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
import { Page, Spinner } from "@dust-tt/sparkle";
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
    <main className="flex min-h-screen flex-col">
      <Page>
        <div className="flex w-full flex-col gap-8 lg:flex-row lg:gap-12">
          {/* Left pane: plan summary + coupon + total */}
          <div className="flex flex-col gap-4 lg:w-1/2">
            <h2 className="text-lg font-semibold">Plan summary</h2>

            {/* Line items */}
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Price per seat ({billingPeriod}), excl. taxes
                </span>
                <span>
                  {getPriceAsString({
                    currency,
                    priceInCents: seatPriceCents,
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Number of seats</span>
                <span>{seats}</span>
              </div>
              <div className="flex justify-between border-t border-separator pt-3 font-medium">
                <span>Subtotal, excl. taxes</span>
                <span>
                  {getPriceAsString({
                    currency,
                    priceInCents: subtotalCents,
                  })}
                </span>
              </div>
            </div>

            {/* Total due today — always visible */}
            <div className="flex justify-between border-t border-separator pt-3 text-base font-semibold">
              <span>Total due today, excl. taxes</span>
              <span>
                {getPriceAsString({
                  currency,
                  priceInCents: totalDueTodayCents,
                })}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              Final currency and tax amount are determined by the country
              entered in the payment form.
            </p>
          </div>

          {/* Right pane: Stripe Embedded Checkout */}
          <div className="lg:w-1/2">
            {isCreating || !clientSecret ? (
              <div className="flex h-64 items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : (
              <EmbeddedCheckoutProvider
                stripe={getStripePromise()}
                options={{ clientSecret }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            )}
          </div>
        </div>
      </Page>
    </main>
  );
}
