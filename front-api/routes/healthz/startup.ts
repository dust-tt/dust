import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { frontSequelize } from "@app/lib/resources/storage";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { createHono } from "@front-api/lib/hono";

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
const app = createHono();

/** @ignoreswagger */
app.get("/", async (ctx) => {
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

export default app;
