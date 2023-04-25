import { Request, Response } from "express";

import { APIErrorWithStatusCode } from "@connectors/lib/error";

import logger from "./logger";

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
          duration: `${elapsed} ms`,
          error: err,
          // @ts-expect-error we can't really know what the error is
          error_stack: err?.stack,
        },
        "Unhandled API Error"
      );

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
  req: Request,
  res: Response,
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

  res.status(error.status_code).json({
    error: error.api_error,
  });
  return;
}
