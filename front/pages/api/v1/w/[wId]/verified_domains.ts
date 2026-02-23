import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { GetWorkspaceVerifiedDomainsResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetWorkspaceVerifiedDomainsResponseType>
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isSystemKey()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const workspace = auth.getNonNullableWorkspace();
      const workspaceResource = await WorkspaceResource.fetchById(
        workspace.sId
      );

      if (!workspaceResource) {
        // This should not happen as the workspace is fetched from the auth.
        // Clearly something is wrong if we reach this point, so we log a 500 error.
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to fetch the workspace.",
          },
        });
      }

      const verifiedDomains = await workspaceResource.getVerifiedDomains();

      return res.status(200).json({ verified_domains: verifiedDomains });

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

export default withPublicAPIAuthentication(handler);
