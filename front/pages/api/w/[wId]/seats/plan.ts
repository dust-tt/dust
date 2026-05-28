// @migration-status: MIGRATED_TO_HONO

/** @ignoreswagger */

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type {
  SeatPlanError,
  SeatPlanResponseBody,
} from "@app/lib/api/credits/seat_plan";
import { getSeatPlan } from "@app/lib/api/credits/seat_plan";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";

function seatPlanErrorToApi(
  req: NextApiRequest,
  res: NextApiResponse,
  err: SeatPlanError
) {
  switch (err.type) {
    case "not_configured":
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "internal_server_error",
          message: "Workspace is not configured for Metronome billing.",
        },
      });
    case "currency_resolution_failed":
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to resolve currency for seat plan.",
        },
      });
    case "rate_schedule_fetch_failed":
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to fetch rate schedule for seat products.",
        },
      });
    default:
      assertNever(err.type);
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SeatPlanResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only GET is supported.",
      },
    });
  }

  const result = await getSeatPlan(auth);
  if (result.isErr()) {
    return seatPlanErrorToApi(req, res, result.error);
  }
  return res.status(200).json(result.value);
}

export default withSessionAuthenticationForWorkspace(handler);
