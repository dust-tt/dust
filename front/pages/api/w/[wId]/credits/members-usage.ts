/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { GetMembersUsageResponseBody } from "@app/lib/api/credits/members_usage";
import { handleGetMembersUsageRequest } from "@app/lib/api/credits/members_usage";
import type { Authenticator } from "@app/lib/auth";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMembersUsageResponseBody>>,
  auth: Authenticator
): Promise<void> {
  return handleGetMembersUsageRequest(req, res, auth);
}

export default withSessionAuthenticationForWorkspace(handler);
