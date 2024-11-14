import type { DataSourceViewsListResponseType } from "@dust-tt/client";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/data_source_views:
 *   get:
 *     summary: List Data Source Views
 *     description: Retrieves a list of data source views for the specified space
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
 *         name: spaceId
 *         required: true
 *         description: ID of the space
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of data source views in the space
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
  res: NextApiResponse<WithAPIErrorResponse<DataSourceViewsListResponseType>>,
  auth: Authenticator
): Promise<void> {
  const { spaceId } = req.query;

  // Handling the case where `spaceId` is undefined to keep support for the legacy endpoint (not under
  // space, global space assumed).
  const space =
    typeof spaceId !== "string"
      ? await SpaceResource.fetchWorkspaceGlobalSpace(auth)
      : await SpaceResource.fetchById(auth, spaceId);

  if (!space) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you're trying to access was not found",
      },
    });
  }

  if (space.kind === "conversations") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you're trying to access was not found",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const dataSourceViews = await DataSourceViewResource.listBySpace(
        auth,
        space
      );

      res.status(200).json({
        dataSourceViews: dataSourceViews.map((dsv) => dsv.toJSON()),
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
