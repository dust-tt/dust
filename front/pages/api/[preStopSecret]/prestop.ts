import type { NextApiRequest, NextApiResponse } from "next";

import { wakeLockIsFree } from "@app/lib/wake_lock";
import logger from "@app/logger/logger";
import { withLogging } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const { preStopSecret } = req.query;
  const { PRESTOP_SECRET } = process.env;
  if (!PRESTOP_SECRET) {
    logger.error("PRESTOP_SECRET is not defined");
  }
  if (
    req.method !== "POST" ||
    !PRESTOP_SECRET ||
    preStopSecret !== PRESTOP_SECRET
  ) {
    res.status(404).end();
    return;
  }

  logger.info("Received prestop request, waiting 10s");
  await new Promise((resolve) => setTimeout(resolve, 10000));

  while (!wakeLockIsFree()) {
    logger.info("Waiting for wake lock to be free");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  res.status(200).end();
}

export default withLogging(handler);
