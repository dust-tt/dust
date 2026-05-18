import type { SupportedCurrency } from "@app/types/currency";
/**
 * Convert a Metronome amount to cents.
 *
 * Metronome pricing units depend on currency:
 * - USD: already expressed in cents
 * - Other fiat currencies: expressed in whole currency units
 */
export function amountCents(
  amount: number,
  currency: SupportedCurrency
): number {
  if (currency === "usd") {
    return Math.round(amount);
  }

  return Math.round(amount * 100);
}

/**
 * Convert cents to a Metronome amount.
 *
 * Metronome pricing depends on currency:
 * - USD: expressed in cents
 * - Other fiat currencies: expressed in whole currency units
 */
export function metronomeAmount(
  amountCents: number,
  currency: SupportedCurrency
): number {
  if (currency === "usd") {
    return amountCents;
  }

  return Math.round(amountCents / 100);
}
