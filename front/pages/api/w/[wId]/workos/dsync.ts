import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getWorkOSOrganizationDSyncDirectories } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { WorkOSConnectionSyncStatus } from "@app/lib/types/workos";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { normalizeError } from "@app/types";

async function handler(
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

  const flags = await getFeatureFlags(workspace);
  if (!flags.includes("workos")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Your workspace is not authorized to perfom this action.",
      },
    });
  }

  const r = await getWorkOSOrganizationDSyncDirectories({
    workspace,
  });

  if (r.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "workos_server_error",
        message: `Failed to list directories: ${normalizeError(r.error).message}`,
      },
    });
  }
  const directories = r.value;

  if (directories.length > 1) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workos_multiple_directories_not_supported",
        message: "Multiple directories are not supported.",
      },
    });
  }

  const directory = directories[0];
  let status: WorkOSConnectionSyncStatus["status"] = "not_configured";

  if (directory) {
    status = directory.state === "active" ? "configured" : "configuring";
  }

  return res.status(200).json({
    status,
    connection: directory
      ? {
          id: directory.id,
          state: directory.state,
          type: directory.type,
        }
      : null,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
