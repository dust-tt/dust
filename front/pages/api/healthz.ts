import { StatsD } from "hot-shots";
import type { NextApiRequest, NextApiResponse } from "next";

import { runOnRedis } from "@app/lib/api/redis";
import { PRESTOP_SHUTDOWN_KEY } from "@app/pages/api/[preStopSecret]/prestop";

export const statsDClient = new StatsD();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const start = performance.now();

  // Check if prestop has been called
  const isShuttingDown = await runOnRedis({ origin: "lock" }, async (redis) => {
    const prestopState = await redis.get(PRESTOP_SHUTDOWN_KEY);
    return prestopState === "true";
  });

  if (isShuttingDown) {
    res.status(503).send("shutting down");
    const elapsed = performance.now() - start;
    statsDClient.distribution("requests.health.check", elapsed);
    return;
  }

  res.status(200).send("ok");

  const elapsed = performance.now() - start;

  statsDClient.distribution("requests.health.check", elapsed);
}
