// @migration-status: MIGRATED_TO_HONO

/** @ignoreswagger */

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  getMetronomeBalances,
  getMetronomeBalancesApiError,
} from "@app/lib/api/credits/metronome_balances";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { GetCreditsResponseBody } from "@app/types/credits";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetCreditsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can view credits.",
      },
    });
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const result = await getMetronomeBalances(auth);
  if (result.isErr()) {
    return apiError(req, res, getMetronomeBalancesApiError(result.error));
  }

  return res.status(200).json(result.value);
}

export default withSessionAuthenticationForWorkspace(handler);
