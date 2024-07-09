import type { RunType, WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getApp } from "@app/lib/api/app";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

export const config = {
  api: {
    responseLimit: "8mb",
  },
};

export type GetRunResponseBody = {
  run: RunType;
};

/**
 * @swagger
 * /api/v1/w/{wId}/apps/{aId}/runs/{runId}:
 *   get:
 *     summary: Get an app run
 *     description: Retrieve a run for an app in the workspace identified by {wId}.
 *     tags:
 *       - Apps
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
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
 *       - in: header
 *         name: Authorization
 *         required: true
 *         description: Bearer token for authentication
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
 *                   type: object
 *                   properties:
 *                     run_id:
 *                       type: string
 *                       description: The ID of the run
 *                       example: 1234
 *                     app_id:
 *                       type: string
 *                       description: The ID of the app
 *                       example: 1234
 *                     status:
 *                       type: object
 *                       properties:
 *                         run:
 *                           type: string
 *                           description: The status of the run
 *                           example: succeeded
 *                         build:
 *                           type: string
 *                           description: The status of the build
 *                           example: succeeded
 *                     results:
 *                       type: object
 *                       description: The results of the run
 *                       example: {}
 *                     specification_hash:
 *                       type: string
 *                       description: The hash of the app specification
 *                       example: 1234
 *                     traces:
 *                       type: array
 *                       items:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             timestamp:
 *                               type: number
 *                               description: The timestamp of the trace
 *                               example: 1234567890
 *                             trace:
 *                               type: object
 *                               description: The trace
 *                               example: {}
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetRunResponseBody>>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }
  const { auth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app you're trying to run was not found",
      },
    });
  }

  const app = await getApp(auth, req.query.aId as string);

  if (!app) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app you're trying to run was not found",
      },
    });
  }
  const coreAPI = new CoreAPI(logger);

  switch (req.method) {
    case "GET":
      const runId = req.query.runId as string;

      logger.info(
        {
          workspace: {
            sId: owner.sId,
            name: owner.name,
          },
          app: app.sId,
          runId,
        },
        "App run retrieve"
      );

      // TODO(spolu): This is borderline security-wise as it allows to recover a full run from the
      // runId assuming the app is public. We should use getRun and also enforce in getRun that we
      // retrieve only our own runs. Basically this assumes the `runId` as a secret.
      const runRes = await coreAPI.getRun({
        projectId: app.dustAPIProjectId,
        runId,
      });
      if (runRes.isErr()) {
        return apiError(req, res, {
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

      res.status(200).json({ run });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withLogging(handler);
