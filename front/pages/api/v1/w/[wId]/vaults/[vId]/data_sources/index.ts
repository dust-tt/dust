import type { DataSourceType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { apiError } from "@app/logger/withlogging";

export type GetDataSourcesResponseBody = {
  data_sources: Array<DataSourceType>;
};

/**
 * @swagger
 * /api/v1/w/{wId}/vaults/{vId}/data_sources:
 *   get:
 *     summary: Get data sources
 *     description: Get data sources in the workspace identified by {wId}.
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
 *         name: vId
 *         required: true
 *         description: ID of the vault
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: The data sources
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data_sources:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Datasource'
 *       404:
 *         description: The workspace was not found
 *       405:
 *         description: Method not supported
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetDataSourcesResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { vId } = req.query;

  // Handling the case where vId is undefined to keep support for the legacy endpoint (not under
  // vault, global vault assumed).
  const vault =
    typeof vId !== "string"
      ? await VaultResource.fetchWorkspaceGlobalVault(auth)
      : await VaultResource.fetchById(auth, vId);

  if (!vault) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "vault_not_found",
        message: "The vault you're trying to access was not found",
      },
    });
  }

  const dataSources = await DataSourceResource.listByVault(auth, vault);

  switch (req.method) {
    case "GET":
      res.status(200).json({
        data_sources: dataSources.map((ds) => ds.toJSON()),
      });
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
