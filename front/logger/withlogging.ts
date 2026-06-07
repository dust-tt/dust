import { queryTracker } from "@app/lib/api/query_tracker";
import type {
  CustomGetServerSideProps,
  UserPrivilege,
} from "@app/lib/iam/session";
import { getStatsDClient } from "@app/lib/utils/statsd";
import tracer from "@app/logger/tracer";
import type {
  APIErrorWithStatusCode,
  WithAPIErrorResponse,
} from "@app/types/error";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from "next";
import logger from "./logger";

// Sequelize errors (ValidationError, UniqueConstraintError, etc.) have a
// generic .message ("Validation error") but carry field-level detail in
// .errors[]. This helper extracts that detail for structured logging.
export function getSequelizeErrorDetails(error: Error) {
  if (
    error.name.startsWith("Sequelize") &&
    "errors" in error &&
    Array.isArray(error.errors)
  ) {
    return error.errors.map(
      (e: { message?: string; type?: string; path?: string }) => ({
        message: e.message,
        type: e.type,
        path: e.path,
      })
    );
  }
  return undefined;
}

function getClientIp(
  req: GetServerSidePropsContext["req"] | NextApiRequest
): string | undefined {
  const { "x-forwarded-for": forwarded } = req.headers;

  return isString(forwarded)
    ? forwarded.split(",")[0].trim()
    : req.socket.remoteAddress;
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

  getStatsDClient().increment("api_errors.count", 1, tags);

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

    const queryTrackerStore = { concurrent: 0, peak: 0 };
    try {
      const res = await queryTracker.run(queryTrackerStore, () =>
        getServerSideProps(context, auth, session)
      );

      const elapsed = new Date().getTime() - now.getTime();

      let returnType = "props";
      if ("notFound" in res) {
        returnType = "not_found";
      }
      if ("redirect" in res) {
        returnType = "redirect";
      }

      const tags = [`returnType:${returnType}`, `route:${route}`];

      getStatsDClient().increment("get_server_side_props.count", 1, tags);
      getStatsDClient().distribution(
        "get_server_side_props.duration.distribution",
        elapsed,
        tags
      );
      getStatsDClient().distribution(
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
          peakConcurrentQueries: queryTrackerStore.peak,
        },
        "Processed getServerSideProps"
      );

      return res;
    } catch (err) {
      const elapsed = new Date().getTime() - now.getTime();
      const error = normalizeError(err);

      const sequelizeDetails = getSequelizeErrorDetails(error);

      logger.error(
        {
          returnType: "error",
          durationMs: elapsed,
          url: context.resolvedUrl,
          route,
          clientIp,
          peakConcurrentQueries: queryTrackerStore.peak,
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
            ...(sequelizeDetails ? { sequelizeDetails } : {}),
          },
          error_stack: error.stack,
        },
        "Unhandled getServerSideProps Error"
      );

      getStatsDClient().increment(
        "get_server_side_props_unhandled_errors.count",
        1,
        [`route:${route}`]
      );

      throw err;
    }
  };
}
