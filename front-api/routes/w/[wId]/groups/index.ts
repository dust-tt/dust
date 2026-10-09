import {
  emitGroupManagerAuditLog,
  emitGroupMemberAuditLogs,
} from "@app/lib/api/groups/audit";
import { createGroup } from "@app/lib/api/groups/create";
import { getGroupAllowedActions } from "@app/lib/api/groups/management_actions";
import { getGroupManagersForGroups } from "@app/lib/api/groups/manager_assignments";
import {
  hasAnyGroupPermission,
  listGroupsWithVerb,
} from "@app/lib/resources/group_management_access";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { GetGroupsResponseBody } from "@app/types/api/groups";
import {
  CreateGroupBodySchema,
  type PostGroupResponseBody,
} from "@app/types/api/groups/manage";
import type { GroupKind } from "@app/types/groups";
import {
  GroupKindCodec,
  isUserVisibleGroupKind,
  USER_VISIBLE_GROUP_KINDS,
} from "@app/types/groups";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import assert from "assert";
import { z } from "zod";

import sharedUsageLimitPriorities from "@front-api/routes/w/[wId]/groups/shared_usage_limit_priorities";
import groupDetail from "./[groupId]";
import grantedRole from "./[groupId]/granted_role";
import grantedSeatType from "./[groupId]/granted_seat_type";
import sharedUsageLimit from "./[groupId]/shared_usage_limit";
import spendLimit from "./[groupId]/spend_limit";

const GetGroupsQuerySchema = z.object({
  kind: z.union([GroupKindCodec, z.array(GroupKindCodec)]).optional(),
  // When "true", each group also carries its member sIds (one extra batched
  // query) instead of just memberCount.
  withMembers: z.enum(["true", "false"]).optional(),
  withManagers: z.enum(["true", "false"]).optional(),
  managedOnly: z.enum(["true", "false"]).optional(),
});

// Mounted at /api/w/:wId/groups.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", GetGroupsQuerySchema),
  async (ctx): HandlerResult<GetGroupsResponseBody> => {
    const auth = ctx.get("auth");
    const { kind, withMembers, withManagers, managedOnly } =
      ctx.req.valid("query");

    const requestedKinds: GroupKind[] = kind
      ? Array.isArray(kind)
        ? kind
        : [kind]
      : [...USER_VISIBLE_GROUP_KINDS];

    // This endpoint only ever exposes user-visible group kinds. Internal kinds
    // (regular_auto, system) are never listed here, so we clamp
    // whatever was requested to the visible set.
    const groupKinds = requestedKinds.filter(isUserVisibleGroupKind);

    if (
      managedOnly === "true" &&
      !(await hasAnyGroupPermission(auth, "read_usage"))
    ) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Group management access required.",
        },
      });
    }
    const groups =
      managedOnly === "true"
        ? (await listGroupsWithVerb(auth, "read_usage")).filter((group) =>
            groupKinds.some((kind) => kind === group.kind)
          )
        : await GroupResource.listAllWorkspaceGroups(auth, { groupKinds });

    const serializedGroups =
      withMembers === "true"
        ? await GroupResource.fetchJSONWithMembers(auth, groups)
        : await GroupResource.toJSONWithMemberCounts(auth, groups);
    const isGroupManagementEnabled =
      await auth.hasFeatureFlag("group_management");
    const managersByGroup =
      withManagers === "true" && isGroupManagementEnabled
        ? await getGroupManagersForGroups(auth, groups)
        : null;
    const groupsById = new Map(groups.map((group) => [group.sId, group]));
    return ctx.json({
      groups: serializedGroups.map((serialized) => {
        const group = groupsById.get(serialized.sId);
        assert(group);
        return {
          ...serialized,
          ...(managersByGroup && {
            managers: (managersByGroup.get(serialized.sId) ?? []).map(
              ({ sId, fullName, image }) => ({ sId, fullName, image })
            ),
          }),
          allowedActions: getGroupAllowedActions(
            auth,
            group,
            isGroupManagementEnabled
          ),
        };
      }),
    });
  }
);

/** @ignoreswagger */
app.post(
  "/",
  ensureIsManager(),
  validate("json", CreateGroupBodySchema),
  async (ctx): HandlerResult<PostGroupResponseBody> => {
    const auth = ctx.get("auth");
    const { name, memberIds, managerIds } = ctx.req.valid("json");

    if (
      managerIds?.length &&
      !(await auth.hasFeatureFlag("group_management"))
    ) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Group management is not enabled for this workspace.",
        },
      });
    }

    const groupRes = await createGroup(auth, {
      name,
      memberIds,
      managerIds,
    });
    if (groupRes.isErr()) {
      switch (groupRes.error.code) {
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: groupRes.error.message,
            },
          });
        case "name_conflict":
          return apiError(ctx, {
            status_code: 409,
            api_error: {
              type: "invalid_request_error",
              message: groupRes.error.message,
            },
          });
        case "user_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "user_not_found",
              message: groupRes.error.message,
            },
          });
        case "user_already_member":
        case "group_requirements_not_met":
        case "system_or_global_group":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: groupRes.error.message,
            },
          });
        default:
          assertNever(groupRes.error.code);
      }
    }
    const { group, addedUsers, addedManagers } = groupRes.value;

    emitGroupMemberAuditLogs(auth, group, { addedUsers, removedUsers: [] });
    emitGroupManagerAuditLog(auth, group, {
      addedUsers: addedManagers,
      removedUsers: [],
    });

    return ctx.json({ group: await group.toJSONWithMemberCount(auth) });
  }
);

app.route("/shared_usage_limit_priorities", sharedUsageLimitPriorities);
app.route("/:groupId/spend_limit", spendLimit);
app.route("/:groupId/shared_usage_limit", sharedUsageLimit);
app.route("/:groupId/granted_role", grantedRole);
app.route("/:groupId/granted_seat_type", grantedSeatType);
app.route("/:groupId", groupDetail);

export default app;
