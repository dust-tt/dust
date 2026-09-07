import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  getSpaceCategoriesWithUsage,
  softDeleteSpaceAndLaunchScrubWorkflow,
} from "@app/lib/api/spaces";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  GetSpaceResponseBody,
  PatchSpaceResponseBody,
} from "@app/types/api/spaces";
import { PatchSpaceRequestBodySchema } from "@app/types/api/spaces";
import { normalizeTabsOrder, sortPodFileTabs } from "@app/types/pod_file_tab";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { SpaceUserType } from "@app/types/user";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";
import uniqBy from "lodash/uniqBy";

import apps from "./apps";
import dataSourceViews from "./data_source_views";
import dataSources from "./data_sources";
import files from "./files";
import join from "./join";
import leave from "./leave";
import mcp from "./mcp";
import mcpViews from "./mcp_views";
import members from "./members";
import projectContext from "./project_context";
import projectMetadata from "./project_metadata";
import projectNotificationPreferences from "./project_notification_preferences";
import projectRestrictionImpact from "./project_restriction_impact";
import projectTasks from "./project_tasks";
import sandbox from "./sandbox";
import searchConversations from "./search_conversations";
import star from "./star";
import webhookSourceViews from "./webhook_source_views";

// Mounted under /api/w/:wId/spaces/:spaceId. The bare `/` handles GET, PATCH,
// and DELETE on the space resource itself. Per-space sub-resource sub-apps
// live in their own sibling files; each sub-app applies its own
// `withSpace(...)` middleware so different permission options can be used
// per route.
const app = workspaceApp();

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
 *                         groupIds:
 *                           type: array
 *                           items:
 *                             type: string
 *                         isRestricted:
 *                           type: boolean
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
 *                         todoGenerationEnabled:
 *                           type: boolean
 *                           description: Whether automatic todo suggestions from project activity are enabled.
 *                         lastTodoAnalysisAt:
 *                           type: integer
 *                           nullable: true
 *                           description: Unix timestamp (ms) of the last automatic todo suggestion scan, if any.
 *                         pinnedFramePath:
 *                           type: string
 *                           nullable: true
 *                           description: Scoped path to the frame file pinned as the Pod banner.
 *                         frameTabs:
 *                           type: array
 *                           description: Frames promoted as custom Pod tabs.
 *                           items:
 *                             type: object
 *                             properties:
 *                               path:
 *                                 type: string
 *                               title:
 *                                 type: string
 *                               icon:
 *                                 type: string
 *                         tabsOrder:
 *                           type: array
 *                           description: Interleaved system tab ids and frame paths before Settings.
 *                           items:
 *                             type: string
 *                         isAdminControlled:
 *                           type: boolean
 *                           description: Whether workspace admins control membership and connected data for this Pod.
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

app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<GetSpaceResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    const categories = await getSpaceCategoriesWithUsage(auth, space);

    const shouldIncludeAllMembers =
      ctx.req.query("includeAllMembers") === "true";

    const { groupsToProcess, allGroupMemberships, editorGroupModelId } =
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
            const groupMembers = shouldIncludeAllMembers
              ? await group.getAllMembers(auth)
              : await group.getActiveMembers(auth);
            const groupMemberships = membershipMap.get(group.id);
            return groupMembers.map((member) => ({
              ...member.toJSON(),
              isEditor: group.id === editorGroupModelId,
              joinedAt: groupMemberships?.get(member.id),
            }));
          },
          { concurrency: 10 }
        )
      ).flat(),
      "sId"
    );

    const meta = space.isProject()
      ? await ProjectMetadataResource.fetchBySpace(auth, space)
      : undefined;

    const [enrichedSpace] = await SpaceResource.enrichSpacesWithAccess(auth, [
      space,
    ]);

    return ctx.json({
      space: {
        ...enrichedSpace,
        categories,
        canWrite: auth.can("write", space),
        canRead: auth.can("read", space),
        isMember: space.isMember(auth),
        isEditor: auth.can("admin", space),
        members: currentMembers,
        description: meta?.description ?? null,
        archivedAt: meta?.archivedAt?.getTime() ?? null,
        // Automated task generation removed; keep fields hardcoded for API compat.
        todoGenerationEnabled: false,
        lastTodoAnalysisAt: null,
        pinnedFramePath: meta?.pinnedFramePath ?? null,
        frameTabs: sortPodFileTabs(meta?.frameTabs ?? []),
        tabsOrder: normalizeTabsOrder(
          meta?.tabsOrder ?? [],
          (meta?.frameTabs ?? []).map((tab) => tab.path)
        ),
        isAdminControlled: meta?.isAdminControlled ?? false,
      },
    });
  }
);

app.patch(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("json", PatchSpaceRequestBodySchema),
  async (ctx): HandlerResult<PatchSpaceResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    if (!auth.can("admin", space)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Only admins can administrate spaces.",
        },
      });
    }

    const { content, name } = ctx.req.valid("json");

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
              return apiError(ctx, {
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
        if (!content.map((cfg) => cfg.dataSourceId).includes(dataSourceId)) {
          const view = viewByDataSourceId[dataSourceId];
          // Hard delete previous views.
          await view.delete(auth, { hardDelete: true });
        }
      }
    }

    if (name) {
      const nameRes = await space.updateName(auth, name);
      if (nameRes.isErr()) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: nameRes.error.message,
          },
        });
      }
    }
    return ctx.json({ space: space.toJSON() });
  }
);

app.delete(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<PatchSpaceResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    if (!auth.can("admin", space)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Only users that are `admins` can administrate spaces.",
        },
      });
    }

    const shouldForce = ctx.req.query("force") === "true";

    try {
      const deleteRes = await softDeleteSpaceAndLaunchScrubWorkflow(
        auth,
        space,
        shouldForce
      );
      if (deleteRes.isErr()) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: deleteRes.error.message,
          },
        });
      }
    } catch (e) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: normalizeError(e).message ?? "The space cannot be deleted.",
        },
      });
    }

    void emitAuditLogEvent({
      auth,
      action: "space.deleted",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("space", space),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        space_name: space.name,
        space_kind: space.kind,
      },
    });

    return ctx.json({ space: space.toJSON() });
  }
);

app.route("/apps", apps);
app.route("/data_source_views", dataSourceViews);
app.route("/data_sources", dataSources);
app.route("/files", files);
app.route("/join", join);
app.route("/leave", leave);
app.route("/mcp", mcp);
app.route("/mcp_views", mcpViews);
app.route("/members", members);
app.route("/project_context", projectContext);
app.route("/project_metadata", projectMetadata);
app.route("/project_notification_preferences", projectNotificationPreferences);
app.route("/project_restriction_impact", projectRestrictionImpact);
app.route("/project_tasks", projectTasks);
app.route("/sandbox", sandbox);
app.route("/search_conversations", searchConversations);
app.route("/star", star);
app.route("/webhook_source_views", webhookSourceViews);

export default app;
