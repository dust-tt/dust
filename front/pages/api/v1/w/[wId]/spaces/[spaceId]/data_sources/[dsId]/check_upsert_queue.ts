import type { CheckUpsertQueueResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { checkRunningUpsertWorkflows } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/data_sources/{dsId}/check_upsert_queue:
 *   get:
 *     summary: Check the upsert queue status for a data source
 *     description: Returns the number of running document upsert workflows for this data source. This endpoint is only accessible with system API keys (e.g., from connectors).
 *     tags:
 *       - Datasources
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: spaceId
 *         required: true
 *         description: ID of the space
 *         schema:
 *           type: string
 *       - in: path
 *         name: dsId
 *         required: true
 *         description: ID of the data source
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Status of the upsert queue
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 running_count:
 *                   type: number
 *                   description: Number of currently running upsert workflows
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       403:
 *         description: Forbidden. Only system keys can access this endpoint.
 *       404:
 *         description: Data source not found.
 *       405:
 *         description: Method not supported.
 *       500:
 *         description: Internal Server Error.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<CheckUpsertQueueResponseType>>,
  auth: Authenticator
): Promise<void> {
  const { dsId } = req.query;
  if (typeof dsId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  // Only allow system keys (connectors) to access this endpoint
  if (!auth.isSystemKey()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message: "Only system keys can check the upsert queue.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchByNameOrId(auth, dsId, {
    origin: "v1_data_sources_check_upsert_queue",
  });

  if (!dataSource || !dataSource.canRead(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const owner = auth.getNonNullableWorkspace();

      try {
        const start = Date.now();
        const runningCount = await checkRunningUpsertWorkflows({
          workspaceId: owner.sId,
          dataSourceId: dataSource.sId,
        });

        logger.info(
          {
            workspaceId: owner.sId,
            dataSourceId: dataSource.sId,
            runningCount,
            duration: Date.now() - start,
          },
          "[CheckUpsertQueue] Checked upsert queue status"
        );

        return res.status(200).json({ running_count: runningCount });
      } catch (error) {
        logger.error(
          {
            workspaceId: owner.sId,
            dataSourceId: dataSource.sId,
            error,
          },
          "[CheckUpsertQueue] Failed to check upsert queue"
        );

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to check upsert queue.",
          },
        });
      }
    }

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
