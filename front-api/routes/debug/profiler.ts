import config from "@app/lib/api/config";
import type { GetProfilerResponse } from "@app/lib/api/debug/profiler";
import { profileCPU, profileHeap } from "@app/lib/api/debug/profiler";
import logger from "@app/logger/logger";
import { isString } from "@app/types/shared/utils/general";
import { createHono } from "@front-api/lib/hono";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/debug/profiler.
const app = createHono();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetProfilerResponse> => {
  const secret = ctx.req.query("secret");
  const debugSecret = config.getProfilerSecret();

  if (!debugSecret || !isString(secret) || secret !== debugSecret) {
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
