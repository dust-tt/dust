import config from "@app/lib/api/config";
import { AppResource } from "@app/lib/resources/app_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { BlockType, RunType } from "@app/types/run";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
  runId: z.string(),
  type: z.string(),
  name: z.string(),
});

export type GetRunBlockResponseBody = {
  run: RunType | null;
};

// Mounted under
// /api/w/:wId/spaces/:spaceId/apps/:aId/runs/:runId/blocks/:type/:name.
const app = workspaceApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  withSpace({ requireCanWrite: true }),
  async (ctx): HandlerResult<GetRunBlockResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { aId, runId: runIdParam, type, name } = ctx.req.valid("param");
    let runId: string | null = runIdParam;

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
          message:
            "Retrieving content of runs requires write access to the app's space.",
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
    const run = await coreAPI.getRunBlock({
      projectId: found.dustAPIProjectId,
      runId,
      blockType: type as BlockType,
      blockName: name,
    });
    if (run.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "The run block retrieval failed.",
          app_error: run.error,
        },
      });
    }
    return ctx.json({ run: run.value.run });
  }
);

export default app;
