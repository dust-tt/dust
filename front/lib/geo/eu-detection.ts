// EU member states country codes (ISO 3166-1 alpha-2)
const EU_COUNTRY_CODES = new Set([
  "AT", // Austria
  "BE", // Belgium
  "BG", // Bulgaria
  "HR", // Croatia
  "CY", // Cyprus
  "CZ", // Czech Republic
  "DK", // Denmark
  "EE", // Estonia
  "FI", // Finland
  "FR", // France
  "DE", // Germany
  "GR", // Greece
  "HU", // Hungary
  "IE", // Ireland
  "IT", // Italy
  "LV", // Latvia
  "LT", // Lithuania
  "LU", // Luxembourg
  "MT", // Malta
  "NL", // Netherlands
  "PL", // Poland
  "PT", // Portugal
  "RO", // Romania
  "SK", // Slovakia
  "SI", // Slovenia
  "ES", // Spain
  "SE", // Sweden
]);

// Additional countries that follow GDPR (EEA countries + UK)
const GDPR_COUNTRY_CODES = new Set([
  ...EU_COUNTRY_CODES,
  "IS", // Iceland
  "LI", // Liechtenstein
  "NO", // Norway
  "GB", // United Kingdom (still follows GDPR post-Brexit)
  "CH", // Switzerland (has similar data protection laws)
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
