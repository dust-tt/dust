import type { DataSourceViewType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { PatchDataSourceViewResponseBody } from "@app/pages/api/w/[wId]/vaults/[vId]/data_source_views/[dsvId]";
import { handlePatchDataSourceView } from "@app/pages/api/w/[wId]/vaults/[vId]/data_source_views/[dsvId]";

export type GetOrPostDataSourceViewsResponseBody = {
  dataSourceView: DataSourceViewType;
};

/**
 * @swagger
 * /api/v1/w/{wId}/vaults/{vId}/data_source_views/{dsvId}:
 *   get:
 *     tags:
 *       - DatasourceViews
 *     security:
 *       - BearerAuth: []
 *     summary: Get a data source view
 *     parameters:
 *       - name: wId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: vId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: dsvId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DatasourceView'
 *       '404':
 *         description: Data source view not found
 *       '405':
 *         description: Method not allowed
 *   patch:
 *     tags:
 *       - DatasourceViews
 *     security:
 *       - BearerAuth: []
 *     summary: Update a data source view
 *     parameters:
 *       - name: wId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: vId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: dsvId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             oneOf:
 *               - type: object
 *                 properties:
 *                   parentsIn:
 *                     type: array
 *                     items:
 *                       type: string
 *                 required:
 *                   - parentsIn
 *               - type: object
 *                 properties:
 *                   parentsToAdd:
 *                     type: array
 *                     items:
 *                       type: string
 *                   parentsToRemove:
 *                     type: array
 *                     items:
 *                       type: string
 *     responses:
 *       '200':
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DatasourceView'
 *       '400':
 *         description: Invalid request body
 *       '403':
 *         description: Unauthorized - Only admins or builders can administrate vaults
 *       '404':
 *         description: Data source view not found
 *       '405':
 *         description: Method not allowed
 *       '500':
 *         description: Internal server error - The data source view cannot be updated
 *   delete:
 *     tags:
 *       - DatasourceViews
 *     security:
 *       - BearerAuth: []
 *     summary: Delete a data source view
 *     parameters:
 *       - name: wId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: vId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: dsvId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '204':
 *         description: Data source view successfully deleted
 *       '401':
 *         description: Unauthorized - The data source view is in use and cannot be deleted
 *       '403':
 *         description: Forbidden - Only admins or builders can delete data source views
 *       '404':
 *         description: Data source view not found
 *       '405':
 *         description: Method not allowed
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetOrPostDataSourceViewsResponseBody | PatchDataSourceViewResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const dataSourceView = await DataSourceViewResource.fetchById(
    auth,
    req.query.dsvId as string
  );

  switch (req.method) {
    case "GET":
      return res.status(200).json({
        dataSourceView: dataSourceView.toJSON(),
      });

    case "PATCH":
      return handlePatchDataSourceView(req, res, auth, dataSourceView);

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "the method passed is not supported, GET or PATCH is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);
