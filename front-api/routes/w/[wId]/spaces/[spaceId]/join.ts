import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";

import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupSpaceMemberResource } from "@app/lib/resources/group_space_member_resource";

import { spaceResource } from "@front-api/middleware/space_resource";

// Mounted under /api/w/:wId/spaces/:spaceId/join.
const app = new Hono();

app.post(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");

    if (!space.isProject()) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "You can only join Pods, not regular spaces.",
        },
      });
    }

    if (space.isProjectAndRestricted()) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "This Pod is restricted. You need to be invited to join.",
        },
      });
    }

    if (space.managementMode !== "manual") {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message:
            "You cannot join this Pod, its members are not managed manually.",
        },
      });
    }

    if (space.isMember(auth)) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "You are already a member of this Pod.",
        },
      });
    }

    const memberGroupSpaces = await GroupSpaceMemberResource.fetchBySpace({
      space,
      filterOnManagementMode: true,
    });

    if (memberGroupSpaces.length !== 1) {
      return apiError(c, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "There should be exactly one member group for the Pod.",
        },
      });
    }

    const memberGroupSpace = memberGroupSpaces[0];
    const user = auth.getNonNullableUser();
    const result = await memberGroupSpace.addMembers(auth, {
      users: [user.toJSON()],
    });
    if (result.isErr()) {
      return apiError(c, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: result.error.message,
        },
      });
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

export default app;
