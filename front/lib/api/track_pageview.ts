import config from "@app/lib/api/config";
import { DUST_COOKIES_ACCEPTED } from "@app/lib/cookies";
import { readAnonymousIdFromCookies } from "@app/lib/utils/anonymous_id";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { PostHog } from "posthog-node";

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

export function parseCookieValue(
  cookieHeader: string | undefined,
  name: string
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  const prefix = `${name}=`;
  const match = cookieHeader.split("; ").find((c) => c.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : undefined;
}

type TrackPageviewResult = { type: "rate_limited" } | { type: "ok" };

interface TrackPageviewParams {
  ip: string | undefined;
  cookieHeader: string | undefined;
  userAgent: string | undefined;
  body: Record<string, unknown>;
}

export async function trackPageview({
  ip,
  cookieHeader,
  userAgent,
  body,
}: TrackPageviewParams): Promise<TrackPageviewResult> {
  // Rate limit: max 4 requests per 2 seconds per IP.
  if (ip) {
    const remaining = await rateLimiter({
      key: `server_pageview:${ip}`,
      maxPerTimeframe: 4,
      timeframeSeconds: 2,
      logger,
    });
    if (remaining <= 0) {
      return { type: "rate_limited" };
    }
  }

  const client = getClient();
  if (!client) {
    return { type: "ok" };
  }

  const page_url =
    typeof body?.page_url === "string" ? body.page_url : undefined;
  const referrer =
    typeof body?.referrer === "string" ? body.referrer : undefined;

  // Read anonymous ID from body or cookie fallback.
  const anonymousIdFromBody =
    typeof body?.anonymous_id === "string" ? body.anonymous_id : undefined;
  const anonymousId =
    anonymousIdFromBody ??
    readAnonymousIdFromCookies(cookieHeader) ??
    undefined;

  // Determine consent status from cookie.
  const consentCookie = parseCookieValue(cookieHeader, DUST_COOKIES_ACCEPTED);
  const hasConsent = consentCookie === "true" || consentCookie === "auto";

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

  return { type: "ok" };
}
