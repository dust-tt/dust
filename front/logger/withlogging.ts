import StatsD from "hot-shots";
import { NextApiRequest, NextApiResponse } from "next";
import logger from "./logger";

const statsDClient = new StatsD();

const withLogging = (handler: any) => {
  return async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    let now = new Date();
    let output = await handler(req, res);
    let elapsed = new Date().getTime() - now.getTime();

    const tags = [
      `method:${req.method}`,
      `url:${req.url}`,
      `status_code:${res.statusCode}`,
    ];

    statsDClient.increment("requests.count", 1, tags);
    statsDClient.histogram("requests.duration", elapsed, tags);

    logger.info(
      {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${elapsed} ms`,
      },
      "Processed request"
    );
    return output;
  };
};

export default withLogging;
