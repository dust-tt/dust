import { handlePatchDataSourceView } from "@app/lib/api/data_source_view";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { DataSourceViewResponseType } from "@dust-tt/client";
import { PatchDataSourceViewRequestSchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withDataSourceView } from "@front-api/middlewares/with_data_source_view";
import { withSpace } from "@front-api/middlewares/with_space";

import search from "./search";

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
const app = publicApiApp();

app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  withDataSourceView({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<DataSourceViewResponseType> => {
    const auth = ctx.get("auth");
    const dataSourceView = ctx.get("dataSourceView");

    if (!dataSourceView.canReadOrAdministrate(auth)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      });
    }

    return ctx.json({
      dataSourceView: dataSourceView.toJSON(),
    });
  }
);

app.patch(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  withDataSourceView({ requireCanReadOrAdministrate: true }),
  validate("json", PatchDataSourceViewRequestSchema),
  async (ctx): HandlerResult<DataSourceViewResponseType> => {
    const auth = ctx.get("auth");
    const dataSourceView = ctx.get("dataSourceView");

    if (!dataSourceView.canReadOrAdministrate(auth)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      });
    }

    const r = await handlePatchDataSourceView(
      auth,
      ctx.req.valid("json"),
      dataSourceView
    );
    if (r.isErr()) {
      switch (r.error.code) {
        case "unauthorized":
          return apiError(ctx, {
            status_code: 401,
            api_error: {
              type: "workspace_auth_error",
              message: r.error.message,
            },
          });
        case "internal_error":
          return apiError(ctx, {
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

    return ctx.json({
      dataSourceView: r.value.toJSON(),
    });
  }
);

app.route("/search", search);

export default app;
