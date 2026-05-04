import { Hono } from "hono";

import { getStatsDClient } from "@app/lib/utils/statsd";

export const healthApp = new Hono();

healthApp.get("/api/healthz", (c) => {
  const startMs = performance.now();
  const response = c.text("ok", 200);
  const elapsedMs = performance.now() - startMs;

  getStatsDClient().distribution("requests.health.check", elapsedMs);

  return response;
});
