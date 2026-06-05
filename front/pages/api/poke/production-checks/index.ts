/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import type { GetProductionChecksResponseBody } from "@app/lib/api/poke/production_checks";
import { getCheckSummaries } from "@app/lib/api/poke/production_checks";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type { GetProductionChecksResponseBody };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetProductionChecksResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
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

  const checks = await getCheckSummaries();

  return res.status(200).json({ checks });
}

export default withSessionAuthenticationForPoke(handler);
