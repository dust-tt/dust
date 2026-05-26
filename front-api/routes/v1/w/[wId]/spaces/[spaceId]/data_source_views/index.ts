import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { DataSourceViewsListResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { withSpace } from "@front-api/middlewares/with_space";

import dsvId from "./[dsvId]";

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
// Mounted at /api/v1/w/:wId/spaces/:spaceId/data_source_views.
const app = publicApiApp();

app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<DataSourceViewsListResponseType> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    const dataSourceViews = await DataSourceViewResource.listBySpace(
      auth,
      space
    );

    return ctx.json({
      dataSourceViews: dataSourceViews.map((dsv) => dsv.toJSON()),
    });
  }
);

app.route("/:dsvId", dsvId);

export default app;
