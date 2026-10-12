import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { PublicApiCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";

const ONE_MINUTE_IN_SECONDS = 60;

/**
 * Limits the requests per minute to the route it is attached to, for each workspace. Attach it to
 * the handler, e.g. `app.get("/", withWorkspaceRateLimit({ maxPerMinute: 60 }), handler)`.
 */
/**
 * @cc [owner:philipperolet,label:performance;api] counted-per-workspace-and-route
 * Requests MUST be counted per workspace and per route the middleware is attached to: two
 * workspaces, or two routes using it, MUST NOT share a counter.
 */
export function withWorkspaceRateLimit({
  maxPerMinute,
}: {
  maxPerMinute: number;
}) {
  return createMiddleware<PublicApiCtx>(async (ctx, next) => {
    const workspaceId = ctx.get("auth").getNonNullableWorkspace().sId;
    // Attached to a handler, `routePath` is that handler's route, e.g.
    // `/api/v1/w/:wId/analytics/export`.
    const remaining = await rateLimiter({
      key: `route:${workspaceId}:${routePath(ctx)}`,
      maxPerTimeframe: maxPerMinute,
      timeframeSeconds: ONE_MINUTE_IN_SECONDS,
      logger,
    });
    if (remaining <= 0) {
      return apiError(ctx, {
        status_code: 429,
        api_error: {
          type: "rate_limit_error",
          message: `Too many requests to this endpoint for this workspace (max ${maxPerMinute} per minute).`,
        },
      });
    }

    return next();
  });
}
