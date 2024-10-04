import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSourceViewFromVaultAndDataSourceId } from "@app/lib/api/data_source_view";
import { getGlobalVault } from "@app/lib/api/vaults";
import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

/**
 * @swagger
 * /api/v1/w/{wId}/data_sources/{dsId}/join-slack:
 *   post:
 *     summary: Join a Slack channel to a data source
 *     description: Add a new Slack channel to the list of channels associated with a data source.
 *     tags:
 *       - Data Sources
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
 *         name: dsId
 *         required: true
 *         description: Unique string identifier for the data source
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newChannelId
 *             properties:
 *               newChannelId:
 *                 type: string
 *                 description: The ID of the new Slack channel to add
 *     responses:
 *       200:
 *         description: Successfully added the new channel
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 dataSourceView:
 *                   $ref: '#/components/schemas/DataSourceView'
 *       400:
 *         description: Bad request (invalid input)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Workspace or data source not found
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  auth: Authenticator
) {
  const { dsId } = req.query;

  if (!dsId || typeof dsId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid newChannelId in request body.",
      },
    });
  }

  const { newChannelId } = req.body;

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST requests are allowed for this endpoint.",
      },
    });
  }

  if (!newChannelId || typeof newChannelId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid newChannelId in request body.",
      },
    });
  }

  try {
    const globalVault = await getGlobalVault(auth);
    if (!globalVault) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "vault_not_found",
          message: "Global vault not found for the workspace.",
        },
      });
    }

    const dataSourceViewRes = await getDataSourceViewFromVaultAndDataSourceId(
      auth,
      globalVault,
      dsId
    );
    if (dataSourceViewRes.isErr()) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "An error occurred while retrieving the dataSourceView.",
        },
      });
    }
    const dataSourceView = dataSourceViewRes.value;

    if (!dataSourceView) {
      // slack wasn't added to the global vault so no need to add the channel
    } else {
      if (dataSourceView.dataSource.connectorProvider !== "slack"){
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Invalid data source connector provider.",
          },
        });
      }
      await dataSourceView.updateParents([
        ...new Set([...(dataSourceView.parentsIn ?? []), newChannelId]),
      ]);
    }

    res.status(200).json({ success: true, dataSourceView });
  } catch (error) {
    console.error("Error in slack-join endpoint:", error);
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "An error occurred while processing the request.",
      },
    });
  }
}

export default withPublicAPIAuthentication(handler);
