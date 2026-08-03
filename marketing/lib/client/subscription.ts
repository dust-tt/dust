import { getBillingCurrencyForCountry } from "@marketing/lib/plans/billing_currency";
import { useGeolocation } from "@marketing/lib/swr/geo";
import type { SupportedCurrency } from "@marketing/types/currency";

export const PRO_PLAN_COST_MONTHLY = 29;
export const PRO_PLAN_COST_YEARLY = 27;
export const BUSINESS_PLAN_COST_MONTHLY = 45;

export const CP_PRO_SEAT_COST_MONTHLY = 30;
export const CP_PRO_SEAT_COST_YEARLY = 24;
export const CP_MAX_SEAT_COST_MONTHLY = 150;
export const CP_MAX_SEAT_COST_YEARLY = 120;

export function formatPriceWithCurrency(
  price: number,
  currency: SupportedCurrency
): string {
  return currency === "usd" ? `$${price}` : `${price}€`;
}

/**
 * Hook that resolves the user's billing currency from IP geolocation.
 *
 * Marketing always treats Metronome billing as enabled:
 *   EU/EEA/CH → EUR, rest of world → USD.
 *
 * Falls back to EUR while loading or on error.
 */
export function useUserBillingCurrency(): SupportedCurrency {
  const { geoData } = useGeolocation();

  if (geoData?.countryCode) {
    return getBillingCurrencyForCountry(geoData.countryCode, true);
  }
  return "eur";
}

export function usePriceWithCurrency(price: number): string {
  const currency = useUserBillingCurrency();
  return formatPriceWithCurrency(price, currency);
}
