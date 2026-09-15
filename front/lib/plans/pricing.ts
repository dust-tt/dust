import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

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
 * default for all workspaces. The `legacy_billing` feature flag forces it off
 * for individual workspaces.
 *
 * Prefer the `useIsMetronomeCheckout` hook; this helper is for components that
 * render outside the auth context provider (e.g. the SPA workspace layout).
 */
export function computeIsMetronomeCheckout({
  featureFlags,
}: {
  featureFlags: WhitelistableFeature[];
}): boolean {
  return !featureFlags.includes("legacy_billing");
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
