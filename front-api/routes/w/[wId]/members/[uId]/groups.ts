import type { GroupMembershipError } from "@app/lib/api/groups/members";
import {
  getMemberGroups,
  updateMemberGroupMembership,
} from "@app/lib/api/groups/members";
import { GroupResource } from "@app/lib/resources/group_resource";
import type {
  DeleteMemberGroupResponseBody,
  GetMemberGroupsResponseBody,
  PostMemberGroupResponseBody,
} from "@app/types/api/groups/manage";
import { PostMemberGroupBodySchema } from "@app/types/api/groups/manage";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  uId: z.string(),
});

const GroupParamsSchema = z.object({
  uId: z.string(),
  groupId: z.string(),
});

function toApiError(
  err: GroupMembershipError
): APIErrorWithContentfulStatusCode {
  switch (err.type) {
    case "unauthorized":
      return {
        status_code: 403,
        api_error: { type: "workspace_auth_error", message: err.message },
      };
    case "user_not_found":
      return {
        status_code: 404,
        api_error: { type: "workspace_user_not_found", message: err.message },
      };
    case "group_not_found":
      return {
        status_code: 404,
        api_error: { type: "group_not_found", message: err.message },
      };
    case "group_requirements_not_met":
    case "invalid_group_id":
    case "system_or_global_group":
    case "user_already_member":
    case "user_not_member":
      return {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: err.message },
      };
    default:
      assertNever(err.type);
  }
}

// Mounted at /api/w/:wId/members/:uId/groups.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsManager(),
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetMemberGroupsResponseBody> => {
    const auth = ctx.get("auth");
    const { uId } = ctx.req.valid("param");

    const res = await getMemberGroups(auth, { userId: uId });
    if (res.isErr()) {
      return apiError(ctx, toApiError(res.error));
    }

    return ctx.json({
      groups: await GroupResource.toJSONWithMemberCounts(auth, res.value),
    });
  }
);

/** @ignoreswagger */
app.post(
  "/",
  ensureIsManager(),
  validate("param", ParamsSchema),
  validate("json", PostMemberGroupBodySchema),
  async (ctx): HandlerResult<PostMemberGroupResponseBody> => {
    const auth = ctx.get("auth");
    const { uId } = ctx.req.valid("param");
    const { groupId } = ctx.req.valid("json");

    const res = await updateMemberGroupMembership(auth, {
      groupId,
      userId: uId,
      direction: "add",
    });
    if (res.isErr()) {
      return apiError(ctx, toApiError(res.error));
    }

    return ctx.json({ group: await res.value.toJSONWithMemberCount(auth) });
  }
);

/** @ignoreswagger */
app.delete(
  "/:groupId",
  ensureIsManager(),
  validate("param", GroupParamsSchema),
  async (ctx): HandlerResult<DeleteMemberGroupResponseBody> => {
    const auth = ctx.get("auth");
    const { uId, groupId } = ctx.req.valid("param");

    const res = await updateMemberGroupMembership(auth, {
      groupId,
      userId: uId,
      direction: "remove",
    });
    if (res.isErr()) {
      return apiError(ctx, toApiError(res.error));
    }

    return ctx.json({ success: true });
  }
);

export default app;
