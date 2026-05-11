/** @ignoreswagger */

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { AwuPoolSummaryResponseBody } from "@app/lib/api/credits/awu_pool_summary";
import { handleAwuPoolSummaryRequest } from "@app/lib/api/credits/awu_pool_summary";
import type { Authenticator } from "@app/lib/auth";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<AwuPoolSummaryResponseBody>>,
  auth: Authenticator
): Promise<void> {
  return handleAwuPoolSummaryRequest(req, res, auth);
}

export default withSessionAuthenticationForWorkspace(handler);
