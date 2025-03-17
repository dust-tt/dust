import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import { uniq } from "lodash";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSourceViewsUsageByCategory } from "@app/lib/api/agent_data_sources";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import { softDeleteSpaceAndLaunchScrubWorkflow } from "@app/lib/api/spaces";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type {
  DataSourceWithAgentsUsageType,
  SpaceType,
  UserType,
  WithAPIErrorResponse,
} from "@app/types";
import {
  DATA_SOURCE_VIEW_CATEGORIES,
  PatchSpaceRequestBodySchema,
} from "@app/types";

type SpaceCategoryInfo = {
  usage: DataSourceWithAgentsUsageType;
  count: number;
};

export type GetSpaceResponseBody = {
  space: SpaceType & {
    categories: { [key: string]: SpaceCategoryInfo };
    members: UserType[];
  };
};

export type PatchSpaceResponseBody = {
  space: SpaceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetSpaceResponseBody | PatchSpaceResponseBody>
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const dataSourceViews = await DataSourceViewResource.listBySpace(
        auth,
        space
      );
      const apps = await AppResource.listBySpace(auth, space);

      const categories: { [key: string]: SpaceCategoryInfo } = {};
      for (const category of DATA_SOURCE_VIEW_CATEGORIES) {
        categories[category] = {
          count: 0,
          usage: {
            count: 0,
            agentNames: [],
          },
        };

        const dataSourceViewsInCategory = dataSourceViews.filter(
          (view) => view.toJSON().category === category
        );

        // As the usage call is expensive, we only call it if there are views in the category
        if (dataSourceViewsInCategory.length > 0) {
          const usages = await getDataSourceViewsUsageByCategory({
            auth,
            category,
          });

          for (const dsView of dataSourceViewsInCategory) {
            categories[category].count += 1;

            const usage = usages[dsView.id];

            if (usage) {
              categories[category].usage.agentNames = categories[
                category
              ].usage.agentNames.concat(usage.agentNames);
              categories[category].usage.agentNames = uniq(
                categories[category].usage.agentNames
              );
              categories[category].usage.count += usage.count;
            }
          }
        }
      }

      categories["apps"].count = apps.length;

      const currentMembers = (
        await Promise.all(
          space.groups.map((group) => group.getActiveMembers(auth))
        )
      ).flat();
      return res.status(200).json({
        space: {
          ...space.toJSON(),
          categories,
          members: currentMembers.map((member) => member.toJSON()),
        },
      });
    }

    case "PATCH": {
      if (!space.canAdministrate(auth)) {
        // Only admins can update.
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Only admins can administrate spaces.",
          },
        });
      }

      const bodyValidation = PatchSpaceRequestBodySchema.decode(req.body);
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

      const { content, name } = bodyValidation.right;

      if (content) {
        const currentViews = await DataSourceViewResource.listBySpace(
          auth,
          space
        );

        const viewByDataSourceId = currentViews.reduce<
          Record<string, DataSourceViewResource>
        >((acc, view) => {
          acc[view.dataSource.sId] = view;
          return acc;
        }, {});

        for (const dataSourceConfig of content) {
          const view = viewByDataSourceId[dataSourceConfig.dataSourceId];
          if (view) {
            // Update existing view.
            await view.updateParents(dataSourceConfig.parentsIn);
            await view.setEditedBy(auth);
          } else {
            // Create a new view.
            const dataSource = await DataSourceResource.fetchById(
              auth,
              dataSourceConfig.dataSourceId
            );
            if (dataSource) {
              await DataSourceViewResource.createViewInSpaceFromDataSource(
                space,
                dataSource,
                dataSourceConfig.parentsIn,
                auth.user()
              );
            }
          }
        }

        for (const dataSourceId of Object.keys(viewByDataSourceId)) {
          if (!content.map((c) => c.dataSourceId).includes(dataSourceId)) {
            const view = viewByDataSourceId[dataSourceId];

            // Hard delete previous views.
            await view.delete(auth, { hardDelete: true });
          }
        }
      }

      if (name) {
        await space.updateName(auth, name);
      }
      return res.status(200).json({ space: space.toJSON() });
    }

    case "DELETE": {
      if (!space.canAdministrate(auth)) {
        // Only admins, who have access to the space, can delete.
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Only users that are `admins` can administrate spaces.",
          },
        });
      }

      try {
        const deleteRes = await softDeleteSpaceAndLaunchScrubWorkflow(
          auth,
          space
        );
        if (deleteRes.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: deleteRes.error.message,
            },
          });
        }
      } catch (e: any) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: e.message ?? "The space cannot be deleted.",
          },
        });
      }

      return res.status(200).json({ space: space.toJSON() });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
