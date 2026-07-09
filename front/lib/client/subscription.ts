import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { getBillingCurrencyForCountry } from "@app/lib/plans/billing_currency";
import { isFreePlan } from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import type { KillSwitchType } from "@app/lib/poke/types";
import { useGeolocation } from "@app/lib/swr/geo";
import type { SupportedCurrency } from "@app/types/currency";
import { isSubscriptionMetronomeBilled } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { useEffect, useState } from "react";
import { useKillSwitches } from "../swr/kill";

// If mention the price of the PRO plan in a few different places in the code base,
// so this is just a way to have that value hardcoded in one place.
// Changing this value only changes the value displayed on the webapp and the website,
// not on the Stripe dashboard.
export const PRO_PLAN_COST_MONTHLY = 29;
export const PRO_PLAN_COST_YEARLY = 27;
export const BUSINESS_PLAN_COST_MONTHLY = 45;

// Credit-priced (CP) self-serve seat prices
export const CP_ENTERPRISE_BASIS = 20;
export const CP_PRO_SEAT_COST_MONTHLY = 30;
export const CP_PRO_SEAT_COST_YEARLY = 24;
export const CP_MAX_SEAT_COST_MONTHLY = 150;
export const CP_MAX_SEAT_COST_YEARLY = 120;

/**
 * Client-side mirror of the server-side `isMetronomeBillingEnabled` gate: the
 * credit-priced checkout flow follows Metronome billing, which is enabled by
 * default for all workspaces. The `global_disable_metronome_billing` kill
 * switch turns it off globally; the `legacy_billing` feature flag forces it
 * off for individual workspaces.
 *
 * Prefer the `useIsMetronomeCheckout` hook; this helper is for components that
 * render outside the auth context provider (e.g. the SPA workspace layout).
 */
export function computeIsMetronomeCheckout({
  featureFlags,
  killSwitches,
}: {
  featureFlags: WhitelistableFeature[];
  killSwitches: KillSwitchType[] | null | undefined;
}): boolean {
  return (
    !featureFlags.includes("legacy_billing") &&
    !killSwitches?.includes("global_disable_metronome_billing")
  );
}

