/* eslint-disable dust/enforce-client-types-in-public-api */
import apiConfig from "@app/lib/api/config";
import { AppResource } from "@app/lib/resources/app_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { RunType } from "@app/types/run";
import type { RunAppResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { publicApiAuth } from "@front-api/middlewares/public_api_auth";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
  runId: z.string(),
});

// Mounted at /api/v1/w/:wId/apps/:aId/runs/:runId. This is a legacy endpoint:
// the space is not in the URL, so the global workspace space is assumed
// (mirroring `withResourceFetchingFromRoute` with `requireCanRead`).
const app = publicApiApp();

/**
 * @ignoreswagger
 * Legacy endpoint.
 */
app.get(
  "/",
  publicApiAuth,
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<RunAppResponseType> => {
    const auth = ctx.get("auth");
    const { aId, runId } = ctx.req.valid("param");

    const space = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    if (!space.canRead(auth)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "The space you requested was not found.",
        },
      });
    }

    const owner = auth.getNonNullableWorkspace();

    const appResource = await AppResource.fetchById(auth, aId);

    if (
      !appResource ||
      !appResource.canRead(auth) ||
      appResource.space.sId !== space.sId
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "app_not_found",
          message: "The app you're trying to access was not found",
        },
      });
    }

    logger.info(
      {
        workspace: {
          sId: owner.sId,
          name: owner.name,
        },
        app: appResource.sId,
        runId,
      },
      "App run retrieve"
    );

    const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
    const runRes = await coreAPI.getRun({
      projectId: appResource.dustAPIProjectId,
      runId,
    });
    if (runRes.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "run_error",
          message: "There was an error retrieving the run.",
          run_error: runRes.error,
        },
      });
    }
    const run: RunType = runRes.value.run;
    run.specification_hash = run.app_hash;
    delete run.app_hash;

    if (run.status.run === "succeeded" && run.traces.length > 0) {
      run.results = run.traces[run.traces.length - 1][1];
    } else {
      run.results = null;
    }

    return ctx.json({ run });
  }
);

export default app;
