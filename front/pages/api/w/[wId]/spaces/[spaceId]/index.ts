/**
 * @swagger
 * /api/w/{wId}/spaces/{spaceId}:
 *   get:
 *     summary: Get a space
 *     description: Returns the details of a specific space including categories, members, and permissions.
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
 *         name: includeAllMembers
 *         required: false
 *         description: Include all members (including inactive)
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
 *                 space:
 *                   allOf:
 *                     - $ref: '#/components/schemas/PrivateSpace'
 *                     - type: object
 *                       properties:
 *                         categories:
 *                           type: object
 *                           additionalProperties:
 *                             type: object
 *                             properties:
 *                               count:
 *                                 type: integer
 *                               usage:
 *                                 type: object
 *                                 properties:
 *                                   count:
 *                                     type: integer
 *                                   agents:
 *                                     type: array
 *                                     items:
 *                                       type: object
 *                         canWrite:
 *                           type: boolean
 *                         canRead:
 *                           type: boolean
 *                         isMember:
 *                           type: boolean
 *                         isEditor:
 *                           type: boolean
 *                         members:
 *                           type: array
 *                           items:
 *                             type: object
 *                         description:
 *                           type: string
 *                           nullable: true
 *                         archivedAt:
 *                           type: integer
 *                           nullable: true
 *       401:
 *         description: Unauthorized
 *   patch:
 *     summary: Update a space
 *     description: Updates the properties of a specific space.
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
 *             properties:
 *               name:
 *                 type: string
 *               content:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     dataSourceId:
 *                       type: string
 *                     parentsIn:
 *                       type: array
 *                       items:
 *                         type: string
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 space:
 *                   $ref: '#/components/schemas/PrivateSpace'
 *       401:
 *         description: Unauthorized
 *   delete:
 *     summary: Delete a space
 *     description: Deletes a specific space from the workspace.
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
 *         name: force
 *         required: false
 *         description: Force deletion even if space is in use
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
 *                 space:
 *                   $ref: '#/components/schemas/PrivateSpace'
 *       401:
 *         description: Unauthorized
 */
import { getDataSourceViewsUsageByCategory } from "@app/lib/api/agent_data_sources";
import {
  buildWorkspaceTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import { softDeleteSpaceAndLaunchScrubWorkflow } from "@app/lib/api/spaces";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import { PatchSpaceRequestBodySchema } from "@app/types/api/internal/spaces";
import { DATA_SOURCE_VIEW_CATEGORIES } from "@app/types/api/public/spaces";
import type { AgentsUsageType } from "@app/types/data_source";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { SpaceType } from "@app/types/space";
import type { SpaceUserType } from "@app/types/user";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import uniqBy from "lodash/uniqBy";
import type { NextApiRequest, NextApiResponse } from "next";

export type SpaceCategoryInfo = {
  usage: AgentsUsageType;
  count: number;
};

export type RichSpaceType = SpaceType & {
  categories: { [key: string]: SpaceCategoryInfo };
  canWrite: boolean;
  canRead: boolean;
  isMember: boolean;
  members: SpaceUserType[];
  isEditor: boolean;
  // Useful in case of projects
  description: string | null;
  archivedAt: number | null;
};
export type GetSpaceResponseBody = {
  space: RichSpaceType;
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
      const actions = await MCPServerViewResource.listBySpace(auth, space);
      const actionsCount = actions.filter(
        (a) => a.toJSON().server.availability === "manual"
      ).length;

      const categories: { [key: string]: SpaceCategoryInfo } = {};
      for (const category of DATA_SOURCE_VIEW_CATEGORIES) {
        categories[category] = {
          count: 0,
          usage: {
            count: 0,
            agents: [],
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
              categories[category].usage.agents = categories[
                category
              ].usage.agents.concat(usage.agents);
              categories[category].usage.agents = uniqBy(
                categories[category].usage.agents,
                "sId"
              );
            }
          }
          categories[category].usage.count =
            categories[category].usage.agents.length;
        }
      }

      categories["apps"].count = apps.length;
      categories["actions"].count = actionsCount;

      const { includeAllMembers } = req.query;
      const shouldIncludeAllMembers = includeAllMembers === "true";

      const { groupsToProcess, allGroupMemberships } =
        await space.fetchManualGroupsMemberships(auth, {
          shouldIncludeAllMembers,
        });

      const membershipMap = new Map<number, Map<number, string>>();
      for (const membership of allGroupMemberships) {
        if (!membershipMap.has(membership.groupId)) {
          membershipMap.set(membership.groupId, new Map());
        }
        membershipMap
          .get(membership.groupId)
          ?.set(membership.userId, membership.startAt.toDateString());
      }

      const currentMembers: SpaceUserType[] = uniqBy(
        (
          await concurrentExecutor(
            groupsToProcess,
            async (group) => {
              const members = shouldIncludeAllMembers
                ? await group.getAllMembers(auth)
                : await group.getActiveMembers(auth);
              const groupMemberships = membershipMap.get(group.id);
              return members.map((member) => ({
                ...member.toJSON(),
                isEditor: group.group_vaults?.kind === "project_editor", // we rely on the information stored in group_vaults to know if the group is an editor group
                joinedAt: groupMemberships?.get(member.id),
              }));
            },
            { concurrency: 10 }
          )
        ).flat(),
        "sId"
      );

      const projectMetadata = space.isProject()
        ? await ProjectMetadataResource.fetchBySpace(auth, space)
        : undefined;

      return res.status(200).json({
        space: {
          ...space.toJSON(),
          categories,
          canWrite: space.canWrite(auth),
          canRead: space.canRead(auth),
          isMember: space.isMember(auth),
          isEditor: space.canAdministrate(auth),
          members: currentMembers,
          description: projectMetadata?.description ?? null,
          archivedAt: projectMetadata?.archivedAt?.getTime() ?? null,
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
              const dataSourceViewRes =
                await DataSourceViewResource.createViewInSpaceFromDataSource(
                  auth,
                  space,
                  dataSource,
                  dataSourceConfig.parentsIn
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

      const { force } = req.query;
      const shouldForce = isString(force) && force === "true";

      try {
        const deleteRes = await softDeleteSpaceAndLaunchScrubWorkflow(
          auth,
          space,
          shouldForce
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

      void emitAuditLogEvent({
        auth,
        action: "space.deleted",
        targets: [
          buildWorkspaceTarget(auth.getNonNullableWorkspace()),
          { type: "space", id: space.sId, name: space.name },
        ],
        context: getAuditLogContext(auth, req),
        metadata: {
          spaceName: space.name,
          spaceKind: space.kind,
        },
      });

      return res.status(200).json({ space: space.toJSON() });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, PATCH or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
