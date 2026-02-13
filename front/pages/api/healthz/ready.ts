import { isInShutdown } from "@app/lib/shutdown_signal";
import { getStatsDClient } from "@app/lib/utils/statsd";
import type { NextApiRequest, NextApiResponse } from "next";

const statsDClient = getStatsDClient();

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
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const startMs = performance.now();

  // Check if pod is shutting down.
  if (isInShutdown()) {
    const durationMs = performance.now() - startMs;
    statsDClient.distribution("healthz.ready.duration_ms", durationMs);
    statsDClient.increment("healthz.ready.shutdown");

    res.status(503).json({ status: "shutting_down" });
    return;
  }

  // Simple check, just verify process is responsive.
  res.status(200).json({ status: "ready" });

  const durationMs = performance.now() - startMs;
  statsDClient.distribution("healthz.ready.duration_ms", durationMs);
}
