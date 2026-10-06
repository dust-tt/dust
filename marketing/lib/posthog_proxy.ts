import type { IncomingHttpHeaders } from "node:http";

const POSTHOG_INGESTION_URL = "https://eu.i.posthog.com";
const POSTHOG_ASSETS_URL = "https://eu-assets.i.posthog.com";

const PROXY_PATH_PREFIX = /^(\/api)?\/subtle1/;

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "cache-control",
  "content-encoding",
  "content-length",
  "content-type",
  "if-modified-since",
  "if-none-match",
  "origin",
  "referer",
  "user-agent",
  "x-forwarded-for",
  "x-forwarded-proto",
];

const FORWARDED_RESPONSE_HEADERS = [
  "cache-control",
  "content-type",
  "expires",
  "last-modified",
  "vary",
];

export function resolvePostHogUpstreamUrl(requestUrl: URL): string {
  const upstreamPath = requestUrl.pathname.replace(PROXY_PATH_PREFIX, "");
  const upstreamBaseUrl = upstreamPath.startsWith("/static/")
    ? POSTHOG_ASSETS_URL
    : POSTHOG_INGESTION_URL;

  return `${upstreamBaseUrl}${upstreamPath}${requestUrl.search}`;
}

/**
 * @cc [owner:rfrenoy,label:security] posthog-proxy-no-credentials
 * The headers relayed to PostHog MUST be limited to `FORWARDED_REQUEST_HEADERS`. `cookie` (which
 * carries the HttpOnly `workos_session` credential, since marketing pages are served from
 * `dust.tt`) and `authorization` MUST never be forwarded, whatever the client sent.
 */
export function buildPostHogUpstreamHeaders(
  requestHeaders: IncomingHttpHeaders
): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = requestHeaders[name];
    if (typeof value === "string") {
      headers.set(name, value);
    } else if (Array.isArray(value)) {
      headers.set(name, value.join(", "));
    }
  }
  return headers;
}

/**
 * @cc [owner:rfrenoy,label:security] posthog-proxy-no-set-cookie
 * The headers relayed back to the browser MUST be limited to `FORWARDED_RESPONSE_HEADERS`.
 * `set-cookie` MUST never be relayed, so that PostHog cannot set cookies on the `dust.tt` origin.
 */
export function buildPostHogDownstreamHeaders(
  upstreamHeaders: Headers
): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstreamHeaders.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  return headers;
}
