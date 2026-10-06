import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { createHono } from "@front-api/lib/hono";
import { skipRequestLog } from "@front-api/middlewares/request_instrumentation";
import type { Context } from "hono";
import { proxy } from "hono/proxy";

// PostHog ingestion reverse proxy. The obfuscated path name keeps analytics
// requests from being flagged by ad blockers (see PostHogTracker.tsx which
// points the PostHog client's api_host at `<api base url>/subtle1`).
const POSTHOG_INGESTION_URL = "https://eu.i.posthog.com";
const POSTHOG_ASSETS_URL = "https://eu-assets.i.posthog.com";

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

// Mounted at /subtle1 (root level, not under /api).
const app = createHono();

// High-volume PostHog analytics proxy; too noisy to log every request.
app.use("*", skipRequestLog);

/**
 * @cc [owner:rfrenoy,label:security] posthog-proxy-no-credentials
 * The headers relayed to PostHog MUST be limited to `FORWARDED_REQUEST_HEADERS`. `cookie` (which
 * carries the HttpOnly `workos_session` credential on same-origin requests) and `authorization`
 * MUST never be forwarded, whatever the client sent.
 */
function buildUpstreamHeaders(requestHeaders: Headers): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = requestHeaders.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  return headers;
}

const proxyToPostHog = (upstreamBaseUrl: string) => async (c: Context) => {
  const url = new URL(c.req.url);
  const upstreamPath = url.pathname.replace(/^\/subtle1/, "");
  const upstreamUrl = `${upstreamBaseUrl}${upstreamPath}${url.search}`;
  const headers = buildUpstreamHeaders(c.req.raw.headers);

  try {
    const response = await proxy(
      upstreamUrl,
      new Request(c.req.raw, { headers })
    );
    response.headers.delete("set-cookie");
    return response;
  } catch (err) {
    // `proxy` rejects with `TypeError: fetch failed` only on a transport-level
    // failure reaching PostHog (DNS, connect refused, TLS, socket reset,
    // timeout) — never on a 4xx/5xx response, which is relayed as a Response.
    // This is a transient upstream condition, not a bug in our service, so we
    // surface it as a 502 instead of letting it bubble up as an unhandled 500.
    const error = normalizeError(err);
    logger.warn(
      {
        upstreamUrl,
        method: c.req.method,
        error: { name: error.name, message: error.message },
        cause: error.cause,
      },
      "PostHog proxy upstream fetch failed"
    );

    return c.json(
      {
        error: {
          type: "service_unavailable",
          message: `PostHog proxy upstream fetch failed: ${error.message}`,
        },
      },
      502
    );
  }
};

app.all("/static/*", proxyToPostHog(POSTHOG_ASSETS_URL));
app.all("/*", proxyToPostHog(POSTHOG_INGESTION_URL));

export default app;
