import { addFixedWindowCount } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { PublicApiCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";

const ONE_MINUTE_MS = 60_000;

type RouteRateLimit = {
  maxPerMinute: number;
  // When false, requests over the limit are only logged, not blocked.
  isEnforced: boolean;
};

const DEFAULT_RATE_LIMIT: RouteRateLimit = {
  maxPerMinute: 500,
  isEnforced: false,
};

// Keyed by "<METHOD> <route>", with the route as Hono matched it.
const RATE_LIMITS_BY_ROUTE: Record<string, RouteRateLimit> = {
  "GET /api/v1/w/:wId/analytics/export": {
    maxPerMinute: 60,
    isEnforced: true,
  },
};

/**
 * Limits public API requests per minute for each (workspace, route) pair. Must run after
 * `publicApiAuth`.
 */
/**
 * @cc [owner:philipperolet,label:performance;api] system-keys-not-limited
 * Requests authenticated with a system key (connectors syncs, Slack bot, etc.) MUST NOT be
 * counted or blocked.
 */
/**
 * @cc [owner:philipperolet,label:performance;api] store-error-allows
 * When the counter cannot be updated (e.g. Redis is down), the request MUST be let through.
 */
export const publicApiRateLimit = createMiddleware<PublicApiCtx>(
  async (ctx, next) => {
    const auth = ctx.get("auth");
    if (auth.isSystemKey()) {
      return next();
    }

    // `-1` points at the leaf handler Hono selected, e.g. `/api/v1/w/:wId/analytics/export`.
    const route = `${ctx.req.method} ${routePath(ctx, -1)}`;
    const { maxPerMinute, isEnforced } =
      RATE_LIMITS_BY_ROUTE[route] ?? DEFAULT_RATE_LIMIT;
    const workspaceId = auth.getNonNullableWorkspace().sId;

    const minute = Math.floor(Date.now() / ONE_MINUTE_MS);
    const windowEndMs = (minute + 1) * ONE_MINUTE_MS;
    const requestCount = await addFixedWindowCount({
      key: `public_api:${workspaceId}:${route}`,
      bounds: { label: minute.toString(), windowEndMs },
      incrementBy: 1,
      logger,
    });
    if (requestCount === null || requestCount <= maxPerMinute) {
      return next();
    }

    logger.warn(
      { workspaceId, route, requestCount, maxPerMinute, isEnforced },
      "Public API rate limit exceeded"
    );
    if (!isEnforced) {
      return next();
    }

    const retryAfterSeconds = Math.ceil((windowEndMs - Date.now()) / 1000);
    ctx.header("Retry-After", retryAfterSeconds.toString());
    return apiError(ctx, {
      status_code: 429,
      api_error: {
        type: "rate_limit_error",
        message: `Too many requests to this endpoint for this workspace (max ${maxPerMinute} per minute).`,
      },
    });
  }
);
