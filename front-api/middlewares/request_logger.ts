import type { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getClientIp } from "@app/lib/utils/request";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import tracer from "@app/logger/tracer";
import { createMiddleware } from "hono/factory";

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

    const startMs = performance.now();
    try {
      await next();
    } finally {
      const routePath = c.req.routePath;
      if (routePath) {
        // dd-trace's Hono auto-instrumentation can land on a wildcard
        // middleware path (e.g. `/api/w/:wId/*` from
        // `app.use("*", workspaceAuth())`) instead of the matched handler
        // route. Override with Hono's own routePath, which always points at
        // the handler that ran.
        const span = tracer.scope().active();
        if (span) {
          span.setTag("resource.name", `${c.req.method} ${routePath}`);
        }
      }
    }
    const durationMs = Math.round(performance.now() - startMs);

    const statusCode = c.res.status;
    const route = c.req.routePath ?? c.req.path;

    const headers: Record<string, string | string[] | undefined> = {};
    c.req.raw.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const clientIp = getClientIp({ headers });

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
