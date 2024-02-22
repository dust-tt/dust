import type {
  APIErrorWithStatusCode,
  WithAPIErrorReponse,
} from "@dust-tt/types";
import tracer from "dd-trace";
import StatsD from "hot-shots";
import type {
  GetServerSideProps,
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
  PreviewData,
} from "next";
import type { ParsedUrlQuery } from "querystring";

import logger from "./logger";

export const statsDClient = new StatsD();

export function withLogging<T>(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorReponse<T>>
  ) => Promise<void>,
  streaming = false
) {
  return async (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorReponse<T>>
  ): Promise<void> => {
    const ddtraceSpan = tracer.scope().active();
    if (ddtraceSpan) {
      ddtraceSpan.setTag("streaming", streaming);
    }
    const now = new Date();

    logger.info(
      {
        method: req.method,
        url: req.url,
      },
      "Begin Request Processing."
    );

    let route = req.url;
    if (route) {
      route = route.split("?")[0];
      for (const key in req.query) {
        const value = req.query[key];
        if (typeof value === "string" && value.length > 0) {
          route = route.replaceAll(value, `[${key}]`);
        }
      }
    }

    try {
      await handler(req, res);
    } catch (err) {
      const elapsed = new Date().getTime() - now.getTime();
      logger.error(
        {
          method: req.method,
          url: req.url,
          route,
          durationMs: elapsed,
          streaming,
          error: err,
          // @ts-expect-error best effort to get err.stack if it exists
          error_stack: err?.stack,
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
      streaming ? `streaming:true` : `streaming:false`,
      `status_code:${res.statusCode}`,
    ];

    statsDClient.increment("requests.count", 1, tags);
    statsDClient.distribution("requests.duration.distribution", elapsed, tags);

    logger.info(
      {
        method: req.method,
        url: req.url,
        route,
        statusCode: res.statusCode,
        durationMs: elapsed,
        streaming,
      },
      "Processed request"
    );
  };
}

export function apiError<T>(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<T>>,
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

export function withGetServerSidePropsLogging<T extends { [key: string]: any }>(
  getServerSideProps: GetServerSideProps<T>
): GetServerSideProps<T> {
  return async (
    context: GetServerSidePropsContext<ParsedUrlQuery, PreviewData>
  ) => {
    const now = new Date();

    let route = context.resolvedUrl.split("?")[0];
    for (const key in context.params) {
      const value = context.params[key];
      if (typeof value === "string" && value.length > 0) {
        route = route.replaceAll(value, `[${key}]`);
      }
    }

    try {
      const res = await getServerSideProps(context);

      const elapsed = new Date().getTime() - now.getTime();

      let returnType = "props";
      if ("notFound" in res) {
        returnType = "not_found";
      }
      if ("redirect" in res) {
        returnType = "redirect";
      }

      const tags = [`returnType:${returnType}`, `route:${route}`];

      statsDClient.increment("get_server_side_props.count", 1, tags);
      statsDClient.distribution(
        "get_server_side_props.duration.distribution",
        elapsed,
        tags
      );

      logger.info(
        {
          returnType,
          url: context.resolvedUrl,
          route,
          durationMs: elapsed,
        },
        "Processed getServerSideProps"
      );

      return res;
    } catch (err) {
      const elapsed = new Date().getTime() - now.getTime();

      logger.error(
        {
          returnType: "error",
          durationMs: elapsed,
          url: context.resolvedUrl,
          route,
          error: err,
          // @ts-expect-error best effort to get err.stack if it exists
          error_stack: err?.stack,
        },
        "Unhandled getServerSideProps Error"
      );

      statsDClient.increment(
        "get_server_side_props_unhandled_errors.count",
        1,
        [`route:${route}`]
      );

      throw err;
    }
  };
}
