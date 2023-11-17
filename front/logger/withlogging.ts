import tracer from "dd-trace";
import StatsD from "hot-shots";
import { NextApiRequest, NextApiResponse } from "next";

import {
  APIErrorType,
  APIErrorWithStatusCode,
  DustError,
} from "@app/lib/error";
import { assertNever } from "@app/lib/utils";

import logger from "./logger";

export const statsDClient = new StatsD();

export const withLogging = (handler: any, streaming = false) => {
  return async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    const ddtraceSpan = tracer.scope().active();
    if (ddtraceSpan) {
      ddtraceSpan.setTag("streaming", streaming);
    }
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
          // @ts-expect-error best effort to get err.stack if it exists
          error_stack: err?.stack,
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
      streaming ? `streaming:true` : `streaming:false`,
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
      },
      "Processed request"
    );
  };
};

export function apiError(
  req: NextApiRequest,
  res: NextApiResponse,
  apiError?: APIErrorWithStatusCode,
  error?: Error | DustError
): void {
  if (!apiError && error) {
    if (error instanceof DustError) {
      // We have a DustError instance, we map it to an APIErrorWithStatusCode type.
      let httpStatusCode: number | undefined = undefined;
      let apiErrorType: APIErrorType | undefined = undefined;
      const apiErrorMessage =
        error.errorCode === "internal_error"
          ? "Internal Server Error"
          : error.message;

      switch (error.errorCode) {
        case "invalid_user_input":
          httpStatusCode = 400;
          apiErrorType = "invalid_request_error";
          break;
        case "internal_error":
          httpStatusCode = 500;
          apiErrorType = "invalid_request_error";
          break;
        default:
          assertNever(error.errorCode);
      }
      apiError = {
        status_code: httpStatusCode,
        api_error: {
          type: apiErrorType,
          message: apiErrorMessage,
        },
      };
    } else {
      // We have an unknown error, we map it to an APIErrorWithStatusCode type.
      apiError = {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: error.message,
        },
      };
    }
  }

  if (apiError) {
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
  } else {
    throw new Error("apiError and error cannot both be null");
  }
}
