import { Hono } from "hono";
import { PostHog } from "posthog-node";

import config from "@app/lib/api/config";
import { DUST_COOKIES_ACCEPTED } from "@app/lib/cookies";
import { readAnonymousIdFromCookies } from "@app/lib/utils/anonymous_id";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { getClientIp } from "@app/lib/utils/request";
import logger from "@app/logger/logger";

import { parseCookieHeader } from "@front-api/middleware/utils";

const POSTHOG_HOST = "https://eu.i.posthog.com";

let posthogClient: PostHog | null = null;

function getClient(): PostHog | null {
  if (posthogClient) {
    return posthogClient;
  }

  const apiKey = config.getPostHogApiKey();
  if (!apiKey) {
    return null;
  }

  posthogClient = new PostHog(apiKey, { host: POSTHOG_HOST });
  return posthogClient;
}

// Mounted at /api/t/pv.
const app = new Hono();

app.post("/", async (c) => {
  const headers: Record<string, string | string[] | undefined> = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const ipRaw = getClientIp({ headers });
  const ip = ipRaw === "internal" ? undefined : ipRaw;

  // Rate limit: max 4 requests per 2 seconds per IP.
  if (ip) {
    const remaining = await rateLimiter({
      key: `server_pageview:${ip}`,
      maxPerTimeframe: 4,
      timeframeSeconds: 2,
      logger,
    });
    if (remaining <= 0) {
      return c.json({ ok: false }, 429);
    }
  }

  const client = getClient();
  if (!client) {
    return c.json({ ok: true });
  }

  const body = await c.req.json().catch(() => ({}));
  const page_url =
    typeof body?.page_url === "string" ? body.page_url : undefined;
  const referrer =
    typeof body?.referrer === "string" ? body.referrer : undefined;

  // Read anonymous ID from body or cookie fallback.
  const cookieHeader = c.req.header("cookie");
  const anonymousIdFromBody =
    typeof body?.anonymous_id === "string" ? body.anonymous_id : undefined;
  const anonymousId =
    anonymousIdFromBody ??
    readAnonymousIdFromCookies(cookieHeader) ??
    undefined;

  // Determine consent status from cookie.
  const cookies = parseCookieHeader(cookieHeader);
  const consentCookie = cookies[DUST_COOKIES_ACCEPTED];
  const hasConsent = consentCookie === "true" || consentCookie === "auto";

  const userAgent = c.req.header("user-agent") ?? undefined;

  // The anonymous device ID is the primary identifier. If the user is logged
  // in, the PostHog alias created at login time will link events to their
  // identified person profile.
  const distinctId = anonymousId ?? `anon_${Date.now()}`;

  try {
    client.capture({
      distinctId,
      event: "server_pageview",
      properties: {
        page_url: page_url ?? undefined,
        referrer: referrer ?? undefined,
        user_agent: userAgent,
        // Only include IP when the visitor has given consent (or is non-GDPR auto-accepted).
        ip: hasConsent ? ip : null,
        dust_anonymous_id: anonymousId ?? null,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to capture server_pageview on PostHog");
  }

  return c.json({ ok: true });
});

export default app;
