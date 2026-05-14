/** @ignoreswagger */

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { AwuPoolSummaryResponseBody } from "@app/lib/api/credits/awu_pool_summary";
import { getAwuPoolSummary } from "@app/lib/api/credits/awu_pool_summary";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<AwuPoolSummaryResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const result = await getAwuPoolSummary(auth);
  if (result.isErr()) {
    return apiError(req, res, {
      status_code: result.error.status,
      api_error: result.error.error,
    });
  }

  res.status(200).json(result.value);
}

export default withSessionAuthenticationForWorkspace(handler);
