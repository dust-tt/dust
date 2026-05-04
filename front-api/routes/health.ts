import { Hono } from "hono";

import { getStatsDClient } from "@app/lib/utils/statsd";

export const healthApp = new Hono();

healthApp.get("/api/healthz", (c) => {
  const start = performance.now();
  const response = c.text("ok", 200);
  const elapsed = performance.now() - start;

  getStatsDClient().distribution("requests.health.check", elapsed);

  return response;
});
