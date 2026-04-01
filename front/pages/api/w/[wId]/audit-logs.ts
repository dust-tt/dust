/** @ignoreswagger */
import {
  buildWorkspaceTarget,
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

export type AuditLogsSetupResponse = {
  viewLogsLink: string;
  configureExportLink: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<AuditLogsSetupResponse>>,
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
    case "GET": {
      const returnUrl = `${config.getAppUrl()}/w/${owner.sId}/members`;

      const [viewLogsResult, configureExportResult] = await Promise.all([
        generateWorkOSAdminPortalUrl({
          organization: owner.workOSOrganizationId,
          workOSIntent: WorkOSPortalIntent.AuditLogs,
          returnUrl,
        }),
        generateWorkOSAdminPortalUrl({
          organization: owner.workOSOrganizationId,
          workOSIntent: WorkOSPortalIntent.LogStreams,
          returnUrl,
        }),
      ]);

      return res.status(200).json({
        viewLogsLink: viewLogsResult.link,
        configureExportLink: configureExportResult.link,
      });
    }

    // Emit audit events on button click. WorkOS portal links are org-scoped
    // (not user-scoped), so this is the only place we can attribute portal
    // access to a specific admin.
    case "POST": {
      const { action } = req.body;
      const allowedActions = [
        "audit_log.viewed",
        "audit_log.export_configured",
      ] as const;

      if (!allowedActions.includes(action)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid action. Must be one of: ${allowedActions.join(", ")}`,
          },
        });
      }

      void emitAuditLogEvent({
        auth,
        action,
        targets: [buildWorkspaceTarget(owner)],
        context: getAuditLogContext(auth, req),
      });

      res.status(200).end();
      return;
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
