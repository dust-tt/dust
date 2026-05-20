import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import tracer from "@app/logger/tracer";
import type { APIErrorWithStatusCode } from "@app/types/error";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

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
