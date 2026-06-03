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

const proxyToPostHog = (upstreamBaseUrl: string) => (c: Context) => {
  const url = new URL(c.req.url);
  const upstreamPath = url.pathname.replace(/^\/subtle1/, "");

  // Drop the client's Host header so fetch derives it from the upstream URL;
  // forwarding our own host would break PostHog's routing. Hop-by-hop headers
  // (connection, keep-alive, ...) are stripped by the proxy helper itself.
  const headers = new Headers(c.req.raw.headers);
  headers.delete("host");

  return proxy(
    `${upstreamBaseUrl}${upstreamPath}${url.search}`,
    new Request(c.req.raw, { headers })
  );
};

app.all("/static/*", proxyToPostHog(POSTHOG_ASSETS_URL));
app.all("/*", proxyToPostHog(POSTHOG_INGESTION_URL));

export default app;
