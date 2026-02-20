import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { generateWorkOSAdminPortalUrl } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

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

  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.workOSOrganizationId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workos_organization_not_found",
        message: "WorkOS organization not found for this workspace.",
      },
    });
  }

  const plan = auth.getNonNullablePlan();
  if (!plan.limits.users.isAuditLogsAllowed) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Your workspace is not authorized to perform this action.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const returnUrl = `${config.getAppUrl()}/w/${workspace.sId}/members`;

      const [viewLogsResult, configureExportResult] = await Promise.all([
        generateWorkOSAdminPortalUrl({
          organization: workspace.workOSOrganizationId,
          workOSIntent: WorkOSPortalIntent.AuditLogs,
          returnUrl,
        }),
        generateWorkOSAdminPortalUrl({
          organization: workspace.workOSOrganizationId,
          workOSIntent: WorkOSPortalIntent.LogStreams,
          returnUrl,
        }),
      ]);

      res.status(200).json({
        viewLogsLink: viewLogsResult.link,
        configureExportLink: configureExportResult.link,
      });
      return;

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
