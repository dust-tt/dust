import config from "@app/lib/api/config";
import { DUST_COOKIES_ACCEPTED } from "@app/lib/cookies";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { readAnonymousIdFromCookies } from "@app/lib/utils/anonymous_id";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
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

function getClientIp(req: NextApiRequest): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  return isString(forwarded)
    ? forwarded.split(",")[0].trim()
    : req.socket.remoteAddress;
}

function getCookieValue(req: NextApiRequest, name: string): string | undefined {
  const cookies = req.headers.cookie;
  if (!cookies) {
    return undefined;
  }
  const prefix = `${name}=`;
  const match = cookies.split("; ").find((c) => c.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : undefined;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<{ ok: boolean }>>,
  _context: { session: SessionWithUser | null }
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST is supported.",
      },
    });
  }

  const ip = getClientIp(req);

  // Rate limit: max 4 requests per 2 seconds per IP.
  if (ip) {
    const remaining = await rateLimiter({
      key: `server_pageview:${ip}`,
      maxPerTimeframe: 4,
      timeframeSeconds: 2,
      logger,
    });
    if (remaining <= 0) {
      res.status(429).json({ ok: false });
      return;
    }
  }

  const client = getClient();
  if (!client) {
    res.status(200).json({ ok: true });
    return;
  }

  const { page_url, referrer } = req.body as {
    page_url?: string;
    referrer?: string;
  };

  // Read anonymous ID from body or cookie fallback.
  const anonymousId =
    (req.body as { anonymous_id?: string }).anonymous_id ??
    readAnonymousIdFromCookies(req.headers.cookie) ??
    undefined;

  // Determine consent status from cookie.
  const consentCookie = getCookieValue(req, DUST_COOKIES_ACCEPTED);
  const hasConsent = consentCookie === "true" || consentCookie === "auto";

  const userAgent = req.headers["user-agent"] ?? undefined;

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

  res.status(200).json({ ok: true });
}

export default withLogging(handler);
