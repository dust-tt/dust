// @migration-status: MIGRATED_TO_HONO

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
  // Seat plan behavior lives in the shared handler so this legacy route stays
  // aligned with the Hono route while migration is in progress.
  return handleSeatPlanRequest(req, res, auth);
}

export default withSessionAuthenticationForWorkspace(handler);
