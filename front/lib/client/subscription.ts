import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { getBillingCurrencyForCountry } from "@app/lib/plans/billing_currency";
import { isFreePlan } from "@app/lib/plans/plan_codes";
import {
  computeIsMetronomeCheckout,
  getPriceAsString,
} from "@app/lib/plans/pricing";
import { useAppRouter } from "@app/lib/platform";
import { useGeolocation } from "@app/lib/swr/geo";
import type { SupportedCurrency } from "@app/types/currency";
import { isCreditPricedPlan } from "@app/types/plan";
import { useEffect, useState } from "react";

// Re-exported for the client: the pure pricing and billing-cycle helpers now
// live under lib/plans so server code can use them without pulling React in.
export type { BillingCycle } from "@app/lib/plans/billing_cycle";
export {
  clampToMonth,
  getBillingCycle,
  getBillingCycleFromDay,
} from "@app/lib/plans/billing_cycle";
export {
  BUSINESS_PLAN_COST_MONTHLY,
  CP_ENTERPRISE_BASIS,
  CP_MAX_SEAT_COST_MONTHLY,
  CP_MAX_SEAT_COST_YEARLY,
  CP_PRO_SEAT_COST_MONTHLY,
  CP_PRO_SEAT_COST_YEARLY,
  computeIsMetronomeCheckout,
  getPriceAsString,
  PRO_PLAN_COST_MONTHLY,
  PRO_PLAN_COST_YEARLY,
} from "@app/lib/plans/pricing";

export function useIsMetronomeCheckout(): boolean {
  const { featureFlags } = useFeatureFlags();
  return computeIsMetronomeCheckout({ featureFlags });
}

/**
 * Hook that resolves the user's billing currency from IP geolocation.
 *
 * When Metronome billing is enabled:
 *   EU/EEA/CH → EUR, rest of world → USD.
 * With legacy billing (Stripe billing, or no workspace):
 *   US → USD, rest of world → EUR (matches Stripe adaptive pricing).
 *
 * Falls back to Stripe behaviour while loading or on error.
 */
export function useUserBillingCurrency(): SupportedCurrency {
  const { geoData } = useGeolocation();
  const { hasFeature } = useFeatureFlags();
  const isMetronomeBillingEnabled = !hasFeature("legacy_billing");

  if (geoData?.countryCode) {
    return getBillingCurrencyForCountry(
      geoData.countryCode,
      isMetronomeBillingEnabled
    );
  }
  // No geo data yet — Stripe default (EUR base, USD for US only).
  return "eur";
}

/**
 * Hook: format a price with the user's billing currency.
 */
export function usePriceWithCurrency(price: number): string {
  const currency = useUserBillingCurrency();
  return getPriceAsString({ currency, priceInCents: price * 100 });
}

/**
 * Guards onboarding/checkout pages (select-subscription, subscribe,
 * trial-ended, checkout) against workspaces that already have a paid plan —
 * reachable via stale links or back navigation after the workspace already
 * upgraded. Admins are sent to the subscription management page, other
 * members to the workspace home since they cannot access billing.
 *
 * The check is captured once at mount rather than kept reactive: on
 * `CheckoutPage`, a successful payment flips the workspace's subscription
 * to paid (via `mutateAuthContext`) right before showing its own success
 * screen, and that update must not be mistaken for "already paid" and
 * redirect the user away from the success screen the payment just unlocked.
 *
 * Returns true while the redirect is in flight, so callers can render `null`
 * instead of the checkout UI for that render.
 */
export function useRedirectAwayFromCheckoutIfAlreadyPaid(): boolean {
  const { workspace, isAdmin, subscription } = useAuth();
  const router = useAppRouter();

  const [wasAlreadyOnPaidPlan] = useState(
    () => !isFreePlan(subscription.plan.code)
  );

  useEffect(() => {
    if (wasAlreadyOnPaidPlan) {
      const adminTarget = isCreditPricedPlan(subscription.plan)
        ? `/w/${workspace.sId}/billing`
        : `/w/${workspace.sId}/subscription`;
      void router.replace(isAdmin ? adminTarget : `/w/${workspace.sId}`);
    }
  }, [wasAlreadyOnPaidPlan, isAdmin, subscription, workspace.sId, router]);

  return wasAlreadyOnPaidPlan;
}
