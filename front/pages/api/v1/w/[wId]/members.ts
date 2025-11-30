import type {
  GetWorkspaceMembersResponseBody,
  UserType,
} from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

/**
 * @ignoreswagger
 * Admin-only endpoint. Undocumented.
 */
async function handler(
  req: NextApiRequest,
  // eslint-disable-next-line dust/enforce-client-types-in-public-api
  res: NextApiResponse<WithAPIErrorResponse<GetWorkspaceMembersResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only users that are `admins` can access this endpoint.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const { members: users } = await getMembers(auth, { activeOnly: true });

      res.status(200).json({
        users: users.map(
          (user): Pick<UserType, "sId" | "id" | "email"> => ({
            sId: user.sId,
            id: user.id,
            email: user.email,
          })
        ),
      });
      return;

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
