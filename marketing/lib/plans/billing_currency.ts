import type { SupportedCurrency } from "@marketing/types/currency";

const EUR_COUNTRY_CODES: ReadonlySet<string> = new Set([
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
  "BG",
  "CZ",
  "DK",
  "HU",
  "PL",
  "RO",
  "SE",
  "IS",
  "LI",
  "NO",
  "CH",
]);

const USD_COUNTRY_CODES: ReadonlySet<string> = new Set(["US"]);

export function getBillingCurrencyForCountry(
  countryCode: string,
  metronomeBilled = false
): SupportedCurrency {
  const upper = countryCode.toUpperCase();
  if (metronomeBilled) {
    return EUR_COUNTRY_CODES.has(upper) ? "eur" : "usd";
  }
  return USD_COUNTRY_CODES.has(upper) ? "usd" : "eur";
}
