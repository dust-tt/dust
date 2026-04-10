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
import type { DataSourcesUsageByAgent } from "@app/lib/api/agent_data_sources";
import {
  getDataSourcesUsageByCategory,
  getDataSourceViewsUsageByCategory,
} from "@app/lib/api/agent_data_sources";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { augmentDataSourceWithConnectorDetails } from "@app/lib/api/data_sources";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { isManaged, isWebsite } from "@app/lib/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import { ContentSchema } from "@app/types/api/internal/spaces";
import type { DataSourceViewCategory } from "@app/types/api/public/spaces";
import type {
  DataSourceViewsWithDetails,
  DataSourceViewType,
} from "@app/types/data_source_view";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetSpaceDataSourceViewsResponseBody<
  IncludeDetails extends boolean = boolean,
> = {
  dataSourceViews: IncludeDetails extends true
    ? DataSourceViewsWithDetails[]
    : DataSourceViewType[];
};

type PostSpaceDataSourceViewsResponseBody = {
  dataSourceView: DataSourceViewType;
};

const PostDataSourceViewSchema = ContentSchema;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetSpaceDataSourceViewsResponseBody | PostSpaceDataSourceViewsResponseBody
    >
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const category =
        req.query.category && typeof req.query.category === "string"
          ? (req.query.category as DataSourceViewCategory)
          : null;

      const dataSourceViews = (
        await DataSourceViewResource.listBySpace(auth, space, {
          includeEditedBy: !!req.query.includeEditedBy,
        })
      )
        .map((ds) => ds.toJSON())
        .filter((d) => !category || d.category === category);

      if (!req.query.withDetails) {
        return res.status(200).json({
          dataSourceViews,
        });
      } else {
        if (!category) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Cannot get details without specifying a category.",
            },
          });
        }

        let usages: DataSourcesUsageByAgent = {};

        if (space.isSystem()) {
          // In case of system space, we want to reflect the usage by datasources themselves so we
          // get usage across all spaces.
          const usagesByDataSources = await getDataSourcesUsageByCategory({
            auth,
            category,
          });

          // Then we remap to the dataSourceViews of the system spaces.
          dataSourceViews.forEach((dsView) => {
            usages[dsView.id] = usagesByDataSources[dsView.dataSource.id];
          });
        } else {
          // Directly take the usage by dataSourceViews
          usages = await getDataSourceViewsUsageByCategory({
            auth,
            category,
          });
        }

        const enhancedDataSourceViews: GetSpaceDataSourceViewsResponseBody<true>["dataSourceViews"] =
          await Promise.all(
            dataSourceViews.map(async (dataSourceView) => {
              const dataSource = dataSourceView.dataSource;

              if (!isManaged(dataSource) && !isWebsite(dataSource)) {
                return {
                  ...dataSourceView,
                  dataSource: {
                    ...dataSource,
                    // As it's not managed, we don't have any connector details
                    connectorDetails: { connector: null, connectorId: null },
                    connector: null,
                    fetchConnectorError: false,
                    fetchConnectorErrorMessage: null,
                  },
                  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                  usage: usages[dataSourceView.id] || {
                    count: 0,
                    agents: [],
                  },
                };
              }

              const augmentedDataSource =
                await augmentDataSourceWithConnectorDetails(dataSource);
              return {
                ...dataSourceView,
                dataSource: augmentedDataSource,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                usage: usages[dataSourceView.id] || {
                  count: 0,
                  agents: [],
                },
              };
            })
          );
        return res.status(200).json({
          dataSourceViews: enhancedDataSourceViews,
        });
      }
    }

    case "POST": {
      if (!space.canAdministrate(auth)) {
        // Only admins, or builders who have to the space, can create a new view
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Only users that are `admins` can administrate spaces.",
          },
        });
      }

      const isSaveDataSourceViewsEnabled =
        await KillSwitchResource.isKillSwitchEnabled(
          "save_data_source_views"
        );
      if (isSaveDataSourceViewsEnabled) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "app_auth_error",
            message:
              "Saving data source views is temporarily disabled, try again later.",
          },
        });
      }

      const bodyValidation = PostDataSourceViewSchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { dataSourceId, parentsIn } = bodyValidation.right;

      // Create a new view.
      const dataSource = await DataSourceResource.fetchById(auth, dataSourceId);
      if (!dataSource) {
        return apiError(req, res, {
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
        return apiError(req, res, {
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
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: dataSourceViewRes.error.message,
          },
        });
      }

      return res.status(201).json({
        dataSourceView: dataSourceViewRes.value.toJSON(),
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
