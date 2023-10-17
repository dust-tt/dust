import { NextApiRequest, NextApiResponse } from "next";

import logger from "@app/logger/logger";
import { pendingRequestsCount, withLogging } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const { preStopSecret } = req.query;
  const { PRE_STOP_SECRET } = process.env;
  if (!PRE_STOP_SECRET) {
    logger.error("PRE_STOP_SECRET is not defined");
  }
  if (
    req.method !== "POST" ||
    !PRE_STOP_SECRET ||
    preStopSecret !== PRE_STOP_SECRET
  ) {
    res.status(404).end();
    return;
  }

  let count = pendingRequestsCount();
  logger.info({ pendingRequestsCount: count }, "Received preStop request");

  // We check count > 1 and not count > 0 because we take into account this request.
  while (count > 1) {
    logger.info(
      { pendingRequestsCount: count },
      "Waiting for pending requests to finish"
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    count = pendingRequestsCount();
  }

  res.status(200).end();
}

export default withLogging(handler);
