import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { withSpace } from "@front-api/middlewares/with_space";

// Mounted under /api/w/:wId/spaces/:spaceId/leave.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx) => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    const result = await space.leave(auth);
    if (result.isErr()) {
      switch (result.error.code) {
        case "invalid_request_error":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: result.error.message,
            },
          });
        case "user_not_member":
        case "group_requirements_not_met":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: result.error.message,
            },
          });
        case "unauthorized":
        case "user_not_found":
        case "system_or_global_group":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: result.error.message,
            },
          });
        default:
          assertNever(result.error.code);
      }
    }

    void emitAuditLogEvent({
      auth,
      action: "project.left",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("space", space),
      ],
      context: getAuditLogContext(auth),
      metadata: { space_name: space.name },
    });

    return ctx.json({ success: true });
  }
);

export default app;
