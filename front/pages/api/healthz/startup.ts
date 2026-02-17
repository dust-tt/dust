import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { frontSequelize } from "@app/lib/resources/storage";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { NextApiRequest, NextApiResponse } from "next";

const DEPENDENCY_CHECK_TIMEOUT_MS = 2000;

const statsDClient = getStatsDClient();

/**
 * Startup probe endpoint.
 *
 * This endpoint checks that critical dependencies (Redis, DB) are connected before the pod starts
 * accepting traffic. It's called during pod startup only.
 *
 * Unlike readiness probes, this doesn't continuously check dependencies. It just ensures
 * connections are established at startup to prevent traffic from hitting pods that aren't ready.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const startMs = performance.now();

  try {
    // Check both Redis and DB with a timeout.
    await Promise.race([
      Promise.all([
        // Check Redis connectivity.
        getRedisHybridManager().ping(),
        // Check DB connectivity.
        frontSequelize.authenticate(),
      ]),

      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Dependency check timeout")),
          DEPENDENCY_CHECK_TIMEOUT_MS
        )
      ),
    ]);

    const durationMs = performance.now() - startMs;
    logger.info(
      { durationMs },
      "Startup probe succeeded - dependencies connected"
    );

    statsDClient.distribution("healthz.startup.duration_ms", durationMs, [
      "status:success",
    ]);

    res.status(200).json({ status: "ready", durationMs });
  } catch (error) {
    const durationMs = performance.now() - startMs;
    logger.warn(
      { error, durationMs },
      "Startup probe failed - dependencies not ready"
    );

    res.status(503).json({
      status: "not ready",
      error: normalizeError(error),
      durationMs,
    });

    statsDClient.distribution("healthz.startup.duration_ms", durationMs, [
      "status:failure",
    ]);
  }
}
