import type { DataSourceViewsResponseType } from "@dust-tt/client";
import { PatchDataSourceViewRequestSchema } from "@dust-tt/client";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { handlePatchDataSourceView } from "@app/lib/api/data_source_view";
import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";

/**
 * @swagger
 * /api/v1/w/{wId}/vaults/{vId}/data_source_views/{dsvId}:
 *   get:
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
 *               type: object
 *               properties:
 *                 dataSourceView:
 *                   $ref: '#/components/schemas/DataSourceViewType'
 *       '404':
 *         description: Data source view not found
 *       '405':
 *         description: Method not allowed
 *   patch:
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
 *             $ref: '#/components/schemas/PatchDataSourceViewSchema'
 *     responses:
 *       '200':
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dataSourceView:
 *                   $ref: '#/components/schemas/DataSourceViewType'
 *       '400':
 *         description: Invalid request body
 *       '403':
 *         description: Unauthorized
 *       '404':
 *         description: Data source view not found
 *       '405':
 *         description: Method not allowed
 *       '500':
 *         description: Internal server error
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<DataSourceViewsResponseType>>,
  auth: Authenticator
): Promise<void> {
  const dataSourceView = await DataSourceViewResource.fetchById(
    auth,
    req.query.dsvId as string
  );

  if (
    !dataSourceView ||
    req.query.vId !== dataSourceView.vault.sId ||
    !dataSourceView.canList(auth)
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      return res.status(200).json({
        dataSourceView: dataSourceView.toJSON(),
      });

    case "PATCH": {
      const r = PatchDataSourceViewRequestSchema.safeParse(req.body);

      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${r.error.message}`,
          },
        });
      }

      const r2 = await handlePatchDataSourceView(r.data, auth, dataSourceView);
      if (r2.isErr()) {
        return apiError(req, res, r2.error);
      }

      return res.status(200).json({
        dataSourceView: r2.value.toJSON(),
      });
    }

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
