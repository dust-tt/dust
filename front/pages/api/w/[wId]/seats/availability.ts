import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { checkWorkspaceSeatAvailabilityUsingAuth } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetSeatAvailabilityResponseBody = {
  hasAvailableSeats: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetSeatAvailabilityResponseBody>>,
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

  switch (req.method) {
    case "GET": {
      const hasAvailableSeats =
        await checkWorkspaceSeatAvailabilityUsingAuth(auth);
      return res.status(200).json({ hasAvailableSeats });
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
