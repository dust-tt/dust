import { getStatsDClient } from "@app/lib/utils/statsd";
import { Hono } from "hono";

export const healthzApp = new Hono();

healthzApp.get("/", (ctx) => {
  const startMs = performance.now();
  const response = ctx.text("ok", 200);
  const elapsedMs = performance.now() - startMs;

  getStatsDClient().distribution("requests.health.check", elapsedMs);

  return response;
});
