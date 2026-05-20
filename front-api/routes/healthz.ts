import { getStatsDClient } from "@app/lib/utils/statsd";
import { Hono } from "hono";

export const healthzApp = new Hono();

healthzApp.get("/", (c) => {
  const startMs = performance.now();
  const response = c.text("ok", 200);
  const elapsedMs = performance.now() - startMs;

  getStatsDClient().distribution("requests.health.check", elapsedMs);

  return response;
});
