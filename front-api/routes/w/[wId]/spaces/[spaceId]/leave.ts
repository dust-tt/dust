import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { spaceResource } from "@front-api/middleware/space_resource";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted under /api/w/:wId/spaces/:spaceId/leave.
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
          message: "You can only leave Pods, not regular spaces.",
        },
      });
    }

    if (!space.isMember(auth)) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "You are not a member of this Pod.",
        },
      });
    }

    const user = auth.getNonNullableUser();

    const memberGroup = space.groups.find((g) => g.kind === "regular");
    const editorGroup = space.groups.find((g) => g.kind === "space_editors");

    if (editorGroup) {
      const activeEditors = await editorGroup.getActiveMembers(auth);
      const isUserEditor = activeEditors.some((m) => m.sId === user.sId);
      if (isUserEditor && activeEditors.length === 1) {
        return apiError(c, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "You cannot leave this Pod as you are the last editor. Please add another editor first.",
          },
        });
      }
    }

    const groupsToLeave = [memberGroup, editorGroup].filter(
      (g): g is NonNullable<typeof g> => g !== undefined
    );

    for (const group of groupsToLeave) {
      const result = await group.leaveGroup(auth);
      if (result.isErr() && result.error.code !== "user_not_member") {
        return apiError(c, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: result.error.message,
          },
        });
      }
    }

    void emitAuditLogEvent({
      auth,
      action: "project.left",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("space", space),
      ],
      context: getAuditLogContext(auth),
      metadata: { space_name: space.name },
    });

    return c.json({ success: true });
  }
);

export default app;
