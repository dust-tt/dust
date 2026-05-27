import { getClientIp } from "@app/lib/utils/request";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import tracer from "@app/logger/tracer";
import { getSequelizeErrorDetails } from "@app/logger/withlogging";
import type {
  APIErrorResponse,
  APIErrorType,
  APIErrorWithContentfulStatusCode,
} from "@app/types/error";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Context, ErrorHandler, TypedResponse } from "hono";
import { HTTPException } from "hono/http-exception";

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

  logger.error(
    {
      method: ctx.req.method,
      url: ctx.req.url,
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
 * Hono parses repeated query params (`?k=a&k=b`) as a single string under
 * `ctx.req.query()` (last value wins) and as an array under
 * `ctx.req.queries(k)`. Some public-API schemas accept either form for the
 * same field (e.g. `tags_in`, `parents_in` on data source search), so the
 * raw query needs to be reshaped into a `string | string[]` map before being
 * fed to `safeParse`.
 *
 * Returns a shallow copy of `ctx.req.query()` with any listed
 * `arrayableKeys` replaced by `ctx.req.queries(key)` when present.
 */
export function reshapeQueryWithArrayFields(
  ctx: Context,
  arrayableKeys: readonly string[]
): Record<string, string | string[]> {
  const reshaped: Record<string, string | string[]> = { ...ctx.req.query() };
  for (const key of arrayableKeys) {
    const values = ctx.req.queries(key);
    if (values && values.length > 0) {
      reshaped[key] = values;
    }
  }
  return reshaped;
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
        route: ctx.req.routePath ?? ctx.req.path,
        url: ctx.req.url,
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

  const headers: Record<string, string | string[] | undefined> = {};
  ctx.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });

  logger.error(
    {
      clientIp: getClientIp({ headers }),
      method: ctx.req.method,
      route: ctx.req.routePath ?? ctx.req.path,
      url: ctx.req.url,
      error: {
        name: error.name,
        message: error.message || "unknown",
        stack: error.stack,
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
