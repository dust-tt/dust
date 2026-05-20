import config from "@app/lib/api/config";
import { profileCPU, profileHeap } from "@app/lib/api/debug/profiler";
import logger from "@app/logger/logger";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted at /api/debug/profiler.
const app = new Hono();

app.get("/", async (ctx) => {
  const secret = ctx.req.query("secret");
  const debugSecret = config.getProfilerSecret();

  if (!debugSecret || typeof secret !== "string" || secret !== debugSecret) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid debug secret.",
      },
    });
  }

  const cpuProfile = await profileCPU();
  const heapProfile = await profileHeap();

  logger.info({ cpuProfile, heapProfile }, "Profiler completed");
  return ctx.json({
    cpu: cpuProfile,
    heap: heapProfile,
  });
});

export default app;
