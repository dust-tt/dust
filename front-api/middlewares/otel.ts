import { trace } from "@opentelemetry/api";
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_ROUTE,
} from "@opentelemetry/semantic-conventions";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";

const tracer = trace.getTracer("dust-front-api");

// Resolve the matched leaf route *before* `next()`. Hono only points
// `routePath(c)` at the handler once the outer middleware yields, but
// `routePath(c, -1)` returns the last (most specific) matched route — the leaf
// handler — at dispatch time, which is available here before any handler (and
// its DB queries) runs. See https://hono.dev/docs/api/request.
function resolveRoute(c: Context): string {
  try {
    const leaf = routePath(c, -1);
    if (leaf && leaf !== "*" && leaf !== "/*") {
      return leaf;
    }
  } catch {
    // No matched route (e.g. a 404 with an empty match chain) — fall back to
    // the raw request path below.
  }
  return c.req.path;
}

// OpenTelemetry middleware: wraps each request in a span carrying the HTTP
// method and matched route. The span stays active across the whole request, so
// `SequelizeWithComments` (in `front`) can read these attributes and tag SQL
// queries for Cloud SQL Query Insights — mirroring the Next.js instrumentation.
export const otel = createMiddleware(async (c, next) => {
  const method = c.req.method;
  const route = resolveRoute(c);

  // DEBUG: remove after manual testing.
  console.log("[otel middleware]", { method, route, path: c.req.path });

  await tracer.startActiveSpan(
    `${method} ${route}`,
    {
      attributes: {
        [ATTR_HTTP_REQUEST_METHOD]: method,
        [ATTR_HTTP_ROUTE]: route,
      },
    },
    async (span) => {
      try {
        await next();
      } finally {
        span.end();
      }
    }
  );
});
