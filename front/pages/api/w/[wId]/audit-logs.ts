/** @ignoreswagger */
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
  isAuditLogsEnabled,
} from "@app/lib/api/audit/workos_audit";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { generateWorkOSAdminPortalUrl } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type AuditLogsPortal = "view_logs" | "configure_export";

export type AuditLogsPortalResponse = {
  portalUrl: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<AuditLogsPortalResponse>>,
  auth: Authenticator
) {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "You are not authorized to perform this action.",
      },
    });
  }

  if (!(await isAuditLogsEnabled(auth))) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Audit logs are not enabled for this workspace.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();
  if (!owner.workOSOrganizationId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workos_organization_not_found",
        message: "WorkOS organization not found for this workspace.",
      },
    });
  }

  switch (req.method) {
    // Generates a WorkOS portal URL on click and emits an audit event.
    // WorkOS portal links are org-scoped (not user-scoped), so this is the
    // only place we can attribute portal access to a specific admin.
    case "POST": {
      const { portal } = req.body;

      if (!portal || typeof portal !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Missing or invalid portal parameter.",
          },
        });
      }

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
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Invalid portal. Must be 'view_logs' or 'configure_export'.",
            },
          });
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
        context: getAuditLogContext(auth, req),
      });

      return res.status(200).json({ portalUrl: result.link });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
