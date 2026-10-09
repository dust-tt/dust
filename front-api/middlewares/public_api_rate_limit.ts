import { addFixedWindowCount } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { PublicApiCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { matchedRoutes, routePath } from "hono/route";

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

// Keyed by the route returned by `getHandlerRoute`.
const RATE_LIMITS_BY_ROUTE: Record<string, RouteRateLimit> = {
  "GET /api/v1/w/:wId/analytics/export": {
    maxPerMinute: 60,
    isEnforced: true,
  },
};

// The route of the handler that will answer, e.g. "GET /api/v1/w/:wId/analytics/export".
function getHandlerRoute(ctx: Context): string {
  // Hono answers HEAD requests with GET handlers.
  const method = ctx.req.method === "HEAD" ? "GET" : ctx.req.method;
  // Middlewares are registered as "ALL", so the first route matching the method is the handler
  // that answers (e.g. `/search` rather than `/:sId` when both match). Unknown routes and
  // unsupported methods fall back to the last matched route.
  const handlerPath =
    matchedRoutes(ctx).find((route) => route.method === method)?.path ??
    routePath(ctx, -1);
  return `${method} ${handlerPath}`;
}

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
 * When updating the counter fails (Redis returns an error), the request MUST be let through.
 */
export const publicApiRateLimit = createMiddleware<PublicApiCtx>(
  async (ctx, next) => {
    const auth = ctx.get("auth");
    if (auth.isSystemKey()) {
      return next();
    }

    const route = getHandlerRoute(ctx);
    const { maxPerMinute, isEnforced } =
      RATE_LIMITS_BY_ROUTE[route] ?? DEFAULT_RATE_LIMIT;
    const workspaceId = auth.getNonNullableWorkspace().sId;

    const epochMinute = Math.floor(Date.now() / ONE_MINUTE_MS);
    const windowEndMs = (epochMinute + 1) * ONE_MINUTE_MS;
    const requestCount = await addFixedWindowCount({
      key: `public_api:${workspaceId}:${route}`,
      bounds: { label: epochMinute.toString(), windowEndMs },
      incrementBy: 1,
      logger,
    });
    if (requestCount === null || requestCount <= maxPerMinute) {
      return next();
    }

    // Logged once per (workspace, route, minute) to keep log volume low.
    if (requestCount === maxPerMinute + 1) {
      logger.warn(
        { workspaceId, route, maxPerMinute, isEnforced },
        "Public API rate limit exceeded"
      );
    }
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
