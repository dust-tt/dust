import type { SupportedCurrency } from "@app/types/currency";

/**
 * ISO 3166-1 alpha-2 country codes that map to EUR billing.
 *
 * Includes:
 * - Eurozone (20): AT, BE, CY, EE, FI, FR, DE, GR, IE, IT, LV, LT, LU, MT, NL, PT, SK, SI, ES, HR
 * - Non-euro EU in EEA: BG, CZ, DK, HU, PL, RO, SE
 * - EEA non-EU: IS, LI, NO
 * - Switzerland: CH
 */
const EUR_COUNTRY_CODES: ReadonlySet<string> = new Set([
  // Eurozone
  "AT",
  "BE",
  "CY",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PT",
  "SK",
  "SI",
  "ES",
  "HR",
  // Non-euro EU in EEA
  "BG",
  "CZ",
  "DK",
  "HU",
  "PL",
  "RO",
  "SE",
  // EEA non-EU
  "IS",
  "LI",
  "NO",
  // Switzerland
  "CH",
]);

/** Countries where Stripe prices have a USD currency_option. */
const USD_COUNTRY_CODES: ReadonlySet<string> = new Set(["US"]);

/**
 * Determine billing currency from a country code.
 *
 * Two modes depending on whether the workspace uses Metronome billing:
 * - Metronome (metronomeBilled=true): EU/EEA/CH → EUR, rest of world → USD.
 *   We control the currency via Metronome rate cards.
 * - Stripe (metronomeBilled=false, default): US → USD, rest of world → EUR.
 *   Matches Stripe's adaptive pricing where EUR is the base currency
 *   and USD is the only currency_option.
 */
export function getBillingCurrencyForCountry(
  countryCode: string,
  metronomeBilled = false
): SupportedCurrency {
  const upper = countryCode.toUpperCase();
  if (metronomeBilled) {
    return EUR_COUNTRY_CODES.has(upper) ? "eur" : "usd";
  }
  // Stripe mode: USD only for US, EUR for everyone else (Stripe base currency).
  return USD_COUNTRY_CODES.has(upper) ? "usd" : "eur";
}

/**
 * Map from a base (USD) Metronome package alias to its EUR variant.
 * Returns the original alias if no EUR variant exists or currency is USD.
 */
export function resolvePackageAliasForCurrency(
  baseAlias: string,
  currency: SupportedCurrency
): string {
  if (currency === "usd") {
    return baseAlias;
  }

  const eurAliases: Record<string, string> = {
    "legacy-pro-monthly": "legacy-pro-monthly-eur",
    "legacy-business": "legacy-business-eur",
    "legacy-pro-annual": "legacy-pro-annual-eur",
    "legacy-enterprise": "legacy-enterprise-eur",
  };

  return eurAliases[baseAlias] ?? baseAlias;
}
