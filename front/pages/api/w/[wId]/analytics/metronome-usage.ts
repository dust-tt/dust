/** @ignoreswagger */
import type { GetMetronomeUsageResponse } from "@app/lib/api/analytics/metronome_usage";
import { handleMetronomeUsageRequest } from "@app/lib/api/analytics/metronome_usage";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMetronomeUsageResponse>>,
  auth: Authenticator
): Promise<void> {
  return handleMetronomeUsageRequest(req, res, auth);
}

export default withSessionAuthenticationForWorkspace(handler);
