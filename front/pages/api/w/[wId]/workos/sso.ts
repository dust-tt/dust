import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getWorkOS } from "@app/lib/api/workos/client";
import type { Authenticator } from "@app/lib/auth";
import type { WorkOSConnectionSyncStatus } from "@app/lib/types/workos";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export default withSessionAuthenticationForWorkspace(async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<WorkOSConnectionSyncStatus>>,
  auth: Authenticator
) {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported.",
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

  const workOS = getWorkOS();
  let ssoConnections;

  try {
    const { data } = await workOS.sso.listConnections({
      organizationId: workspace.workOSOrganizationId,
    });
    ssoConnections = data;
  } catch (error) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "workos_server_error",
        message: `Failed to list SSO connections: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    });
  }

  if (ssoConnections.length > 1) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workos_multiple_sso_connections_not_supported",
        message: "Multiple SSO connections are not supported.",
      },
    });
  }

  const connection = ssoConnections[0];
  let status: WorkOSConnectionSyncStatus["status"] = "not_configured";

  if (connection) {
    status = connection.state === "active" ? "configured" : "configuring";
  }

  return res.status(200).json({
    status,
    connection: connection
      ? {
          id: connection.id,
          state: connection.state,
          type: connection.type,
        }
      : undefined,
  });
});
