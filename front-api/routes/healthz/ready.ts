import { COMMIT_HASH } from "@app/lib/commit-hash";
import { statsDMetrics } from "@app/lib/utils/statsd";
import { createHono } from "@front-api/lib/hono";

/**
 * Readiness probe endpoint.
 *
 * This endpoint is checked continuously by Kubernetes to determine if the pod should receive
 * traffic. It's kept simple and doesn't check dependencies to avoid marking all pods unready if
 * Redis/DB have transient issues.
 *
 * During Pod termination this probe remains healthy. Kubernetes independently marks
 * terminating endpoints unready, and the preStop hook keeps the process serving while
 * GKE removes the endpoint from the NEG and drains existing connections.
 *
 * The startup probe (/api/healthz/startup) handles dependency checking at pod startup.
 */
const app = createHono();

/** @ignoreswagger */
app.get("/", (ctx) => {
  const startMs = performance.now();

  const response = ctx.json({ status: "ready", commitHash: COMMIT_HASH }, 200);

  const durationMs = performance.now() - startMs;
  statsDMetrics.distribution("healthz.ready.duration_ms", durationMs);

  return response;
});

export default app;
