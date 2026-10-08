import {
  emitGroupManagerAuditLog,
  emitGroupMemberAuditLogs,
} from "@app/lib/api/groups/audit";
import { getGroupAllowedActions } from "@app/lib/api/groups/management_actions";
import {
  getGroupManagers,
  updateGroupManagers,
} from "@app/lib/api/groups/manager_assignments";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import type {
  DeleteGroupResponseBody,
  GetGroupResponseBody,
  PatchGroupResponseBody,
} from "@app/types/api/groups/manage";
import { PatchGroupBodySchema } from "@app/types/api/groups/manage";
import { isManageableGroupKind } from "@app/types/groups";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightUserType, UserType } from "@app/types/user";
import { toLightUser } from "@app/types/user";
import { workspaceApp } from "@front-api/middlewares/ctx";
import {
  ensureHasAnyGroupPermission,
  ensureIsManager,
} from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import discovery from "./discovery";

const ParamsSchema = z.object({
  groupId: z.string(),
});

// Mounted at /api/w/:wId/groups/:groupId.
const app = workspaceApp();

function serializeGroupUsers(
  auth: Authenticator,
  users: UserType[]
): LightUserType[] {
  return auth.isManager() ? users : users.map(toLightUser);
}

/** @ignoreswagger */
app.get(
  "/",
  ensureHasAnyGroupPermission(
    "read_usage",
    "Group management access required."
  ),
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

    if (!auth.can("read_usage", group)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Group management access required.",
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
      members: serializeGroupUsers(
        auth,
        members.map((member) => member.toJSON())
      ),
      managers: serializeGroupUsers(auth, await getGroupManagers(auth, group)),
    });
  }
);

/** @ignoreswagger */
app.patch(
  "/",
  ensureHasAnyGroupPermission(
    "write",
    "Group membership management access required."
  ),
  validate("param", ParamsSchema),
  validate("json", PatchGroupBodySchema),
  async (ctx): HandlerResult<PatchGroupResponseBody> => {
    const auth = ctx.get("auth");
    const { groupId } = ctx.req.valid("param");
    const update = ctx.req.valid("json");

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

    // Assignment changes use a separate PATCH so invalid membership/name changes cannot leave
    // a partially applied manager change (or vice versa).
    if ("managerDiff" in update) {
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
      const assignment = await updateGroupManagers(
        auth,
        group,
        update.managerDiff.add,
        update.managerDiff.remove
      );
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
                ? "Only workspace admins and managers can appoint group managers."
                : "All group managers must be active workspace members.",
          },
        });
      }

      emitGroupManagerAuditLog(auth, group, assignment);

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
        members: serializeGroupUsers(
          auth,
          members.map((member) => member.toJSON())
        ),
        managers: serializeGroupUsers(auth, assignment.managers),
      });
    }

    const updateRes =
      "memberDiff" in update
        ? await group.updateRegularManualGroupMembers(auth, {
            addUserIds: update.memberDiff.add,
            removeUserIds: update.memberDiff.remove,
          })
        : await group.updateRegularManualGroup(auth, { name: update.name });
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
          assertNever(updateRes.error);
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
      members: serializeGroupUsers(
        auth,
        members.map((member) => member.toJSON())
      ),
      managers: serializeGroupUsers(auth, await getGroupManagers(auth, group)),
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
