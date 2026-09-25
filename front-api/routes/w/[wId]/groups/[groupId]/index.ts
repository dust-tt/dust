import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { emitGroupMemberAuditLogs } from "@app/lib/api/groups/audit";
import { getGroupAllowedActions } from "@app/lib/api/groups/management_actions";
import {
  getGroupManagers,
  replaceGroupManagers,
} from "@app/lib/api/groups/manager_assignments";
import { GroupResource } from "@app/lib/resources/group_resource";
import type {
  DeleteGroupResponseBody,
  GetGroupResponseBody,
  PatchGroupResponseBody,
} from "@app/types/api/groups/manage";
import { PatchGroupBodySchema } from "@app/types/api/groups/manage";
import { isManageableGroupKind } from "@app/types/groups";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import discovery from "./discovery";

const ParamsSchema = z.object({
  groupId: z.string(),
});

// Mounted at /api/w/:wId/groups/:groupId.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsManager(),
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetGroupResponseBody> => {
    const auth = ctx.get("auth");
    const { groupId } = ctx.req.valid("param");

    const groupRes = await GroupResource.fetchById(auth, groupId);
    if (groupRes.isErr()) {
      switch (groupRes.error.code) {
        case "invalid_id":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: groupRes.error.message,
            },
          });
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: groupRes.error.message,
            },
          });
        case "group_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "group_not_found",
              message: groupRes.error.message,
            },
          });
        default:
          assertNever(groupRes.error.code);
      }
    }

    const group = groupRes.value;

    // This management API only surfaces groups exposed in workspace admin UIs: manually-managed
    // ones (editable) and provisioned ones (read-only).
    if (!isManageableGroupKind(group.kind)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "group_not_found",
          message: "Group not found.",
        },
      });
    }

    const members = await group.getActiveMembers(auth);
    const allowedActions = getGroupAllowedActions(
      auth,
      group,
      await auth.hasFeatureFlag("group_management")
    );

    return ctx.json({
      group: { ...group.toJSON(), memberCount: members.length, allowedActions },
      members: members.map((member) => member.toJSON()),
      managers: await getGroupManagers(auth, group),
    });
  }
);

/** @ignoreswagger */
app.patch(
  "/",
  ensureIsManager(),
  validate("param", ParamsSchema),
  validate("json", PatchGroupBodySchema),
  async (ctx): HandlerResult<PatchGroupResponseBody> => {
    const auth = ctx.get("auth");
    const { groupId } = ctx.req.valid("param");
    const { name, memberIds, managerIds } = ctx.req.valid("json");

    if (
      name === undefined &&
      memberIds === undefined &&
      managerIds === undefined
    ) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "At least one of `name`, `memberIds`, or `managerIds` must be provided.",
        },
      });
    }

    const groupRes = await GroupResource.fetchById(auth, groupId);
    if (groupRes.isErr()) {
      switch (groupRes.error.code) {
        case "invalid_id":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: groupRes.error.message,
            },
          });
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: groupRes.error.message,
            },
          });
        case "group_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "group_not_found",
              message: groupRes.error.message,
            },
          });
        default:
          assertNever(groupRes.error.code);
      }
    }

    const group = groupRes.value;
    const isGroupManagementEnabled =
      await auth.hasFeatureFlag("group_management");

    if (managerIds !== undefined) {
      // Assignment changes use a separate PATCH so invalid membership/name changes cannot leave
      // a partially applied manager change (or vice versa).
      if (name !== undefined || memberIds !== undefined) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Update group managers separately from the name and members.",
          },
        });
      }
      if (!isManageableGroupKind(group.kind)) {
        return apiError(ctx, {
          status_code: 404,
          api_error: { type: "group_not_found", message: "Group not found." },
        });
      }
      if (!isGroupManagementEnabled) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Group management is not enabled for this workspace.",
          },
        });
      }
      const assignment = await replaceGroupManagers(auth, group, managerIds);
      if (assignment.kind !== "ok") {
        return apiError(ctx, {
          status_code: assignment.kind === "unauthorized" ? 403 : 400,
          api_error: {
            type:
              assignment.kind === "unauthorized"
                ? "workspace_auth_error"
                : "invalid_request_error",
            message:
              assignment.kind === "unauthorized"
                ? "Only workspace admins can appoint group managers."
                : "All group managers must be active workspace members.",
          },
        });
      }

      if (assignment.addedUsers.length || assignment.removedUsers.length) {
        void emitAuditLogEvent({
          auth,
          action: "group.managers_updated",
          targets: [
            buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
            buildAuditLogTarget("group", group),
          ],
          context: getAuditLogContext(auth),
          metadata: {
            added_manager_ids: assignment.addedUsers
              .map((u) => u.sId)
              .join(","),
            removed_manager_ids: assignment.removedUsers
              .map((u) => u.sId)
              .join(","),
          },
        });
      }

      const members = await group.getActiveMembers(auth);
      return ctx.json({
        group: {
          ...group.toJSON(),
          memberCount: members.length,
          allowedActions: getGroupAllowedActions(
            auth,
            group,
            isGroupManagementEnabled
          ),
        },
        members: members.map((member) => member.toJSON()),
        managers: assignment.managers,
      });
    }

    const updateRes = await group.updateRegularManualGroup(auth, {
      name,
      memberIds,
    });
    if (updateRes.isErr()) {
      switch (updateRes.error.code) {
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: updateRes.error.message,
            },
          });
        case "name_conflict":
          return apiError(ctx, {
            status_code: 409,
            api_error: {
              type: "invalid_request_error",
              message: updateRes.error.message,
            },
          });
        case "user_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "user_not_found",
              message: updateRes.error.message,
            },
          });
        case "group_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "group_not_found",
              message: updateRes.error.message,
            },
          });
        case "user_not_member":
        case "user_already_member":
        case "group_requirements_not_met":
        case "last_group_member":
        case "system_or_global_group":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: updateRes.error.message,
            },
          });
        default:
          assertNever(updateRes.error.code);
      }
    }

    emitGroupMemberAuditLogs(auth, group, updateRes.value);

    const members = await group.getActiveMembers(auth);

    return ctx.json({
      group: {
        ...group.toJSON(),
        memberCount: members.length,
        allowedActions: getGroupAllowedActions(
          auth,
          group,
          isGroupManagementEnabled
        ),
      },
      members: members.map((member) => member.toJSON()),
      managers: await getGroupManagers(auth, group),
    });
  }
);

/** @ignoreswagger */
app.delete(
  "/",
  ensureIsManager(),
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<DeleteGroupResponseBody> => {
    const auth = ctx.get("auth");
    const { groupId } = ctx.req.valid("param");

    const groupRes = await GroupResource.fetchById(auth, groupId);
    if (groupRes.isErr()) {
      switch (groupRes.error.code) {
        case "invalid_id":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: groupRes.error.message,
            },
          });
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: groupRes.error.message,
            },
          });
        case "group_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "group_not_found",
              message: groupRes.error.message,
            },
          });
        default:
          assertNever(groupRes.error.code);
      }
    }

    const group = groupRes.value;

    const deleteRes = await group.deleteRegularManualGroup(auth);
    if (deleteRes.isErr()) {
      switch (deleteRes.error.code) {
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: deleteRes.error.message,
            },
          });
        case "group_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "group_not_found",
              message: deleteRes.error.message,
            },
          });
        case "internal_error":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: deleteRes.error.message,
            },
          });
        default:
          assertNever(deleteRes.error.code);
      }
    }

    return ctx.json({ success: true });
  }
);

app.route("/discovery", discovery);

export default app;
