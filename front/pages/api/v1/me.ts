import { withTokenAuthentication } from "@app/lib/api/auth_wrappers";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { UserTypeWithWorkspaces } from "@app/types/user";
import type { MeResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

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

export default withTokenAuthentication(handler);
