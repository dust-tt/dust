import type { DataSourcesUsageByAgent } from "@app/lib/api/agent_data_sources";
import {
  getDataSourcesUsageByCategory,
  getDataSourceViewsUsageByModelIds,
} from "@app/lib/api/agent_data_sources";
import { augmentDataSourceWithConnectorDetails } from "@app/lib/api/data_sources";
import { isManaged, isWebsite } from "@app/lib/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import type {
  GetSpaceDataSourceViewsResponseBody,
  PostSpaceDataSourceViewsResponseBody,
} from "@app/types/api/data_source_view";
import { ContentSchema } from "@app/types/api/internal/spaces";
import type { DataSourceViewCategory } from "@app/types/api/public/spaces";
import type { DataSourceViewsWithDetails } from "@app/types/data_source_view";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";

import dsvId from "./[dsvId]";

// Mounted under /api/w/:wId/spaces/:spaceId/data_source_views.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/spaces/{spaceId}/data_source_views:
 *   get:
 *     summary: List data source views
 *     description: Returns all data source views in a specific space.
 *     tags:
 *       - Private Spaces
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
 *       - in: query
 *         name: category
 *         required: false
 *         description: Filter by data source view category
 *         schema:
 *           type: string
 *           enum: [managed, folder, website, apps]
 *       - in: query
 *         name: withDetails
 *         required: false
 *         description: Include usage and connector details (requires category)
 *         schema:
 *           type: string
 *           enum: ["true"]
 *       - in: query
 *         name: includeEditedBy
 *         required: false
 *         description: Include editedByUser information
 *         schema:
 *           type: string
 *           enum: ["true"]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dataSourceViews:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PrivateDataSourceView'
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Create a data source view
 *     description: Creates a new data source view in a specific space.
 *     tags:
 *       - Private Spaces
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dataSourceId
 *             properties:
 *               dataSourceId:
 *                 type: string
 *               parentsIn:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Successfully created data source view
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dataSourceView:
 *                   $ref: '#/components/schemas/PrivateDataSourceView'
 *       401:
 *         description: Unauthorized
 */

app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<GetSpaceDataSourceViewsResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const category = ctx.req.query("category") as
      | DataSourceViewCategory
      | undefined;
    const withDetails = ctx.req.query("withDetails");
    const includeEditedBy = ctx.req.query("includeEditedBy");

    const dataSourceViews = (
      await DataSourceViewResource.listBySpace(auth, space, {
        includeEditedBy: !!includeEditedBy,
      })
    )
      .map((ds) => ds.toJSON())
      .filter((d) => !category || d.category === category);

    if (!withDetails) {
      return ctx.json({ dataSourceViews });
    }

    if (!category) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Cannot get details without specifying a category.",
        },
      });
    }

    let usages: DataSourcesUsageByAgent = {};
    if (space.isSystem()) {
      // In system spaces, reflect usage by data sources themselves (across all
      // spaces), then remap onto this space's views.
      const usagesByDataSources = await getDataSourcesUsageByCategory({
        auth,
        category,
      });
      dataSourceViews.forEach((dsView) => {
        usages[dsView.id] = usagesByDataSources[dsView.dataSource.id];
      });
    } else {
      usages = await getDataSourceViewsUsageByModelIds({
        auth,
        dataSourceViewModelIds: dataSourceViews.map((dsv) => dsv.id),
      });
    }

    const enhancedDataSourceViews: DataSourceViewsWithDetails[] =
      await Promise.all(
        dataSourceViews.map(async (dataSourceView) => {
          const dataSource = dataSourceView.dataSource;

          if (!isManaged(dataSource) && !isWebsite(dataSource)) {
            return {
              ...dataSourceView,
              dataSource: {
                ...dataSource,
                connectorDetails: { connector: null, connectorId: null },
                connector: null,
                fetchConnectorError: false,
                fetchConnectorErrorMessage: null,
              },
              usage: usages[dataSourceView.id] ?? { count: 0, agents: [] },
            };
          }

          const augmentedDataSource =
            await augmentDataSourceWithConnectorDetails(dataSource);
          return {
            ...dataSourceView,
            dataSource: augmentedDataSource,
            usage: usages[dataSourceView.id] ?? { count: 0, agents: [] },
          };
        })
      );
    return ctx.json({ dataSourceViews: enhancedDataSourceViews });
  }
);

app.post(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("json", ContentSchema),
  async (ctx): HandlerResult<PostSpaceDataSourceViewsResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    if (!space.canAdministrate(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Only users that are `admins` can administrate spaces.",
        },
      });
    }

    const isSaveDataSourceViewsEnabled =
      await KillSwitchResource.isKillSwitchEnabled("save_data_source_views");
    if (isSaveDataSourceViewsEnabled) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "app_auth_error",
          message:
            "Saving data source views is temporarily disabled, try again later.",
        },
      });
    }

    const { dataSourceId, parentsIn } = ctx.req.valid("json");

    const dataSource = await DataSourceResource.fetchById(auth, dataSourceId);
    if (!dataSource) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid data source: ${dataSourceId}`,
        },
      });
    }

    const existing = await DataSourceViewResource.listForDataSourcesInSpace(
      auth,
      [dataSource],
      space
    );
    if (existing.length > 0) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `View already exists for data source: ${dataSourceId}`,
        },
      });
    }

    const dataSourceViewRes =
      await DataSourceViewResource.createViewInSpaceFromDataSource(
        auth,
        space,
        dataSource,
        parentsIn
      );
    if (dataSourceViewRes.isErr()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message: dataSourceViewRes.error.message,
        },
      });
    }

    return ctx.json({ dataSourceView: dataSourceViewRes.value.toJSON() }, 201);
  }
);

app.route("/:dsvId", dsvId);

export default app;
