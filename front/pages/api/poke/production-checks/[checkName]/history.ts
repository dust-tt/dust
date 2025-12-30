import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import {
  getCheckHistoryRuns,
  getRegisteredCheck,
} from "@app/lib/api/poke/production_checks";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { CheckHistoryRun, WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

export type GetCheckHistoryResponseBody = {
  runs: CheckHistoryRun[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetCheckHistoryResponseBody>>,
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

  const { checkName } = req.query;

  if (!isString(checkName)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "checkName is required.",
      },
    });
  }

  const registeredCheck = getRegisteredCheck(checkName);
  if (!registeredCheck) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "action_not_found",
        message: `Check "${checkName}" not found.`,
      },
    });
  }

  const runs = await getCheckHistoryRuns(checkName);

  return res.status(200).json({ runs });
}

export default withSessionAuthenticationForPoke(handler);
