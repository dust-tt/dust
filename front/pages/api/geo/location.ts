import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { isGDPRCountry } from "@app/lib/geo/eu-detection";
import logger from "@app/logger/logger";
import { isString } from "@app/types";

export type GeoLocationResponse = {
  isGDPR: boolean;
  countryCode?: string;
  dev?: boolean;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GeoLocationResponse | { error: string }>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { "x-forwarded-for": forwarded } = req.headers;
    const ip = isString(forwarded)
      ? forwarded.split(",")[0].trim()
      : req.socket.remoteAddress;

    if (!ip) {
      logger.error("No IP address found in request");
      return res.status(400).json({ error: "No IP address found" });
    }

    // Handle localhost IPs in development
    if (ip === "::1" || ip === "127.0.0.1" || ip.startsWith("192.168.")) {
      return res.status(200).json({
        isGDPR: true,
        countryCode: "FR",
        dev: true,
      });
    }

    const token = config.getIPInfoApiToken();
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch(
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
      return res.status(502).json({
        error: `Failed to fetch geolocation data: ${response.statusText}`,
      });
    }

    const data = await response.json();
    const countryCode = data.country_code;

    return res.status(200).json({
      isGDPR: isGDPRCountry(countryCode),
      countryCode,
    });
  } catch (error) {
    logger.error({ error }, "Error in geolocation API");
    return res.status(500).json({
      error: "Internal server error while fetching geolocation",
    });
  }
}
