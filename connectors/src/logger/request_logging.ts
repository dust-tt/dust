import type { Request, Response } from "express";
import type morgan from "morgan";

const REDACTED_PATH_SEGMENT = "[REDACTED]";

const SAFE_REQUEST_HEADER_NAMES = [
  "content-length",
  "content-type",
  "user-agent",
  "x-dust-clientid",
] as const;

type SafeRequestHeaderName = (typeof SAFE_REQUEST_HEADER_NAMES)[number];
type SafeRequestHeaders = Partial<
  Record<SafeRequestHeaderName, string | string[]>
>;

/**
 * Returns a URL suitable for logging.
 *
 * Query strings are omitted because they can contain credentials or user data.
 * Legacy webhook routes contain a shared secret in their first path segment,
 * which is redacted until those routes can be migrated to header-based auth.
 */
export function sanitizeRequestUrl(url: string | undefined): string {
  if (!url) {
    return "-";
  }

  const queryOrFragmentIndex = url.search(/[?#]/);
  const path =
    queryOrFragmentIndex === -1 ? url : url.slice(0, queryOrFragmentIndex);

  return path
    .replace(/(\/webhooks\/)[^/]+/g, `$1${REDACTED_PATH_SEGMENT}`)
    .replace(
      /(\/webhooks_router_entries\/)[^/]+/g,
      `$1${REDACTED_PATH_SEGMENT}`
    );
}

export function getSafeRequestHeaders(
  headers: Request["headers"]
): SafeRequestHeaders {
  const safeHeaders: SafeRequestHeaders = {};

  for (const name of SAFE_REQUEST_HEADER_NAMES) {
    const value = headers[name];
    if (value !== undefined) {
      safeHeaders[name] = value;
    }
  }

  return safeHeaders;
}

export function getSafeRequestLogContext(req: Request) {
  return {
    method: req.method,
    url: sanitizeRequestUrl(req.originalUrl || req.url),
    headers: getSafeRequestHeaders(req.headers),
  };
}

function tokenValue(value: string | undefined | null): string {
  return value ?? "-";
}

export function formatMorganRequestLog({
  method,
  url,
  status,
  contentLength,
  responseTime,
}: {
  method: string | undefined | null;
  url: string | undefined | null;
  status: string | undefined | null;
  contentLength: string | undefined | null;
  responseTime: string | undefined | null;
}): string {
  return `${tokenValue(method)} ${sanitizeRequestUrl(url ?? undefined)} ${tokenValue(
    status
  )} ${tokenValue(contentLength)} - ${tokenValue(responseTime)} ms`;
}

export const safeMorganFormat: morgan.FormatFn<Request, Response> = (
  tokens,
  req,
  res
) =>
  formatMorganRequestLog({
    method: tokens.method?.(req, res),
    url: tokens.url?.(req, res),
    status: tokens.status?.(req, res),
    contentLength: tokens.res?.(req, res, "content-length"),
    responseTime: tokens["response-time"]?.(req, res),
  });
