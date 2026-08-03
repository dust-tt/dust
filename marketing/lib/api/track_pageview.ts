import config from "@marketing/lib/api/config";
import { DUST_COOKIES_ACCEPTED } from "@marketing/lib/cookies";
import { readAnonymousIdFromCookies } from "@marketing/lib/utils/anonymous_id";
import logger from "@marketing/logger/logger";
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

// In-memory IP rate limit: 4 requests per 2s per IP. Per-process only — across
// pods this is best-effort, which is acceptable for pageview spam control.
const RATE_LIMIT_MAX = 4;
const RATE_LIMIT_WINDOW_MS = 2000;
const ipRequestTimestampsMs = new Map<string, number[]>();

function isRateLimited(ip: string, nowMs: number): boolean {
  const cutoffMs = nowMs - RATE_LIMIT_WINDOW_MS;
  const existing = ipRequestTimestampsMs.get(ip) ?? [];
  const recent = existing.filter((tMs) => tMs > cutoffMs);
  if (recent.length >= RATE_LIMIT_MAX) {
    ipRequestTimestampsMs.set(ip, recent);
    return true;
  }
  recent.push(nowMs);
  ipRequestTimestampsMs.set(ip, recent);
  return false;
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
  if (ip && isRateLimited(ip, Date.now())) {
    return { type: "rate_limited" };
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
