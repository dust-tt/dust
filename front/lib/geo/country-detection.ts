import config from "@app/lib/api/config";
import logger from "@app/logger/logger";

import { untrustedFetch } from "../egress/server";

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
