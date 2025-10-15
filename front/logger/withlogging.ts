import tracer from "dd-trace";
import type {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from "next";

import { getSession } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import type {
  CustomGetServerSideProps,
  UserPrivilege,
} from "@app/lib/iam/session";
import type {
  BaseResource,
  ResourceLogJSON,
} from "@app/lib/resources/base_resource";
import type { APIErrorWithStatusCode, WithAPIErrorResponse } from "@app/types";
import { isString, normalizeError } from "@app/types";

import logger from "./logger";
import { statsDClient } from "./statsDClient";

export type RequestContext = {
  [key: string]: ResourceLogJSON;
};

const EMPTY_LOG_CONTEXT = Object.freeze({});

function getClientIp(
  req: GetServerSidePropsContext["req"] | NextApiRequest
): string | undefined {
  const { "x-forwarded-for": forwarded } = req.headers;

  return isString(forwarded)
    ? forwarded.split(",")[0].trim()
    : req.socket.remoteAddress;
}

// Make the elements undefined temporarily avoid updating all NextApiRequest to NextApiRequestWithContext.
export interface NextApiRequestWithContext extends NextApiRequest {
  logContext?: RequestContext;
  // We don't care about the sequelize type, any is ok
  addResourceToLog?: (resource: BaseResource<any>) => void;
}

export function withLogging<T>(
  handler: (
    req: NextApiRequestWithContext,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    context: { session: SessionWithUser | null }
  ) => Promise<void>,
  streaming = false
) {
  return async (
    req: NextApiRequestWithContext,
    res: NextApiResponse<WithAPIErrorResponse<T>>
  ): Promise<void> => {
    const ddtraceNextRequestSpan = tracer.scope().active();
    if (ddtraceNextRequestSpan) {
      // Tag the current active span (usually `next.request`) with a "streaming" flag
      // so we can filter these requests later in Datadog traces and analytics.
      ddtraceNextRequestSpan.setTag("streaming", streaming);

      if (streaming) {
        // For streaming requests, change the operation name of the *current span*
        // from `next.request` to `next.request.streaming` so that:
        //   1. It appears as a separate operation in the Datadog APM "operation" dropdown,
        //      making it easy to isolate streaming traffic from regular requests.
        //   2. You can analyze streaming request performance and error rates independently,
        //      without mixing them into standard request metrics.
        //   3. Without this separation, the long-lived nature of streaming requests would
        //      inflate and skew p95/p99 latency metrics, making them unrepresentative of
        //      typical request performance.
        //
        // Note: This changes only the Next.js request span, not the root `web.request` span.
        // That means streaming requests will still be counted in `web.request` service-level
        // latency metrics unless you also update the root span.
        ddtraceNextRequestSpan.setOperationName("next.request.streaming");
      }
    }
    const clientIp = getClientIp(req);
    const now = new Date();

    const session = await getSession(req, res);
    const sessionId = session?.sessionId ?? "unknown";

    // Use freeze to make sure we cannot update `req.logContext` down the callstack
    req.logContext = EMPTY_LOG_CONTEXT;
    req.addResourceToLog = (resource) => {
      const logContext = resource.toLogJSON();

      req.logContext = Object.freeze({
        ...(req.logContext ?? {}),
        [resource.className()]: logContext,
      });
    };

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
    const extensionVersion =
      req.headers["x-dust-extension-version"] ?? req.query.extensionVersion;
    const cliVersion =
      req.headers["x-dust-cli-version"] ?? req.query.cliVersion;

    try {
      await handler(req, res, {
        session,
      });
    } catch (err) {
      const elapsed = new Date().getTime() - now.getTime();
      const error = normalizeError(err);
      logger.error(
        {
          clientIp,
          cliVersion,
          commitHash,
          durationMs: elapsed,
          error: err,
          extensionVersion,
          method: req.method,
          route,
          sessionId,
          streaming,
          url: req.url,
          error_stack: error.stack,
          ...(error.stack
            ? {
                error: {
                  message: error.message || "unknown",
                  stack: error.stack,
                },
              }
            : {}),
          workspaceId,
          ...req.logContext,
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

    // Keep metric cardinality low for cost optimization
    // Previously tagging by route created high cardinality (~$3k/month for 2 metrics)
    const tags = [
      `method:${req.method}`,
      streaming ? `streaming:true` : `streaming:false`,
      `status_code:${res.statusCode}`,
    ];

    statsDClient.increment("requests.count", 1, tags);
    statsDClient.distribution("requests.duration.distribution", elapsed, tags);

    logger.info(
      {
        clientIp,
        cliVersion,
        commitHash,
        durationMs: elapsed,
        extensionVersion,
        method: req.method,
        route,
        sessionId,
        statusCode: res.statusCode,
        streaming,
        url: req.url,
        workspaceId,
        ...req.logContext,
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
  const callstack = new Error().stack;
  const errorAttrs = {
    message: (error && error.message) ?? apiError.api_error.message,
    kind: apiError.api_error.type,
    stack: (error && error.stack) ?? callstack,
  };
  logger.error(
    {
      method: req.method,
      url: req.url,
      statusCode: apiError.status_code,
      apiError: { ...apiError, callstack },
      error: errorAttrs,
    },
    "API Error"
  );

  const span = tracer.scope().active();
  if (span) {
    span.setTag("error.message", errorAttrs.message);
    span.setTag("error.stack", errorAttrs.stack);
  }

  const tags = [
    `method:${req.method}`,
    `status_code:${apiError.status_code}`,
    `error_type:${apiError.api_error.type}`,
  ];

  statsDClient.increment("api_errors.count", 1, tags);

  res.status(apiError.status_code).json({
    error: apiError.api_error,
  });
  return;
}

export function withGetServerSidePropsLogging<
  T extends { [key: string]: any },
  RequireUserPrivilege extends UserPrivilege = "user",
>(
  getServerSideProps: CustomGetServerSideProps<
    T,
    any,
    any,
    RequireUserPrivilege
  >
): CustomGetServerSideProps<T, any, any, RequireUserPrivilege> {
  return async (context, auth, session) => {
    const now = new Date();
    const clientIp = getClientIp(context.req);

    let route = context.resolvedUrl.split("?")[0];
    for (const key in context.params) {
      const value = context.params[key];
      if (typeof value === "string" && value.length > 0) {
        route = route.replaceAll(value, `[${key}]`);
      }
    }

    try {
      const res = await getServerSideProps(context, auth, session);

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
      statsDClient.distribution(
        "get_server_side_props.response_size.distribution",
        Buffer.byteLength(JSON.stringify(res)),
        tags
      );

      logger.info(
        {
          returnType,
          url: context.resolvedUrl,
          route,
          durationMs: elapsed,
          clientIp,
        },
        "Processed getServerSideProps"
      );

      return res;
    } catch (err) {
      const elapsed = new Date().getTime() - now.getTime();
      const error = normalizeError(err);

      logger.error(
        {
          returnType: "error",
          durationMs: elapsed,
          url: context.resolvedUrl,
          route,
          clientIp,
          error: {
            message: error.message,
            stack: error.stack,
          },
          error_stack: error.stack,
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
