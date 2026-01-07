import config from "@app/lib/api/config";
import logger from "@app/logger/logger";

import { untrustedFetch } from "../egress/server";

// EU member states country codes (ISO 3166-1 alpha-2)
export const EU_COUNTRY_CODES = new Set([
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
export const GDPR_COUNTRY_CODES = new Set([
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

export async function resolveCountryCode(ip: string): Promise<string> {
  // Handle localhost IPs in development
  if (ip === "::1" || ip === "127.0.0.1" || ip.startsWith("192.168.")) {
    return "US";
  }

  const token = config.getIPInfoApiToken();

  const response = await untrustedFetch(
    `https://api.ipinfo.io/lite/${ip}?token=${token}`
  );

  if (!response.ok) {
    logger.error(
      {
        status: response.status,
        statusText: response.statusText,
        ip,
      },
      "Failed to fetch geolocation data from IPinfo"
    );
    throw new Error(`Failed to fetch geolocation data: ${response.statusText}`);
  }

  const data = (await response.json()) as { country_code: string };
  return data.country_code;
}
