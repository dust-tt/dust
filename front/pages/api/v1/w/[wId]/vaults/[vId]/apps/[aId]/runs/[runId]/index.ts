/* eslint jsdoc/no-missing-syntax: 0 */ //
// Disabling jsdoc rule, as we're not yet documentating dust apps endpoints under vaults.
// We still document the legacy endpoint, which does the same thing.
// Note: for now, an API key only has access to the global vault.
import type { RunType, WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import apiConfig from "@app/lib/api/config";
import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

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
 * /api/v1/w/{wId}/vaults/{vId}/apps/{aId}/runs/{runId}:
 *   get:
 *     summary: Get an app run
 *     description: Retrieve a run for an app in the vault identified by {vId}.
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
 *         name: vId
 *         required: true
 *         description: ID of the vault
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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetRunResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  // Handling the case where vId is undefined to keep support for the legacy endpoint (not under
  // vault, global vault assumed for the auth (the authenticator associated with the app, not the
  // user)).
  let { vId } = req.query;
  if (vId === undefined) {
    vId = (await VaultResource.fetchWorkspaceGlobalVault(auth)).sId;
  }

  const app = await AppResource.fetchById(auth, req.query.aId as string);

  if (!app || !app.canRead(auth) || app.vault.sId !== vId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app you're trying to access was not found",
      },
    });
  }

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

      const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
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

export default withPublicAPIAuthentication(handler);
