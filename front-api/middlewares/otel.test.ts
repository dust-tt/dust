import { initializeOpenTelemetryInstrumentation } from "@app/lib/api/instrumentation/init";
import { context as otelContext, trace } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_ROUTE,
} from "@opentelemetry/semantic-conventions";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";

import { otel } from "./otel";

// Registers the TracerProvider + AsyncLocalStorageContextManager so the span
// opened by the middleware is recording and propagates into the handler (the
// same async context in which Sequelize queries run). Langfuse is off in tests,
// so this attaches a NoopSpanProcessor — spans still record, nothing exports.
beforeAll(() => {
  initializeOpenTelemetryInstrumentation({ serviceName: "dust-front-api" });
});

// Reads the route/method that SequelizeWithComments would read from the active
// span at query time.
function readActiveSpanAttributes(): {
  route: string | undefined;
  method: string | undefined;
} {
  const span = trace.getSpan(otelContext.active());
  if (!span) {
    return { route: undefined, method: undefined };
  }
  const attrs = (span as unknown as ReadableSpan).attributes;
  return {
    route: attrs[ATTR_HTTP_ROUTE] ? String(attrs[ATTR_HTTP_ROUTE]) : undefined,
    method: attrs[ATTR_HTTP_REQUEST_METHOD]
      ? String(attrs[ATTR_HTTP_REQUEST_METHOD])
      : undefined,
  };
}

describe("otel middleware", () => {
  it("exposes the fully-composed matched route on the active span inside the handler", async () => {
    // Mirror front-api's nested mounting: app -> /api -> /w/:wId -> handler.
    const subApp = new Hono();
    subApp.get("/members", (c) => c.json(readActiveSpanAttributes()));

    const apiApp = new Hono();
    apiApp.route("/w/:wId", subApp);

    const app = new Hono();
    app.use("*", otel);
    app.route("/api", apiApp);

    const res = await app.request("/api/w/abc123/members");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.method).toBe("GET");
    // The leaf route pattern (low cardinality), not the raw `/api/w/abc123/...`.
    expect(body.route).toBe("/api/w/:wId/members");
  });

  it("falls back to the raw path for unmatched routes", async () => {
    const app = new Hono();
    app.use("*", otel);
    app.notFound((c) => c.json(readActiveSpanAttributes(), 404));

    const res = await app.request("/does/not/exist");
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.method).toBe("GET");
    expect(body.route).toBe("/does/not/exist");
  });
});
