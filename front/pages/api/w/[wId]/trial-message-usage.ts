import type { NextApiRequest, NextApiResponse } from "next";

import { getMessageUsageCount } from "@app/lib/api/assistant/rate_limits";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetTrialMessageUsageResponseType = {
  count: number;
  limit: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetTrialMessageUsageResponseType>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      const usage = await getMessageUsageCount(auth);
      return res.status(200).json(usage);

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

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
