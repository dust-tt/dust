import { getClientIp } from "@app/lib/utils/request";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import tracer from "@app/logger/tracer";
import { getSequelizeErrorDetails } from "@app/logger/withlogging";
import type {
  APIErrorResponse,
  APIErrorWithStatusCode,
} from "@app/types/error";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Context, ErrorHandler, TypedResponse } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

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
 *
 * The `status_code` field is typed as `number` but Hono's `ctx.json` expects
 * the narrower `ContentfulStatusCode` — the cast is safe because all our
 * status codes are valid HTTP error codes.
 */
export function apiError(
  ctx: Context,
  err: APIErrorWithStatusCode,
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

  return ctx.json(
    { error: err.api_error },
    err.status_code as ContentfulStatusCode
  );
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

export function parseCookieHeader(
  header: string | undefined
): Record<string, string> {
  if (!header) {
    return {};
  }
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    cookies[trimmed.slice(0, eq)] = decodeURIComponent(trimmed.slice(eq + 1));
  }
  return cookies;
}
