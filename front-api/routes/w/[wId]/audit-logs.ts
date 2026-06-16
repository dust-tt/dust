import type { AuditLogsPortalResponse } from "@app/lib/api/audit/workos_audit";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
  isAuditLogsEnabled,
} from "@app/lib/api/audit/workos_audit";
import config from "@app/lib/api/config";
import { generateWorkOSAdminPortalUrl } from "@app/lib/api/workos/organization";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PostAuditLogsRequestBodySchema = z.object({
  portal: z.enum(["view_logs", "configure_export"]),
});

// Mounted at /api/w/:wId/audit-logs.
const app = workspaceApp();

// Generates a WorkOS portal URL on click and emits an audit event.
// WorkOS portal links are org-scoped (not user-scoped), so this is the
// only place we can attribute portal access to a specific admin.
/** @ignoreswagger */
app.post(
  "/",
  ensureIsAdmin(),
  validate("json", PostAuditLogsRequestBodySchema),
  async (ctx): HandlerResult<AuditLogsPortalResponse> => {
    const auth = ctx.get("auth");

    if (!(await isAuditLogsEnabled(auth))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Audit logs are not enabled for this workspace.",
        },
      });
    }

    const owner = auth.getNonNullableWorkspace();
    if (!owner.workOSOrganizationId) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workos_organization_not_found",
          message: "WorkOS organization not found for this workspace.",
        },
      });
    }

    const { portal } = ctx.req.valid("json");

    let workOSIntent: WorkOSPortalIntent;
    let action: "audit_log.viewed" | "audit_log.export_configured";

    switch (portal) {
      case "view_logs":
        workOSIntent = WorkOSPortalIntent.AuditLogs;
        action = "audit_log.viewed";
        break;
      case "configure_export":
        workOSIntent = WorkOSPortalIntent.LogStreams;
        action = "audit_log.export_configured";
        break;
      default:
        assertNever(portal);
    }

    const returnUrl = `${config.getAppUrl()}/w/${owner.sId}/members`;
    const result = await generateWorkOSAdminPortalUrl({
      organization: owner.workOSOrganizationId,
      workOSIntent,
      returnUrl,
    });

    void emitAuditLogEvent({
      auth,
      action,
      targets: [buildAuditLogTarget("workspace", owner)],
      context: getAuditLogContext(auth),
    });

    return ctx.json({ portalUrl: result.link });
  }
);

export default app;
