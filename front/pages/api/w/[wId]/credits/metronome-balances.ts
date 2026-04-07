/** @ignoreswagger */

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { handleMetronomeBalancesRequest } from "@app/lib/api/credits/metronome_balances";
import type { Authenticator } from "@app/lib/auth";
import type { GetCreditsResponseBody } from "@app/types/credits";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetCreditsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  return handleMetronomeBalancesRequest(req, res, auth);
}

export default withSessionAuthenticationForWorkspace(handler);
