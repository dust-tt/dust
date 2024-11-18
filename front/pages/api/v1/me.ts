import type { MeResponseType } from "@dust-tt/client";
import type {
  UserTypeWithWorkspaces,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withAuth0TokenAuthentication } from "@app/lib/api/wrappers";
import { apiError } from "@app/logger/withlogging";

/**
 * @ignoreswagger
 * WIP, undocumented.
 * TODO(EXT): Document this endpoint.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<MeResponseType>>,
  user: UserTypeWithWorkspaces
): Promise<void> {
  switch (req.method) {
    case "GET":
      return res.status(200).json({ user });

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

export default withAuth0TokenAuthentication(handler, {
  requiredScopes: { GET: "read:user_profile" },
});
