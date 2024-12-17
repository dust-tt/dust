import tracer from "dd-trace";
import StatsD from "hot-shots";
import type { NextApiRequest, NextApiResponse } from "next";

import logger from "./logger";
import { APIErrorWithStatusCode, WithAPIErrorResponse } from "@app/src/lib/errors";

export const statsDClient = new StatsD();

export function withLogging<T>(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>
  ) => Promise<void>,
  streaming = false
) {
  return async (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>
  ): Promise<void> => {
    const ddtraceSpan = tracer.scope().active();
    if (ddtraceSpan) {
      ddtraceSpan.setTag("streaming", streaming);
    }
    const now = new Date();

    let route = req.url;
    let workspaceId: string | null = null;
    if (route) {
      route = route.split("?")[0];
      for (const key in req.query) {
        if (key === "wId") {
          workspaceId = req.query[key] as string;
        }

        const value = req.query[key];
        if (typeof value === "string" && value.length > 0) {
          route = route.replaceAll(value, `[${key}]`);
        }
      }
    }

    // Extract commit hash from headers or query params.
    const commitHash = req.headers["x-commit-hash"] ?? req.query.commitHash;

    try {
      await handler(req, res);
    } catch (err) {
      const elapsed = new Date().getTime() - now.getTime();
      logger.error(
        {
          commitHash,
          durationMs: elapsed,
          error: err,
          method: req.method,
          route,
          url: req.url,
          // @ts-expect-error best effort to get err.stack if it exists
          error_stack: err?.stack,
          workspaceId,
        },
        "Unhandled API Error"
      );

      const tags = [
        `method:${req.method}`,
        `route:${route}`,
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
      `route:${route}`,
      `status_code:${res.statusCode}`,
    ];

    statsDClient.increment("requests.count", 1, tags);
    statsDClient.distribution("requests.duration.distribution", elapsed, tags);

    logger.info(
      {
        commitHash,
        durationMs: elapsed,
        method: req.method,
        route,
        statusCode: res.statusCode,
        url: req.url,
        workspaceId,
      },
      "Processed request"
    );
  };
}

export function apiError<T>(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<T>>,
  apiError: APIErrorWithStatusCode,
  error?: Error
): void {
  logger.error(
    {
      method: req.method,
      url: req.url,
      statusCode: apiError.status_code,
      apiError: apiError,
      error: error,
      apiErrorHandlerCallStack: new Error().stack,
    },
    "API Error"
  );

  const tags = [
    `method:${req.method}`,
    // `url:${req.url}`,
    `status_code:${apiError.status_code}`,
    `error_type:${apiError.api_error.type}`,
  ];

  statsDClient.increment("api_errors.count", 1, tags);

  res.status(apiError.status_code).json({
    error: apiError.api_error,
  });
  return;
}