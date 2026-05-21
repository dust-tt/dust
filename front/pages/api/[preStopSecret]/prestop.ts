/** @ignoreswagger */
import { runPreStop } from "@app/lib/api/prestop";
import logger from "@app/logger/logger";
import { withLogging } from "@app/logger/withlogging";
import type { NextApiRequest, NextApiResponse } from "next";

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

  await runPreStop();

  res.status(200).end();
}

export default withLogging(handler);
