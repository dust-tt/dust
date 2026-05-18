import { Hono } from "hono";
import { z } from "zod";

import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { notifyProjectMembersAdded } from "@app/lib/notifications/workflows/project-added-as-member";
import { GroupSpaceMemberResource } from "@app/lib/resources/group_space_member_resource";
import { areOpenProjectsAllowed } from "@app/lib/workspace_policies";
import { auditLog } from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";

import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

const PatchSpaceMembersRequestBodySchema = z.intersection(
  z.object({
    isRestricted: z.boolean(),
    name: z.string(),
  }),
  z.discriminatedUnion("managementMode", [
    z.object({
      memberIds: z.array(z.string()),
      managementMode: z.literal("manual"),
      editorIds: z.array(z.string()),
    }),
    z.object({
      groupIds: z.array(z.string()),
      managementMode: z.literal("group"),
      editorGroupIds: z.array(z.string()),
    }),
  ])
);

export type PatchSpaceMembersRequestBodyType = z.infer<
  typeof PatchSpaceMembersRequestBodySchema
>;

// Mounted at /api/w/:wId/spaces/:spaceId/members.
const app = new Hono();

app.patch(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  validate("json", PatchSpaceMembersRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");

    if (!space.isRegular() && !space.isProject()) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: "Only projects and regular spaces can have members.",
          },
        },
        400
      );
    }

    if (!space.canAdministrate(auth)) {
      return c.json(
        {
          error: {
            type: "workspace_auth_error",
            message:
              "Only users that are `admins` can administrate space members.",
          },
        },
        403
      );
    }

    const body = c.req.valid("json");
    const owner = auth.getNonNullableWorkspace();

    if (
      space.isProjectAndRestricted() &&
      !body.isRestricted &&
      !areOpenProjectsAllowed(owner)
    ) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message:
              "Open projects are disabled by your workspace admin. Keep this project private.",
          },
        },
        403
      );
    }

    // Track current members before update to identify newly added ones.
    let currentMemberIds: Set<string> | undefined;
    if (space.isProject() && body.managementMode === "manual") {
      const memberGroupSpaces = await GroupSpaceMemberResource.fetchBySpace({
        space,
        filterOnManagementMode: true,
      });
      if (memberGroupSpaces.length === 1) {
        const currentMembers =
          await memberGroupSpaces[0].group.getActiveMembers(auth);
        currentMemberIds = new Set(currentMembers.map((m) => m.sId));
      }
    }

    const updateRes = await space.updatePermissions(auth, body);
    if (updateRes.isErr()) {
      switch (updateRes.error.code) {
        case "unauthorized":
          return c.json(
            {
              error: {
                type: "workspace_auth_error",
                message:
                  "Only users that are `admins` can administrate space members.",
              },
            },
            401
          );
        case "user_not_found":
          return c.json(
            {
              error: {
                type: "user_not_found",
                message: "The user was not found in the workspace.",
              },
            },
            404
          );
        case "user_not_member":
          return c.json(
            {
              error: {
                type: "invalid_request_error",
                message: "The user is not a member of the workspace.",
              },
            },
            400
          );
        case "group_not_found":
          return c.json(
            {
              error: {
                type: "group_not_found",
                message: "The group was not found in the workspace.",
              },
            },
            404
          );
        case "user_already_member":
          return c.json(
            {
              error: {
                type: "invalid_request_error",
                message: "The user is already a member of the space.",
              },
            },
            400
          );
        case "invalid_id":
          return c.json(
            {
              error: {
                type: "invalid_request_error",
                message: "Some of the passed ids are invalid.",
              },
            },
            400
          );
        case "group_requirements_not_met":
          return c.json(
            {
              error: {
                type: "workspace_auth_error",
                message:
                  "Some users have insufficient role privilege to be added to the space.",
              },
            },
            403
          );
        case "system_or_global_group":
          return c.json(
            {
              error: {
                type: "invalid_request_error",
                message:
                  "Users cannot be removed from system or global groups.",
              },
            },
            400
          );
        default:
          assertNever(updateRes.error.code);
      }
    }

    // Audit log when an admin who is not a member of the space updates its permissions.
    if (!space.canRead(auth)) {
      const user = auth.user();
      auditLog(
        {
          author: user ? user.toJSON() : "no-author",
          workspaceId: auth.getNonNullableWorkspace().sId,
          spaceId: space.sId,
          spaceName: space.name,
          action: "space_permissions_updated_by_non_member",
        },
        "[Security] Admin updated space permissions without being a member"
      );
    }

    void emitAuditLogEvent({
      auth,
      action: "space.permissions_updated",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("space", space),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        space_name: space.name,
        management_mode: body.managementMode,
        is_restricted: String(body.isRestricted),
        ...(body.managementMode === "manual"
          ? {
              member_ids: body.memberIds.join(","),
              editor_ids: body.editorIds.join(","),
            }
          : {
              group_ids: body.groupIds.join(","),
              editor_group_ids: body.editorGroupIds.join(","),
            }),
      },
    });

    // Trigger notifications for newly added members (projects only).
    if (
      space.isProject() &&
      body.managementMode === "manual" &&
      currentMemberIds
    ) {
      const newlyAddedUserIds = body.memberIds.filter(
        (id) => !currentMemberIds.has(id)
      );
      if (newlyAddedUserIds.length > 0) {
        notifyProjectMembersAdded(auth, {
          project: space.toJSON(),
          addedUserIds: newlyAddedUserIds,
        });
      }
    }

    return c.json({ space: space.toJSON() });
  }
);

export default app;
