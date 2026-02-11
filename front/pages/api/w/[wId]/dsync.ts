import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  deleteWorkOSOrganizationDSyncConnection,
  generateWorkOSAdminPortalUrl,
  getWorkOSOrganizationDSyncDirectories,
} from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import type { WorkOSConnectionSyncStatus } from "@app/lib/types/workos";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { normalizeError } from "@app/types/shared/utils/error_utils";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<WorkOSConnectionSyncStatus>>,
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
  if (!plan.limits.users.isSCIMAllowed) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Your workspace is not authorized to perform this action.",
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

  const [activeDirectory] = directories;

  switch (req.method) {
    case "GET":
      let status: WorkOSConnectionSyncStatus["status"] = "not_configured";

      if (activeDirectory) {
        status =
          activeDirectory.state === "active" ? "configured" : "configuring";
      }

      const { link } = await generateWorkOSAdminPortalUrl({
        organization: workspace.workOSOrganizationId,
        workOSIntent: WorkOSPortalIntent.DSync,
        returnUrl: `${req.headers.origin}/w/${auth.getNonNullableWorkspace().sId}/members`,
      });

      res.status(200).json({
        status,
        connection: activeDirectory
          ? {
              id: activeDirectory.id,
              state: activeDirectory.state,
              type: activeDirectory.type,
            }
          : null,
        setupLink: link,
      });

      return;

    case "DELETE":
      const r = await deleteWorkOSOrganizationDSyncConnection(activeDirectory);

      if (r.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "workos_server_error",
            message: `Failed to delete SSO connection: ${normalizeError(r.error).message}`,
          },
        });
      }

      res.status(204).end();
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
