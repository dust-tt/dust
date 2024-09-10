import type { WithAPIErrorResponse, WorkspaceDomain } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getWorkspaceVerifiedDomain } from "@app/lib/api/workspace";
import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

export type ListMemberEmailsResponseBody = {
  verified_domains: WorkspaceDomain[];
};

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ListMemberEmailsResponseBody>>,
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
      const verifiedDomain = await getWorkspaceVerifiedDomain(
        auth.getNonNullableWorkspace()
      );

      return res
        .status(200)
        .json({ verified_domains: verifiedDomain ? [verifiedDomain] : [] });

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
