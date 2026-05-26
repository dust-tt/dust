import apiConfig from "@app/lib/api/config";
import { AppResource } from "@app/lib/resources/app_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { RunType } from "@app/types/run";
import type { RunAppResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
  runId: z.string(),
});

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/apps/{aId}/runs/{runId}:
 *   get:
 *     summary: Get an app run
 *     description: Retrieve a run for an app in the space identified by {spaceId}.
 *     tags:
 *       - Apps
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: spaceId
 *         required: true
 *         description: ID of the space
 *         schema:
 *           type: string
 *       - in: path
 *         name: aId
 *         required: true
 *         description: ID of the app
 *         schema:
 *           type: string
 *       - in: path
 *         name: runId
 *         required: true
 *         description: ID of the run
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The run
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 run:
 *                   $ref: '#/components/schemas/Run'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 */
// Mounted at /api/v1/w/:wId/spaces/:spaceId/apps/:aId/runs/:runId.
const app = publicApiApp();

app.get(
  "/",
  withSpace({ requireCanRead: true }),
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<RunAppResponseType> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { aId, runId } = ctx.req.valid("param");

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
