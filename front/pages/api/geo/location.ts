import type { NextApiRequest, NextApiResponse } from "next";

import { isGDPRCountry, resolveCountryCode } from "@app/lib/geo/eu-detection";
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

  const { "x-forwarded-for": forwarded } = req.headers;
  const ip = isString(forwarded)
    ? forwarded.split(",")[0].trim()
    : req.socket.remoteAddress;

  if (!ip) {
    logger.error("No IP address found in request");
    return res.status(400).json({ error: "No IP address found" });
  }

  try {
    const countryCode = await resolveCountryCode(ip);

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
