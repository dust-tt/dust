import config from "@marketing/lib/api/config";
import { untrustedFetch } from "@marketing/lib/egress/server";
import logger from "@marketing/logger/logger";

export type GeoLocationResponse = {
  isGDPR: boolean;
  countryCode?: string;
  dev?: boolean;
};

export async function resolveCountryCode(ip: string): Promise<string> {
  if (
    ip === "::1" ||
    ip === "127.0.0.1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("::ffff:192.168.")
  ) {
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
