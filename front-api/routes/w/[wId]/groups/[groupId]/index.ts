import { GroupResource } from "@app/lib/resources/group_resource";
import type { GetGroupResponseBody } from "@app/types/api/groups/manage";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsBusinessAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  groupId: z.string(),
});

// Mounted at /api/w/:wId/groups/:groupId.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsBusinessAdmin(),
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

    // This management API only surfaces manually-managed groups.
    if (!group.isRegularManual()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "group_not_found",
          message: "Group not found.",
        },
      });
    }

    const members = await group.getActiveMembers(auth);

    return ctx.json({
      group: group.toJSON(),
      members: members.map((member) => member.toJSON()),
    });
  }
);

export default app;
