import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getPersistedNavigationSelection } from "@app/lib/persisted_navigation_selection";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetLastViewedSpaceResponseBody =
  | {
      success: true;
      lastSpaceId: string;
    }
  | {
      success: false;
    };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetLastViewedSpaceResponseBody>>,
  auth: Authenticator
) {
  const { method } = req;

  switch (method) {
    case "GET": {
      const selection = await getPersistedNavigationSelection(
        auth.getNonNullableUser()
      );
      if (selection.lastSpaceId) {
        return res.status(200).json({
          success: true,
          lastSpaceId: selection.lastSpaceId,
        });
      }
      return res.status(200).json({
        success: false,
      });
    }
    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
