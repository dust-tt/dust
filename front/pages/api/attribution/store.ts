import type { NextApiRequest, NextApiResponse } from "next";

import { DUST_COOKIES_ACCEPTED } from "@app/lib/cookies";
import logger from "@app/logger/logger";

/**
 * Cookie expiration in seconds (90 days to match Google Ads attribution window).
 */
const COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

/**
 * Server-side endpoint to set attribution cookies.
 * This bypasses Safari ITP which limits client-set cookies to 24 hours.
 *
 * POST /api/attribution/store
 * Body: { firstTouch?: TrackingData, lastTouch?: TrackingData }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean } | { error: string }>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // GDPR: Check consent cookie before setting attribution cookies
  const consentCookie = req.cookies[DUST_COOKIES_ACCEPTED];
  if (consentCookie !== "true" && consentCookie !== "auto") {
    return res.status(403).json({ error: "Consent required" });
  }

  try {
    const { firstTouch, lastTouch } = req.body;

    const cookieOptions = [
      `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
      "Path=/",
      "SameSite=Lax",
      "HttpOnly",
    ].join("; ");

    const cookies: string[] = [];

    if (firstTouch) {
      cookies.push(
        `dust_attr_first=${encodeURIComponent(JSON.stringify(firstTouch))}; ${cookieOptions}`
      );
    }

    if (lastTouch) {
      cookies.push(
        `dust_attr_last=${encodeURIComponent(JSON.stringify(lastTouch))}; ${cookieOptions}`
      );
    }

    if (cookies.length > 0) {
      res.setHeader("Set-Cookie", cookies);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error({ error }, "Error storing attribution cookies");
    return res.status(500).json({ error: "Failed to store attribution" });
  }
}
