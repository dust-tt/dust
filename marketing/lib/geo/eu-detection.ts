export const EU_COUNTRY_CODES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
]);

// EEA countries + UK + Switzerland.
export const GDPR_COUNTRY_CODES = new Set([
  ...EU_COUNTRY_CODES,
  "IS",
  "LI",
  "NO",
  "GB",
  "CH",
]);

export function isEUCountry(countryCode: string | null | undefined): boolean {
  if (!countryCode) {
    return false;
  }
  return EU_COUNTRY_CODES.has(countryCode.toUpperCase());
}

export function isGDPRCountry(countryCode: string | null | undefined): boolean {
  if (!countryCode) {
    return false;
  }
  return GDPR_COUNTRY_CODES.has(countryCode.toUpperCase());
}
