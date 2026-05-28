// @migration-status: MIGRATED_TO_HONO

/** @ignoreswagger */

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MetronomeBalancesError } from "@app/lib/api/credits/metronome_balances";
import { getMetronomeBalances } from "@app/lib/api/credits/metronome_balances";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { GetCreditsResponseBody } from "@app/types/credits";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";

function balancesErrorToApi(
  req: NextApiRequest,
  res: NextApiResponse,
  err: MetronomeBalancesError
) {
  switch (err.type) {
    case "not_configured":
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Workspace is not configured for Metronome billing.",
        },
      });
    case "balances_fetch_failed":
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve Metronome balances: ${err.cause?.message ?? ""}`,
        },
      });
    default:
      assertNever(err.type);
  }
}

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

  switch (req.method) {
    case "GET": {
      const result = await getMetronomeBalances(auth);
      if (result.isErr()) {
        return balancesErrorToApi(req, res, result.error);
      }
      return res.status(200).json(result.value);
    }
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

export default withSessionAuthenticationForWorkspace(handler);
