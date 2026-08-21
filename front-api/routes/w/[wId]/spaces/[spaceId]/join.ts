import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { GroupResource } from "@app/lib/resources/group_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { withSpace } from "@front-api/middlewares/with_space";

// Mounted under /api/w/:wId/spaces/:spaceId/join.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx) => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "You can only join Pods, not regular spaces.",
        },
      });
    }

    if (space.isProjectAndRestricted()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "This Pod is restricted. You need to be invited to join.",
        },
      });
    }

    if (space.managementMode !== "manual") {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message:
            "You cannot join this Pod, its members are not managed manually.",
        },
      });
    }

    if (space.isMember(auth)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "You are already a member of this Pod.",
        },
      });
    }

    // The space is an open, manually-managed project and the caller is not yet a member (checked
    // above), so self-join is authorized; add directly to the member group (from group_permissions).
    const memberGroup = await space.fetchManualMemberGroup(auth);
    const user = auth.getNonNullableUser();
    const result = await memberGroup.dangerouslyAddMembers(auth, {
      users: [user.toJSON()],
    });
    if (result.isErr()) {
      return apiError(ctx, {
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

    return ctx.json({ success: true });
  }
);

export default app;
