import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import tracer from "@app/logger/tracer";
import { getSequelizeErrorDetails } from "@app/logger/withlogging";
import type {
  APIErrorResponse,
  APIErrorType,
  APIErrorWithContentfulStatusCode,
} from "@app/types/error";
import { EXPECTED_API_ERROR_TYPES } from "@app/types/error";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { getClientIpFromContext } from "@front-api/lib/request";
import type { Context, ErrorHandler, TypedResponse } from "hono";
import { HTTPException } from "hono/http-exception";
import { routePath } from "hono/route";

/**
 * Return type for a Hono JSON handler. Wraps the success body type with the
 * shared API error envelope so `ctx.json(...)` success returns and
 * `apiError(...)` returns are both assignable.
 */
export type HandlerResult<T> = Promise<TypedResponse<T | APIErrorResponse>>;

/**
 * Returns a JSON error response from an `APIErrorWithStatusCode` and emits
 * the same logging / tracing / statsd side-effects as `apiError` in
 * `front/logger/withlogging.ts`. Use this for every error path in a Hono
 * handler — do not call `ctx.json({ error: ... }, status)` directly, so the
 * observability behavior stays consistent across Next and Hono.
 *
 * Pass `error` when forwarding an underlying exception so its message and
 * stack are captured in the log instead of the synthetic one.
 */
export function apiError(
  ctx: Context,
  err: APIErrorWithContentfulStatusCode,
  error?: Error
) {
  const callstack = new Error().stack;
  const errorAttrs = {
    message: error?.message ?? err.api_error.message,
    kind: err.api_error.type,
    stack: error?.stack ?? callstack,
  };

  // Some error types are expected outcomes of normal operation (e.g. a region
  // redirect) rather than failures. Log those at `info` so they don't pollute
  // error monitoring.
  const logLevel = EXPECTED_API_ERROR_TYPES.has(err.api_error.type)
    ? "info"
    : "error";

  logger[logLevel](
    {
      method: ctx.req.method,
      url: ctx.req.path,
      statusCode: err.status_code,
      apiError: { ...err, callstack },
      error: errorAttrs,
    },
    "API Error"
  );

  const span = tracer.scope().active();
  if (span) {
    span.setTag("error.message", errorAttrs.message);
    span.setTag("error.stack", errorAttrs.stack);
  }

  getStatsDClient().increment("api_errors.count", 1, [
    `method:${ctx.req.method}`,
    `status_code:${err.status_code}`,
    `error_type:${err.api_error.type}`,
  ]);

  return ctx.json({ error: err.api_error }, err.status_code);
}

/**
 * Hono `onError` handler for unhandled exceptions thrown by middlewares or
 * route handlers. Mirrors the `catch` branch of `withLogging` in
 * `front/logger/withlogging.ts` so the Hono service produces the same
 * "Unhandled API Error" log and `api_errors.count` metric as the Next.js
 * service when a handler throws.
 *
 * Returns a 500 JSON envelope. The companion `requestLogger` middleware
 * deliberately does NOT emit `requests.count` / `requests.duration.distribution`
 * on the throw path (the throw propagates past its emit code), matching the
 * Next.js behavior where unhandled errors do not contribute to request
 * throughput / latency metrics.
 */
export const unhandledErrorHandler: ErrorHandler = (err, ctx) => {
  // Hono throws `HTTPException` for client-facing errors raised inside the app
  // before our handlers run — most notably the JSON body parse failure in
  // `@hono/zod-validator` ("Malformed JSON in request body"). These are client
  // mistakes (4xx), not server errors: log them at `info` and return their
  // intended status instead of treating them as an unhandled 500.
  if (err instanceof HTTPException) {
    const type: APIErrorType =
      err.status >= 500 ? "internal_server_error" : "invalid_request_error";

    logger.info(
      {
        method: ctx.req.method,
        route: routePath(ctx) ?? ctx.req.path,
        url: ctx.req.path,
        statusCode: err.status,
        error: { name: err.name, message: err.message },
      },
      "Client API Error"
    );

    getStatsDClient().increment("api_errors.count", 1, [
      `method:${ctx.req.method}`,
      `status_code:${err.status}`,
      `error_type:${type}`,
    ]);

    return ctx.json({ error: { type, message: err.message } }, err.status);
  }

  const error = normalizeError(err);
  const sequelizeDetails = getSequelizeErrorDetails(error);

  logger.error(
    {
      clientIp: getClientIpFromContext(ctx),
      method: ctx.req.method,
      route: routePath(ctx) ?? ctx.req.path,
      url: ctx.req.path,
      error: {
        name: error.name,
        message: error.message || "unknown",
        stack: error.stack,
        // `TypeError: fetch failed` and similar wrappers carry the real reason
        // (ECONNREFUSED, ENOTFOUND, timeouts, ...) on `cause` — log it so these
        // are diagnosable from the message alone.
        ...(error.cause ? { cause: error.cause } : {}),
        ...(sequelizeDetails ? { sequelizeDetails } : {}),
      },
      error_stack: error.stack,
    },
    "Unhandled API Error"
  );

  getStatsDClient().increment("api_errors.count", 1, [
    `method:${ctx.req.method}`,
    `status_code:500`,
    `error_type:unhandled_internal_server_error`,
  ]);

  return ctx.json(
    {
      error: {
        type: "internal_server_error",
        message: `Unhandled internal server error: ${error.message}`,
      },
    },
    500
  );
};
