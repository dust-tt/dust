import { pullTemplatesFromMainRegion } from "@app/lib/api/poke/templates";
import { config } from "@app/lib/api/regions/config";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type PullTemplatesResponseBody = {
  success: true;
  count: number;
};

// Mounted at /api/poke/templates/pull. pokeAuth is applied by the parent poke
// sub-app.
const app = new Hono();

app.post("/", async (ctx): HandlerResult<PullTemplatesResponseBody> => {
  if (!config.getDustRegionSyncEnabled()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "This endpoint can only be called from non-main regions.",
      },
    });
  }

  const result = await pullTemplatesFromMainRegion();
  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch templates from main region.",
      },
    });
  }

  return ctx.json({
    success: true,
    count: result.value.count,
  });
});

export default app;
