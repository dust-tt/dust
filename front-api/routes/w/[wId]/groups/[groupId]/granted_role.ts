import { GroupResource } from "@app/lib/resources/group_resource";
import type { PutGroupGrantedRoleResponseBody } from "@app/types/api/groups/manage";
import { PutGroupGrantedRoleBodySchema } from "@app/types/api/groups/manage";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  groupId: z.string(),
});

// Mounted at /api/w/:wId/groups/:groupId/granted_role.
const app = workspaceApp();

// Maps a group to a workspace role (admin or manager) so its members inherit
// that role, or clears the mapping with `grantedRole: null`. Admin only.
/** @ignoreswagger */
app.put(
  "/",
  validate("param", ParamsSchema),
  ensureIsAdmin(),
  validate("json", PutGroupGrantedRoleBodySchema),
  async (ctx): HandlerResult<PutGroupGrantedRoleResponseBody> => {
    const auth = ctx.get("auth");
    const { groupId } = ctx.req.valid("param");
    const { grantedRole } = ctx.req.valid("json");

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

    const setRes = await group.setGrantedRole(auth, grantedRole);
    if (setRes.isErr()) {
      switch (setRes.error.code) {
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: setRes.error.message,
            },
          });
        case "invalid_group_kind":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: setRes.error.message,
            },
          });
        default:
          assertNever(setRes.error.code);
      }
    }

    const memberCount = await group.getMemberCount(auth);

    return ctx.json({
      group: { ...group.toJSON(), memberCount },
    });
  }
);

export default app;
