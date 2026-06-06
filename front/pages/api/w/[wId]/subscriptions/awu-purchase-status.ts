// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { GetAwuPurchaseStatusResponseBody } from "@app/lib/credits/awu_purchase_status";
import { getAwuPurchaseAttempt } from "@app/lib/credits/awu_purchase_status";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetAwuPurchaseStatusResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can check AWU purchase status.",
      },
    });
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported.",
      },
    });
  }

  const attempt = await getAwuPurchaseAttempt(
    auth.getNonNullableWorkspace().sId
  );
  return res.status(200).json({ attempt });
}

export default withSessionAuthenticationForWorkspace(handler);
