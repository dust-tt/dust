import { getStatsDClient } from "@app/lib/utils/statsd";
import { createHono } from "@front-api/lib/hono";

import ready from "./healthz/ready";
import startup from "./healthz/startup";

// Mounted at /api/healthz.
export const healthzApp = createHono();

healthzApp.get("/", (ctx) => {
  const startMs = performance.now();
  const response = ctx.text("ok", 200);
  const elapsedMs = performance.now() - startMs;

  getStatsDClient().distribution("requests.health.check", elapsedMs);

  return response;
});

healthzApp.route("/ready", ready);
healthzApp.route("/startup", startup);

export default healthzApp;
