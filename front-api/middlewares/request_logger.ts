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
    skipRequestLog?: boolean;
  };
};

export type SkipRequestLogEnv = {
  Variables: {
    skipRequestLog?: boolean;
  };
};

// Mark a route subtree as too noisy to log. Mount it (`app.use("*",
// skipRequestLog)`) inside the route module that should opt out; requestLogger
// reads the flag after the handler runs and drops the log line.
export const skipRequestLog = createMiddleware<SkipRequestLogEnv>(
  async (c, next) => {
    c.set("skipRequestLog", true);
    return next();
  }
);

// We skip k8s probes path to avoid noisy logs and skewed distribution
const SKIP_LOGGER_PATHS = new Set([
  "/api/healthz",
  "/api/healthz/ready",
  "/api/healthz/startup",
  "/api/kill",
]);

// In-flight request tracking, used to report (per request) the peak number of
// requests processed concurrently during its lifetime. `activeRequests` is the
// live count; each in-flight request holds a mutable `peak` that we raise
// whenever a newly arrived request pushes concurrency higher than what that
// request has seen so far.
let activeRequests = 0;
const inFlightPeaks = new Set<{ peak: number }>();

export const requestLogger = createMiddleware<RequestLoggerEnv>(
  async (c, next) => {
    if (SKIP_LOGGER_PATHS.has(c.req.path) || c.req.method === "OPTIONS") {
      // Also drop the APM trace so these requests don't show up in Datadog.
      tracer.scope().active()?.setTag("manual.drop", true);
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

    // Register this request as in-flight and raise the peak of every other
    // in-flight request to the new concurrency level. The set size equals the
    // current concurrency (bounded by the in-flight requests handled by a
    // single pod, typically well under a hundred), so this loop stays cheap.
    activeRequests += 1;
    const peakRef = { peak: activeRequests };
    for (const ref of inFlightPeaks) {
      if (activeRequests > ref.peak) {
        ref.peak = activeRequests;
      }
    }
    inFlightPeaks.add(peakRef);

    const startMs = performance.now();
    await runWithRequestContext(reqCtx, async () => {
      try {
        await next();
      } finally {
        inFlightPeaks.delete(peakRef);
        activeRequests -= 1;

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
    const user =
      auth && typeof auth.user === "function" ? auth.user() : undefined;

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

    // Routes that opted out via `skipRequestLog` are too noisy to log. The flag
    // is set by a downstream route middleware, so it is only readable here,
    // after `next()` has run the handler.
    if (!c.get("skipRequestLog")) {
      logger.info(
        {
          clientIp,
          durationMs,
          method: c.req.method,
          peakConcurrency: peakRef.peak,
          route,
          sessionId: session?.sessionId ?? "unknown",
          statusCode,
          streaming,
          url: c.req.path,
          ...(user ? { user: { sId: user.sId } } : {}),
          workspaceId:
            auth && typeof auth.workspace === "function"
              ? auth.workspace()?.sId
              : undefined,
        },
        "Processed request"
      );
    }
  }
);
