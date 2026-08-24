import type { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import tracer from "@app/logger/tracer";
import {
  type RequestContext,
  RequestQueryCache,
  type RequestStorage,
} from "@app/types/shared/utils/request_context";
import { getClientIpFromContext } from "@front-api/lib/request";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";

type RequestInstrumentationEnv = {
  Variables: RequestStorage & {
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
// skipRequestLog)`) inside the route module that should opt out;
// requestInstrumentation reads the flag after the handler runs and drops the
// log line.
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

type RouteConcurrencyState = {
  activeRequests: number;
  inFlightPeaks: Set<{ peak: number }>;
};

// In-flight request tracking, used to report (per request) the peak number of
// requests processed concurrently for the same method + route during its
// lifetime. Each route bucket is process-local.
const routeConcurrencyStates = new Map<string, RouteConcurrencyState>();

export const requestInstrumentation =
  createMiddleware<RequestInstrumentationEnv>(async (c, next) => {
    // `-1` points at the leaf handler selected by Hono, which is known before
    // `next()` runs. Store the normalized route early so queries executed by the
    // handler can use it without tagging concrete resource IDs.
    const matchedRoute = routePath(c, -1) || c.req.path;
    const reqCtx: RequestContext = {
      method: c.req.method,
      route: matchedRoute,
      url: c.req.path,
    };
    c.set("requestContext", reqCtx);
    c.set("queryCache", new RequestQueryCache());

    if (SKIP_LOGGER_PATHS.has(c.req.path) || c.req.method === "OPTIONS") {
      // Also drop the APM trace so these requests don't show up in Datadog.
      tracer.scope().active()?.setTag("manual.drop", true);
      return next();
    }

    const concurrencyKey = `${c.req.method} ${matchedRoute}`;
    const routeConcurrencyState = routeConcurrencyStates.get(
      concurrencyKey
    ) ?? {
      activeRequests: 0,
      inFlightPeaks: new Set<{ peak: number }>(),
    };
    routeConcurrencyStates.set(concurrencyKey, routeConcurrencyState);

    // Register this request as in-flight and raise the peak of every other
    // in-flight request on the same method + route to the new concurrency
    // level. The set size is bounded by that route's in-flight requests on one
    // pod, so this loop stays cheap.
    routeConcurrencyState.activeRequests += 1;
    const peakRef = { peak: routeConcurrencyState.activeRequests };
    for (const ref of routeConcurrencyState.inFlightPeaks) {
      if (routeConcurrencyState.activeRequests > ref.peak) {
        ref.peak = routeConcurrencyState.activeRequests;
      }
    }
    routeConcurrencyState.inFlightPeaks.add(peakRef);

    const startMs = performance.now();
    try {
      await next();
    } finally {
      routeConcurrencyState.inFlightPeaks.delete(peakRef);
      routeConcurrencyState.activeRequests -= 1;
      if (routeConcurrencyState.activeRequests === 0) {
        routeConcurrencyStates.delete(concurrencyKey);
      }

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
  });
