import StatsD from "hot-shots";
import { NextApiRequest, NextApiResponse } from "next";

import { APIErrorWithStatusCode } from "@app/lib/error";

import logger from "./logger";

export const statsDClient = new StatsD();

export const withLogging = (handler: any) => {
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

export function apiError(
  req: NextApiRequest,
  res: NextApiResponse,
  error: APIErrorWithStatusCode
): void {
  logger.error(
    {
      method: req.method,
      url: req.url,
      statusCode: error.status_code,
      error,
    },
    "API Error"
  );

  const tags = [
    `method:${req.method}`,
    `url:${req.url}`,
    `status_code:${res.statusCode}`,
    `error_type:${error.api_error.type}`,
  ];

  statsDClient.increment("api_errors.count", 1, tags);

  res.status(error.status_code).json({
    error: error.api_error,
  });
  return;
}
