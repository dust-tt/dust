import StatsD from "hot-shots";
import { NextApiRequest, NextApiResponse } from "next";

import { APIErrorWithStatusCode } from "@app/lib/error";

import logger from "./logger";

export const statsDClient = new StatsD();

export const withLogging = (handler: any) => {
  return async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    const now = new Date();
    try {
      await handler(req, res);
    } catch (err) {
      const elapsed = new Date().getTime() - now.getTime();
      logger.error(
        {
          method: req.method,
          url: req.url,
          duration: `${elapsed} ms`,
          error: err,
          // @ts-expect-error best effort to get err.stack if it exists
          error_stack: err?.stack,
        },
        "Unhandled API Error"
      );

      const tags = [
        `method:${req.method}`,
        `url:${req.url}`,
        `status_code:500`,
        `error_type:unhandled_internal_server_error`,
      ];

      statsDClient.increment("api_errors.count", 1, tags);

      // Try to return a 500 as it's likely nothing was returned yet.
      res.status(500).json({
        error: {
          type: "internal_server_error",
          message: `Unhandled internal server error: ${err}`,
        },
      });
      return;
    }

    const elapsed = new Date().getTime() - now.getTime();

    const tags = [
      `method:${req.method}`,
      `url:${req.url}`,
      `status_code:${res.statusCode}`,
    ];

    statsDClient.increment("requests.count", 1, tags);
    statsDClient.histogram("requests.duration", elapsed, tags);
    statsDClient.distribution("requests.duration.distribution", elapsed, tags);

    logger.info(
      {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${elapsed} ms`,
      },
      "Processed request"
    );
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
