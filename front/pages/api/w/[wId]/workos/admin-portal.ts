import { GeneratePortalLinkIntent } from "@workos-inc/node";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getWorkOS } from "@app/lib/api/workos";
import type { Authenticator } from "@app/lib/auth";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const INTENT_MAP: Record<WorkOSPortalIntent, GeneratePortalLinkIntent> = {
  [WorkOSPortalIntent.SSO]: GeneratePortalLinkIntent.SSO,
  [WorkOSPortalIntent.DSync]: GeneratePortalLinkIntent.DSync,
  [WorkOSPortalIntent.DomainVerification]:
    GeneratePortalLinkIntent.DomainVerification,
  [WorkOSPortalIntent.AuditLogs]: GeneratePortalLinkIntent.AuditLogs,
  [WorkOSPortalIntent.LogStreams]: GeneratePortalLinkIntent.LogStreams,
  [WorkOSPortalIntent.CertificateRenewal]:
    GeneratePortalLinkIntent.CertificateRenewal,
};

const WorkOSAdminPortalQuerySchema = t.type({
  intent: t.union([
    t.literal(WorkOSPortalIntent.SSO),
    t.literal(WorkOSPortalIntent.DSync),
    t.literal(WorkOSPortalIntent.DomainVerification),
    t.literal(WorkOSPortalIntent.AuditLogs),
    t.literal(WorkOSPortalIntent.LogStreams),
    t.literal(WorkOSPortalIntent.CertificateRenewal),
  ]),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<{ url: string }>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access the WorkOS admin portal.",
      },
    });
  }

  if (!owner.workOSOrganizationId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "No WorkOS organization is set up for this workspace.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      try {
        const result = WorkOSAdminPortalQuerySchema.decode(req.query);
        if (isLeft(result)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: reporter.formatValidationErrors(result.left).join(", "),
            },
          });
        }

        const { intent } = result.right;
        const workos = getWorkOS();
        const { link } = await workos.portal.generateLink({
          intent: INTENT_MAP[intent],
          organization: owner.workOSOrganizationId,
          returnUrl: `${req.headers.origin}/w/${owner.sId}/members`,
        });

        res.status(200).json({ url: link });
        return;
      } catch (error) {
        console.error("Failed to generate WorkOS admin portal URL:", error);
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to generate WorkOS admin portal URL",
          },
        });
      }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
