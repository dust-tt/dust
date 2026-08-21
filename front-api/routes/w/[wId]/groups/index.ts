import { emitGroupMemberAuditLogs } from "@app/lib/api/groups/audit";
import { GroupResource } from "@app/lib/resources/group_resource";
import {
  CreateGroupBodySchema,
  type PostGroupResponseBody,
} from "@app/types/api/groups/manage";
import type { GroupKind, GroupType } from "@app/types/groups";
import { GroupKindCodec } from "@app/types/groups";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import groupDetail from "./[groupId]";
import spendLimit from "./[groupId]/spend_limit";
import workflowAlertThreshold from "./[groupId]/workflow_alert_threshold";

export type GetGroupsResponseBody = {
  groups: (GroupType & { memberCount: number })[];
};

const GetGroupsQuerySchema = z.object({
  kind: z.union([GroupKindCodec, z.array(GroupKindCodec)]).optional(),
  spaceId: z.string().optional(),
  // When "true", each group also carries its member sIds (one extra batched
  // query) instead of just memberCount.
  withMembers: z.enum(["true", "false"]).optional(),
});

// Mounted at /api/w/:wId/groups.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", GetGroupsQuerySchema),
  async (ctx): HandlerResult<GetGroupsResponseBody> => {
    const auth = ctx.get("auth");
    const { kind, spaceId, withMembers } = ctx.req.valid("query");

    const groupKinds: GroupKind[] = kind
      ? Array.isArray(kind)
        ? kind
        : [kind]
      : ["global", "regular_auto"];

    const groups: GroupResource[] = spaceId
      ? await GroupResource.listForSpaceById(auth, spaceId, { groupKinds })
      : await GroupResource.listAllWorkspaceGroups(auth, { groupKinds });

    return ctx.json({
      groups:
        withMembers === "true"
          ? await GroupResource.fetchJSONWithMembers(auth, groups)
          : await GroupResource.toJSONWithMemberCounts(auth, groups),
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
    const { name, memberIds } = ctx.req.valid("json");

    const groupRes = await GroupResource.makeNewRegularManual(auth, {
      name,
      memberIds,
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
    const { group, addedUsers } = groupRes.value;

    emitGroupMemberAuditLogs(auth, group, { addedUsers, removedUsers: [] });

    return ctx.json({ group: await group.toJSONWithMemberCount(auth) });
  }
);

app.route("/:groupId/spend_limit", spendLimit);
app.route("/:groupId/workflow_alert_threshold", workflowAlertThreshold);
app.route("/:groupId", groupDetail);

export default app;
