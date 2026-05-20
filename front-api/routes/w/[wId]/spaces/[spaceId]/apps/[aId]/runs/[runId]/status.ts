import config from "@app/lib/api/config";
import { AppResource } from "@app/lib/resources/app_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { apiError } from "@front-api/middleware/utils";
import { withSpace } from "@front-api/middleware/with_space";
import { Hono } from "hono";

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/runs/:runId/status.
const app = new Hono();

app.get("/", withSpace({ requireCanRead: true }), async (ctx) => {
  const auth = ctx.get("auth");
  const space = ctx.get("space");
  const aId = ctx.req.param("aId") ?? "";
  let runId: string | null = ctx.req.param("runId") ?? null;

  const found = await AppResource.fetchById(auth, aId);
  if (!found || found.space.sId !== space.sId) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "app_not_found", message: "The app was not found." },
    });
  }
  if (!found.canRead(auth)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Reading the app requires read access to the app's space.",
      },
    });
  }
  if (runId === "saved") {
    runId = found.savedRun;
  }
  if (!runId || runId.length === 0) {
    return ctx.json({ run: null });
  }
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const run = await coreAPI.getRunStatus({
    projectId: found.dustAPIProjectId,
    runId,
  });
  if (run.isErr()) {
    if (run.error.code === "run_not_found") {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "run_not_found", message: "The run was not found." },
      });
    }
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "The run status retrieval failed.",
        app_error: run.error,
      },
    });
  }
  return ctx.json({ run: run.value.run });
});

export default app;
