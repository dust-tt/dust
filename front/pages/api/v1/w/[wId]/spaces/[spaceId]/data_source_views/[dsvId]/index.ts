import type { DataSourceViewsResponseType } from "@dust-tt/client";
import { PatchDataSourceViewRequestSchema } from "@dust-tt/client";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { handlePatchDataSourceView } from "@app/lib/api/data_source_view";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/data_source_views/{dsvId}:
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
 *       - name: spaceId
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
 *       - name: spaceId
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
 *         description: Unauthorized - Only admins or builders can administrate spaces
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
 *       - name: spaceId
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
  res: NextApiResponse<WithAPIErrorResponse<DataSourceViewsResponseType>>,
  auth: Authenticator,
  space: SpaceResource
): Promise<void> {
  const { dsvId } = req.query;
  if (typeof dsvId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const dataSourceView = await DataSourceViewResource.fetchById(auth, dsvId);
  if (!dataSourceView || dataSourceView.space.sId !== space.sId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_view_not_found",
        message: "The data source view you requested was not found.",
      },
    });
  }

  if (
    !dataSourceView ||
    req.query.vId !== dataSourceView.space.sId ||
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
      const parsing = PatchDataSourceViewRequestSchema.safeParse(req.body);

      if (parsing.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${parsing.error.message}`,
          },
        });
      }

      const r = await handlePatchDataSourceView(
        auth,
        parsing.data,
        dataSourceView
      );
      if (r.isErr()) {
        switch (r.error.code) {
          case "unauthorized":
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "workspace_auth_error",
                message: r.error.message,
              },
            });
          case "internal_error":
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: r.error.message,
              },
            });
          default:
            assertNever(r.error.code);
        }
      }

      return res.status(200).json({
        dataSourceView: r.value.toJSON(),
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

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, "space")
);
