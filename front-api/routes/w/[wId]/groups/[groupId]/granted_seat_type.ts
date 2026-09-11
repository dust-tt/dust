import { hasFeatureFlag } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { PutGroupGrantedSeatTypeResponseBody } from "@app/types/api/groups/manage";
import { PutGroupGrantedSeatTypeBodySchema } from "@app/types/api/groups/manage";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  groupId: z.string(),
});

// Mounted at /api/w/:wId/groups/:groupId/granted_seat_type.
const app = workspaceApp();

// Maps a group to a base billable seat type (workspace/pro/max) so its members
// inherit that seat, or clears the mapping with `grantedSeatType: null`. Admin
// only.
/** @ignoreswagger */
app.put(
  "/",
  validate("param", ParamsSchema),
  ensureIsAdmin(),
  validate("json", PutGroupGrantedSeatTypeBodySchema),
  async (ctx): HandlerResult<PutGroupGrantedSeatTypeResponseBody> => {
    const auth = ctx.get("auth");

    if (!(await hasFeatureFlag(auth, "group_seat_provisioning"))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "The group_seat_provisioning feature is not enabled.",
        },
      });
    }

    const { groupId } = ctx.req.valid("param");
    const { grantedSeatType } = ctx.req.valid("json");

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

    const setRes = await group.setGrantedSeatType(auth, grantedSeatType);
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

    return ctx.json({
      group: await group.toJSONWithMemberCount(auth),
    });
  }
);

export default app;
