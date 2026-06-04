/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import type {
  AwuPoolSummaryError,
  AwuPoolSummaryResponseBody,
} from "@app/lib/api/credits/awu_pool_summary";
import { getAwuPoolSummary } from "@app/lib/api/credits/awu_pool_summary";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

function summaryErrorToApi(
  req: NextApiRequest,
  res: NextApiResponse,
  err: AwuPoolSummaryError
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
    case "invoices_fetch_failed":
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve Metronome invoices: ${err.cause?.message ?? ""}`,
        },
      });
    default:
      assertNever(err.type);
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<AwuPoolSummaryResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const { wId } = req.query;
  if (!isString(wId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to access was not found.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);

  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Could not find the workspace.",
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

  const result = await getAwuPoolSummary(auth);
  if (result.isErr()) {
    return summaryErrorToApi(req, res, result.error);
  }
  return res.status(200).json(result.value);
}

export default withSessionAuthenticationForPoke(handler);
