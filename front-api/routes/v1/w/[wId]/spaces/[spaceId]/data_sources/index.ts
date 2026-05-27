import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { GetDataSourcesResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

import dsId from "./[dsId]";

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/data_sources:
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
 *         name: spaceId
 *         required: true
 *         description: ID of the space
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
 */
const app = publicApiApp();

app.get("/", async (ctx): HandlerResult<GetDataSourcesResponseType> => {
  const auth = ctx.get("auth");

  // The same handler serves both `/spaces/:spaceId/data_sources` and the
  // legacy `/data_sources` mount; in the legacy case `spaceId` is undefined
  // and we fall back to the workspace's global space (matching the Next
  // `withSpaceFromRoute` legacy behavior).
  const spaceIdParam = ctx.req.param("spaceId");
  const space = spaceIdParam
    ? await SpaceResource.fetchById(auth, spaceIdParam)
    : await SpaceResource.fetchWorkspaceGlobalSpace(auth);

  if (!space || space.isConversations() || !space.canReadOrAdministrate(auth)) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you requested was not found.",
      },
    });
  }

  const dataSources = await DataSourceResource.listBySpace(auth, space);

  return ctx.json({
    data_sources: dataSources.map((ds) => ds.toJSON()),
  });
});

app.route("/:dsId", dsId);

export default app;
