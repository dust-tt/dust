import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { COMMIT_HASH } from "@app/lib/commit-hash";
import { frontSequelize } from "@app/lib/resources/storage";
import { isInShutdown } from "@app/lib/shutdown_signal";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Hono } from "hono";

export const healthzApp = new Hono();

healthzApp.get("/", (ctx) => {
  const startMs = performance.now();
  const response = ctx.text("ok", 200);
  const elapsedMs = performance.now() - startMs;

  getStatsDClient().distribution("requests.health.check", elapsedMs);

  return response;
});

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
healthzApp.get("/ready", (ctx) => {
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

const DEPENDENCY_CHECK_TIMEOUT_MS = 2000;

type DependencyName = "redis" | "database";

interface DependencyResult {
  name: DependencyName;
  ok: boolean;
  error?: string;
  durationMs: number;
}

async function checkDependency(
  name: DependencyName,
  check: () => Promise<unknown>
): Promise<DependencyResult> {
  const startMs = performance.now();
  try {
    await Promise.race([
      check(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${name} check timed out`)),
          DEPENDENCY_CHECK_TIMEOUT_MS
        )
      ),
    ]);
    return { name, ok: true, durationMs: performance.now() - startMs };
  } catch (err) {
    return {
      name,
      ok: false,
      error: normalizeError(err).message,
      durationMs: performance.now() - startMs,
    };
  }
}

/**
 * Startup probe endpoint.
 *
 * This endpoint checks that critical dependencies (Redis, DB) are connected before the pod starts
 * accepting traffic. It's called during pod startup only.
 *
 */
healthzApp.get("/startup", async (ctx) => {
  const startMs = performance.now();

  const results = await Promise.all([
    checkDependency("redis", () => getRedisHybridManager().ping()),
    checkDependency("database", () =>
      // biome-ignore lint/plugin: health check needs direct DB ping
      frontSequelize.query("SELECT 1")
    ),
  ]);

  const failed = results.filter((r) => !r.ok);
  const durationMs = performance.now() - startMs;

  if (failed.length === 0) {
    logger.info(
      { durationMs, results },
      "Startup probe succeeded - dependencies connected"
    );

    getStatsDClient().distribution("healthz.startup.duration_ms", durationMs, [
      "status:success",
    ]);

    return ctx.json(
      { status: "ready", durationMs, dependencies: results },
      200
    );
  }

  logger.warn(
    { durationMs, results, failedDependencies: failed.map((r) => r.name) },
    `Startup probe failed - ${failed.map((r) => r.name).join(", ")} not ready`
  );

  getStatsDClient().distribution("healthz.startup.duration_ms", durationMs, [
    "status:failure",
  ]);

  return ctx.json(
    { status: "not ready", durationMs, dependencies: results },
    503
  );
});
