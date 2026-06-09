import type { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import tracer from "@app/logger/tracer";
import type { RequestContext } from "@app/types/shared/utils/request_context";
import { runWithRequestContext } from "@app/types/shared/utils/request_context";
import { getClientIpFromContext } from "@front-api/lib/request";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";

type RequestLoggerEnv = {
  Variables: {
    auth?: Authenticator;
    session?: SessionWithUser;
    streaming?: boolean;
  };
};

// We skip k8s probes path to avoid noisy logs and skewed distribution
const SKIP_LOGGER_PATHS = new Set([
  "/api/healthz",
  "/api/healthz/ready",
  "/api/healthz/startup",
  "/api/kill",
]);

export const requestLogger = createMiddleware<RequestLoggerEnv>(
  async (c, next) => {
    if (SKIP_LOGGER_PATHS.has(c.req.path) || c.req.method === "OPTIONS") {
      return next();
    }

    // Mutable: `route` starts as the raw URL path and is updated to the matched
    // route pattern in the finally block (routePath is only set after routing).
    // Any unhandled rejection fired from the handler will see the updated value
    // because routing completes before the handler (and any fire-and-forget
    // promises it spawns) run.
    const reqCtx: RequestContext = {
      method: c.req.method,
      route: c.req.path,
      url: c.req.path,
    };

    const startMs = performance.now();
    await runWithRequestContext(reqCtx, async () => {
      try {
        await next();
      } finally {
        const _routePath = routePath(c);
        if (_routePath) {
          // dd-trace's Hono auto-instrumentation can land on a wildcard
          // middleware path (e.g. `/api/w/:wId/*` from
          // `app.use("*", workspaceAuth())`) instead of the matched handler
          // route. Override with Hono's own routePath, which always points at
          // the handler that ran.
          const span = tracer.scope().active();
          if (span) {
            span.setTag("resource.name", `${c.req.method} ${_routePath}`);
          }
          reqCtx.route = _routePath;
        }
      }
    });

    const durationMs = Math.round(performance.now() - startMs);

    const statusCode = c.res.status;
    const route = routePath(c) ?? c.req.path;

    const clientIp = getClientIpFromContext(c);

    const auth = c.get("auth");
    const session = c.get("session");
    const streaming = c.get("streaming") ?? false;
    const user = auth?.user();

    const tags = [
      `method:${c.req.method}`,
      `streaming:${streaming}`,
      `status_code:${statusCode}`,
    ];
    getStatsDClient().increment("requests.count", 1, tags);
    getStatsDClient().distribution(
      "requests.duration.distribution",
      durationMs,
      tags
    );

    logger.info(
      {
        clientIp,
        durationMs,
        method: c.req.method,
        route,
        sessionId: session?.sessionId ?? "unknown",
        statusCode,
        streaming,
        url: c.req.path,
        ...(user ? { user: { sId: user.sId } } : {}),
        workspaceId: auth?.workspace()?.sId,
      },
      "Processed request"
    );
  }
);
