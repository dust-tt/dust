import type { DataSourceViewType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { apiError } from "@app/logger/withlogging";

export type GetDataSourceViewsResponseBody = {
  dataSourceViews: DataSourceViewType[];
};

/**
 * @swagger
 * /api/v1/w/{wId}/vaults/{vId}/data_source_views:
 *   get:
 *     summary: List Data Source Views
 *     description: Retrieves a list of data source views for the specified vault
 *     tags:
 *       - DatasourceViews
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
 *     responses:
 *       200:
 *         description: List of data source views in the vault
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dataSourceViews:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DatasourceView'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Workspace not found.
 *       405:
 *         description: Method not supported.
 *       500:
 *         description: Internal Server Error.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetDataSourceViewsResponseBody>>,
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

  switch (req.method) {
    case "GET":
      const dataSourceViews = (
        await DataSourceViewResource.listByVault(auth, vault)
      ).map((dsv) => dsv.toJSON());
      res.status(200).json({
        dataSourceViews,
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
