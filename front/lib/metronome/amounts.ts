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
 * - Other fiat currencies: expressed in whole currency units (decimals
 *   are accepted, e.g. 0.0087 EUR for sub-cent unit prices)
 */
export function metronomeAmount(
  amountCents: number,
  currency: SupportedCurrency
): number {
  if (currency === "usd") {
    return amountCents;
  }

  return amountCents / 100;
}

// Price per AWU credit in each supported currency. Must stay in sync with
// scripts/metronome_setup.ts (AWU_IN_USD_CENTS / AWU_IN_EUR).
export const AWU_PRICE_PER_CREDIT: Record<SupportedCurrency, number> = {
  usd: 0.01,
  eur: 0.0087,
};

export function currencyToAwuCredits(
  amountCurrencyUnits: number,
  currency: SupportedCurrency
): number {
  return amountCurrencyUnits / AWU_PRICE_PER_CREDIT[currency];
}

export function awuCreditsToCurrency(
  credits: number,
  currency: SupportedCurrency
): number {
  return credits * AWU_PRICE_PER_CREDIT[currency];
}

export function formatCurrencyAmount({
  amount,
  currency,
}: {
  amount: number;
  currency: SupportedCurrency;
}): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCurrencyAmountCents({
  amountCents,
  currency,
}: {
  amountCents: number;
  currency: SupportedCurrency;
}): string {
  return formatCurrencyAmount({
    amount: amountCents / 100,
    currency,
  });
}
