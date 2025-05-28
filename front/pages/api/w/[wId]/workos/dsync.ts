import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getWorkOS } from "@app/lib/api/workos/client";
import type { Authenticator } from "@app/lib/auth";
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
  let directories;

  try {
    const { data } = await workOS.directorySync.listDirectories({
      organizationId: workspace.workOSOrganizationId,
    });
    directories = data;
  } catch (error) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "workos_server_error",
        message: `Failed to list directories: ${normalizeError(error).message}`,
      },
    });
  }

  console.log("WorkOS Directory Sync directories:", directories);

  if (directories.length > 1) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workos_multiple_directories_not_supported",
        message:
          "You cannot have multiple directories configured for WorkOS Directory Sync.",
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
      : undefined,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
