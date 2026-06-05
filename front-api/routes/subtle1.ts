import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { createHono } from "@front-api/lib/hono";
import type { Context } from "hono";
import { proxy } from "hono/proxy";

// PostHog ingestion reverse proxy, mirroring the `/subtle1` rewrites in
// front/next.config.js. The obfuscated path name keeps analytics requests
// from being flagged by ad blockers (see PostHogTracker.tsx which points
// the PostHog client's api_host at `<api base url>/subtle1`).
const POSTHOG_INGESTION_URL = "https://eu.i.posthog.com";
const POSTHOG_ASSETS_URL = "https://eu-assets.i.posthog.com";

// Mounted at /subtle1 (root level, not under /api).
const app = createHono();

const proxyToPostHog = (upstreamBaseUrl: string) => async (c: Context) => {
  const url = new URL(c.req.url);
  const upstreamPath = url.pathname.replace(/^\/subtle1/, "");
  const upstreamUrl = `${upstreamBaseUrl}${upstreamPath}${url.search}`;

  // Drop the client's Host header so fetch derives it from the upstream URL;
  // forwarding our own host would break PostHog's routing. Hop-by-hop headers
  // (connection, keep-alive, ...) are stripped by the proxy helper itself.
  const headers = new Headers(c.req.raw.headers);
  headers.delete("host");

  try {
    return await proxy(upstreamUrl, new Request(c.req.raw, { headers }));
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
