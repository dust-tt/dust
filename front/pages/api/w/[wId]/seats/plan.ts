/** @ignoreswagger */

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { SeatPlanResponseBody } from "@app/lib/api/credits/seat_plan";
import { handleSeatPlanRequest } from "@app/lib/api/credits/seat_plan";
import type { Authenticator } from "@app/lib/auth";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SeatPlanResponseBody>>,
  auth: Authenticator
): Promise<void> {
  return handleSeatPlanRequest(req, res, auth);
}

export default withSessionAuthenticationForWorkspace(handler);