export function useIsMetronomeCheckout(): boolean {
  const { featureFlags } = useFeatureFlags();
  const { killSwitches } = useKillSwitches();
  return computeIsMetronomeCheckout({ featureFlags, killSwitches });
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
  const { killSwitches } = useKillSwitches();
  const isMetronomeBillingEnabled =
    !hasFeature("legacy_billing") &&
    !killSwitches?.includes("global_disable_metronome_billing");

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

export interface BillingCycle {
  cycleStart: Date;
  cycleEnd: Date;
}

/**
 * A calendar day beyond the target month's length overflows into the next
 * month when constructing a Date (e.g. Feb 31 → Mar 3). Bring such dates back
 * to the last day of the expected month (day 0 of the month the date
 * overflowed into).
 *
 * `month` is the expected JS month index and may be outside 0-11 (e.g. built
 * from `referenceMonth + 1`); it is normalized before comparison.
 */
export function clampToMonth(date: Date, month: number, useUTC: boolean): Date {
  const expectedMonth = ((month % 12) + 12) % 12;
  const actualMonth = useUTC ? date.getUTCMonth() : date.getMonth();
  if (actualMonth === expectedMonth) {
    return date;
  }
  // Overflow only shifts days, so the date's time-of-day is the intended
  // boundary time — keep it on the clamped result.
  return useUTC
    ? new Date(
        Date.UTC(
          date.getUTCFullYear(),
          actualMonth,
          0,
          date.getUTCHours(),
          date.getUTCMinutes(),
          date.getUTCSeconds(),
          date.getUTCMilliseconds()
        )
      )
    : new Date(
        date.getFullYear(),
        actualMonth,
        0,
        date.getHours(),
        date.getMinutes(),
        date.getSeconds(),
        date.getMilliseconds()
      );
}

/**
 * Calculate the billing cycle for a given day of the month.
 * Example: if billing starts on the 4th, the cycle is from the 4th of one month
 * to the 4th of the next month (exclusive).
 *
 * A start day beyond a month's length is clamped to that month's last day
 * (day 31 → Feb 28), matching the usual billing anniversary convention.
 *
 * @param billingCycleStartDay - The day of the month when the billing cycle starts (1-31)
 * @param referenceDate - The date to calculate the cycle for (defaults to now)
 * @param useUTC - Whether to use UTC dates (for backend) or local dates (for frontend display)
 * @param boundaryTimeOfDay - Time-of-day for cycle boundaries. Defaults to
 * midnight; pass the billing anchor (e.g. the Metronome contract start, which
 * is hour-aligned) to keep boundaries on its exact time.
 */
export function getBillingCycleFromDay(
  billingCycleStartDay: number,
  referenceDate: Date = new Date(),
  useUTC: boolean = false,
  boundaryTimeOfDay?: Date
): BillingCycle {
  const year = useUTC
    ? referenceDate.getUTCFullYear()
    : referenceDate.getFullYear();
  const month = useUTC ? referenceDate.getUTCMonth() : referenceDate.getMonth();

  const hours = boundaryTimeOfDay
    ? useUTC
      ? boundaryTimeOfDay.getUTCHours()
      : boundaryTimeOfDay.getHours()
    : 0;
  const minutes = boundaryTimeOfDay
    ? useUTC
      ? boundaryTimeOfDay.getUTCMinutes()
      : boundaryTimeOfDay.getMinutes()
    : 0;
  const seconds = boundaryTimeOfDay
    ? useUTC
      ? boundaryTimeOfDay.getUTCSeconds()
      : boundaryTimeOfDay.getSeconds()
    : 0;
  const milliseconds = boundaryTimeOfDay
    ? useUTC
      ? boundaryTimeOfDay.getUTCMilliseconds()
      : boundaryTimeOfDay.getMilliseconds()
    : 0;

  // The anchor-day boundary in the month `monthOffset` months from the
  // reference month, clamped to that month's last day when the month is
  // shorter than the anchor day.
  const boundary = (monthOffset: number): Date => {
    const candidate = useUTC
      ? new Date(
          Date.UTC(
            year,
            month + monthOffset,
            billingCycleStartDay,
            hours,
            minutes,
            seconds,
            milliseconds
          )
        )
      : new Date(
          year,
          month + monthOffset,
          billingCycleStartDay,
          hours,
          minutes,
          seconds,
          milliseconds
        );
    return clampToMonth(candidate, month + monthOffset, useUTC);
  };

  // The cycle containing the reference date starts on the latest boundary at
  // or before it: this month's boundary once reached, last month's otherwise.
  if (boundary(0).getTime() <= referenceDate.getTime()) {
    return { cycleStart: boundary(0), cycleEnd: boundary(1) };
  }
  return { cycleStart: boundary(-1), cycleEnd: boundary(0) };
}

/**
 * Calculate the current billing cycle based on the subscription start date.
 * Returns null if no subscription start date is provided.
 */
export function getBillingCycle(
  subscriptionStartDate: number | null,
  referenceDate: Date = new Date()
): BillingCycle | null {
  if (!subscriptionStartDate) {
    return null;
  }

  const billingCycleStartDay = new Date(subscriptionStartDate).getUTCDate();
  return getBillingCycleFromDay(billingCycleStartDay, referenceDate, true);
}

export const getPriceAsString = ({
  currency,
  priceInCents,
  priceInMicroUsd,
}:
  | {
      currency: string;
      priceInCents: number;
      priceInMicroUsd?: undefined;
    }
  | {
      currency: "usd";
      priceInCents?: undefined;
      priceInMicroUsd: number;
    }): string => {
  if (priceInMicroUsd !== undefined) {
    return `$${(priceInMicroUsd / 1_000_000).toFixed(2)}`;
  }

  const price = (priceInCents / 100).toFixed(2);
  switch (currency) {
    case "usd":
      return `$${price}`;
    case "eur":
      return `${price}€`;
    case "gbp":
      return `£${price}`;
    default:
      return `${price}${currency}`;
  }
};

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
      const adminTarget = isSubscriptionMetronomeBilled(subscription)
        ? `/w/${workspace.sId}/billing`
        : `/w/${workspace.sId}/subscription`;
      void router.replace(isAdmin ? adminTarget : `/w/${workspace.sId}`);
    }
  }, [wasAlreadyOnPaidPlan, isAdmin, subscription, workspace.sId, router]);

  return wasAlreadyOnPaidPlan;
}
