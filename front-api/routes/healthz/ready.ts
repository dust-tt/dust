import { COMMIT_HASH } from "@app/lib/commit-hash";
import { isInShutdown } from "@app/lib/shutdown_signal";
import { getStatsDClient } from "@app/lib/utils/statsd";
import { Hono } from "hono";

/**
 * Readiness probe endpoint.
 *
 * This endpoint is checked continuously by Kubernetes to determine if the pod should receive
 * traffic. It's kept simple and doesn't check dependencies to avoid marking all pods unready if
 * Redis/DB have transient issues.
 *
 * During pod shutdown, this probe fails immediately to signal the load balancer to stop
 * sending new connections and begin connection draining.
 *
 * The startup probe (/api/healthz/startup) handles dependency checking at pod startup.
 */
const app = new Hono();

app.get("/", (ctx) => {
  const startMs = performance.now();

  if (isInShutdown()) {
    const durationMs = performance.now() - startMs;
    getStatsDClient().distribution("healthz.ready.duration_ms", durationMs);
    getStatsDClient().increment("healthz.ready.shutdown");

    return ctx.json({ status: "shutting_down" }, 503);
  }

  const response = ctx.json({ status: "ready", commitHash: COMMIT_HASH }, 200);

  const durationMs = performance.now() - startMs;
  getStatsDClient().distribution("healthz.ready.duration_ms", durationMs);

  return response;
});

export default app;
