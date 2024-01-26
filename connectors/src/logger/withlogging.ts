import type {
  ConnectorsAPIErrorWithStatusCode,
  WithConnectorsAPIErrorReponse,
} from "@dust-tt/types";
import type { Request, Response } from "express";
import StatsD from "hot-shots";

import logger from "@connectors/logger/logger";

export const statsDClient = new StatsD();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const withLogging = (handler: any) => {
  return async (req: Request, res: Response): Promise<void> => {
    const now = new Date();
    try {
      await handler(req, res);
    } catch (err) {
      const elapsed = new Date().getTime() - now.getTime();
      logger.error(
        {
          method: req.method,
          url: req.url,
          durationMs: elapsed,
          error: err,
          // @ts-expect-error we can't really know what the error is
          error_stack: err?.stack,
          headers: req.headers,
        },
        "Unhandled API Error"
      );

      const tags = [
        `method:${req.method}`,
        // `url:${req.url}`,
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
      // Removed due to high cardinality
      // `url:${req.url}`,
      `status_code:${res.statusCode}`,
    ];

    statsDClient.increment("requests.count", 1, tags);
    statsDClient.distribution("requests.duration.distribution", elapsed, tags);

    logger.info(
      {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        durationMs: elapsed,
        headers: req.headers,
      },
      "Processed request"
    );
  };
};

export function apiError<T>(
  req: Request,
  res: Response<WithConnectorsAPIErrorReponse<T>>,
  apiError: ConnectorsAPIErrorWithStatusCode,
  error?: Error
): void {
  logger.error(
    {
      method: req.method,
      url: req.url,
      statusCode: apiError.status_code,
      apiError: apiError,
      error: error,
    },
    "API Error"
  );

  const tags = [
    `method:${req.method}`,
    // `url:${req.url}`,
    `status_code:${res.statusCode}`,
    `error_type:${apiError.api_error.type}`,
  ];

  statsDClient.increment("api_errors.count", 1, tags);

  res.status(apiError.status_code).json({
    error: apiError.api_error,
  });
  return;
}
