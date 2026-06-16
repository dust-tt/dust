import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { updateMembershipRoleAndTrack } from "@app/lib/api/membership";
import { getUserForWorkspace } from "@app/lib/api/user";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { ACTIVE_ROLES } from "@app/types/user";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { SuccessResponseBody } from "@front-api/routes/types";
import { z } from "zod";

const PostRoleUserBodySchema = z.object({
  userId: z.string(),
  role: z.enum(ACTIVE_ROLES),
});

// Mounted at /api/poke/workspaces/:wId/roles.
const app = pokeApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostRoleUserBodySchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();
    const { userId, role } = ctx.req.valid("json");

    const user = await getUserForWorkspace(auth, { userId });
    if (!user) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "user_not_found",
          message: "Could not find the user.",
        },
      });
    }

    const updateRes = await updateMembershipRoleAndTrack({
      user,
      workspace: owner,
      newRole: role,
      allowTerminated: true,
      author: auth.user()?.toJSON() ?? "no-author",
    });

    if (updateRes.isErr()) {
      switch (updateRes.error.type) {
        case "not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "workspace_user_not_found",
              message: "Could not find the membership.",
            },
          });
        case "membership_already_terminated":
          // This cannot happen because we allow updating terminated memberships
          // by setting `allowTerminated` to true.
          throw new Error("Unreachable.");
        case "already_on_role":
          // Should not happen, but we ignore.
          break;
        case "last_admin":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Cannot remove the last admin of a workspace.",
            },
          });
        default:
          assertNever(updateRes.error.type);
      }
    }

    if (updateRes.isOk()) {
      void emitAuditLogEvent({
        auth,
        action: "membership.role_updated",
        targets: [
          buildAuditLogTarget("workspace", owner),
          buildAuditLogTarget("user", {
            sId: user.sId,
            name: user.fullName() ?? "unknown",
          }),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          previous_role: updateRes.value.previousRole,
          new_role: updateRes.value.newRole,
        },
      });
    }

    return ctx.json({ success: true });
  }
);

export default app;
