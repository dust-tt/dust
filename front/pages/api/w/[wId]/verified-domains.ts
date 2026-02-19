import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { WorkspaceDomain } from "@app/types/workspace";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetWorkspaceVerifiedDomainsResponseBody = {
  verifiedDomains: WorkspaceDomain[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetWorkspaceVerifiedDomainsResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  }

  const workspace = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "GET": {
      const workspaceResource = await WorkspaceResource.fetchById(
        workspace.sId
      );

      if (!workspaceResource) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to fetch the workspace.",
          },
        });
      }

      const verifiedDomains = await workspaceResource.getVerifiedDomains();
      return res.status(200).json({ verifiedDomains });
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
