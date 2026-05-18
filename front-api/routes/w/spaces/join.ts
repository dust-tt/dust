import { Hono } from "hono";

import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupSpaceMemberResource } from "@app/lib/resources/group_space_member_resource";

import { spaceResource } from "../../../middleware/space_resource";

// Mounted under /api/w/:wId/spaces/:spaceId/join.
export const joinApp = new Hono();

joinApp.post(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");

    if (!space.isProject()) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: "You can only join projects, not regular spaces.",
          },
        },
        400
      );
    }

    if (space.isProjectAndRestricted()) {
      return c.json(
        {
          error: {
            type: "workspace_auth_error",
            message:
              "This project is restricted. You need to be invited to join.",
          },
        },
        403
      );
    }

    if (space.managementMode !== "manual") {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message:
              "You cannot join this project, its members are not managed manually.",
          },
        },
        403
      );
    }

    if (space.isMember(auth)) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: "You are already a member of this project.",
          },
        },
        400
      );
    }

    const memberGroupSpaces = await GroupSpaceMemberResource.fetchBySpace({
      space,
      filterOnManagementMode: true,
    });

    if (memberGroupSpaces.length !== 1) {
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message:
              "There should be exactly one member group for the project.",
          },
        },
        500
      );
    }

    const memberGroupSpace = memberGroupSpaces[0];
    const user = auth.getNonNullableUser();
    const result = await memberGroupSpace.addMembers(auth, {
      users: [user.toJSON()],
    });
    if (result.isErr()) {
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: result.error.message,
          },
        },
        500
      );
    }

    void emitAuditLogEvent({
      auth,
      action: "project.joined",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("space", space),
      ],
      context: getAuditLogContext(auth),
      metadata: { space_name: space.name },
    });

    const workspace = auth.getNonNullableWorkspace();
    await GroupResource.invalidateGroupIdsCacheForUser({
      user: { id: user.id },
      workspace: { id: workspace.id },
    });

    return c.json({ success: true });
  }
);
