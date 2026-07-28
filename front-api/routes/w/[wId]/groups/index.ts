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

export type GetGroupsResponseBody = {
  groups: (GroupType & {
    memberCount: number;
    poolCapAwuCredits: number | null;
  })[];
};

const GetGroupsQuerySchema = z.object({
  kind: z.union([GroupKindCodec, z.array(GroupKindCodec)]).optional(),
  spaceId: z.string().optional(),
});

// Mounted at /api/w/:wId/groups.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", GetGroupsQuerySchema),
  async (ctx): HandlerResult<GetGroupsResponseBody> => {
    const auth = ctx.get("auth");
    const { kind, spaceId } = ctx.req.valid("query");

    const groupKinds: GroupKind[] = kind
      ? Array.isArray(kind)
        ? kind
        : [kind]
      : ["global", "regular_auto", "space_editors"];

    const groups: GroupResource[] = spaceId
      ? await GroupResource.listForSpaceById(auth, spaceId, { groupKinds })
      : await GroupResource.listAllWorkspaceGroups(auth, { groupKinds });

    const memberCounts = await GroupResource.getMemberCountsForGroups(
      auth,
      groups
    );
    const poolCaps = await GroupResource.getPoolCapAwuCreditsForGroups(
      auth,
      groups
    );

    const groupsWithMemberCount = groups.map((group) => ({
      ...group.toJSON(),
      memberCount: memberCounts.get(group.id) ?? 0,
      poolCapAwuCredits: poolCaps.get(group.id) ?? null,
    }));

    return ctx.json({ groups: groupsWithMemberCount });
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
    const group = await groupRes.value.toJSONWithMemberCount(auth);

    return ctx.json({ group });
  }
);

app.route("/:groupId/spend_limit", spendLimit);
app.route("/:groupId", groupDetail);

export default app;
