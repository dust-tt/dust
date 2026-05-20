import config from "@app/lib/api/config";
import { AppResource } from "@app/lib/resources/app_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { apiError } from "@front-api/middleware/utils";
import { withSpace } from "@front-api/middleware/with_space";
import { Hono } from "hono";

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/runs/:runId/cancel.
const app = new Hono();

app.post("/", withSpace({ requireCanWrite: true }), async (ctx) => {
  const auth = ctx.get("auth");
  const space = ctx.get("space");
  const aId = ctx.req.param("aId") ?? "";
  const runId = ctx.req.param("runId") ?? "";

  const found = await AppResource.fetchById(auth, aId);
  if (!found || found.space.sId !== space.sId) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "app_not_found", message: "The app was not found." },
    });
  }
  if (!found.canWrite(auth)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Canceling a run requires write access to the app's space.",
      },
    });
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const runStatus = await coreAPI.getRunStatus({
    projectId: found.dustAPIProjectId,
    runId,
  });
  if (runStatus.isErr()) {
    if (runStatus.error.code === "run_not_found") {
      return ctx.json({ success: true });
    }
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch run status.",
        app_error: runStatus.error,
      },
    });
  }
  if (runStatus.value.run.status.run !== "running") {
    return ctx.json({ success: true });
  }

  const cancelResult = await coreAPI.cancelRun({
    projectId: found.dustAPIProjectId,
    runId,
  });
  if (cancelResult.isErr()) {
    logger.error(
      {
        error: cancelResult.error,
        runId,
        projectId: found.dustAPIProjectId,
      },
      "Failed to cancel run"
    );
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to cancel the run.",
        app_error: cancelResult.error,
      },
    });
  }

  logger.info(
    { runId, projectId: found.dustAPIProjectId },
    "Run cancelled successfully"
  );
  return ctx.json({ success: true });
});

export default app;
