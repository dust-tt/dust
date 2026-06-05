import type { PostRunCancelResponseBody } from "@app/lib/api/apps";
import config from "@app/lib/api/config";
import { AppResource } from "@app/lib/resources/app_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
  runId: z.string(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/runs/:runId/cancel.
const app = workspaceApp();

app.post(
  "/",
  validate("param", ParamsSchema),
  withSpace({ requireCanWrite: true }),
  async (ctx): HandlerResult<PostRunCancelResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { aId, runId } = ctx.req.valid("param");

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
  }
);

export default app;
