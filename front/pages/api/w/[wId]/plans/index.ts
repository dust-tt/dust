import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";
import { PlanType } from "@app/types/user";

export type GetSubscriptionResponseBody = {
  plan: PlanType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetSubscriptionResponseBody>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const plan = auth.plan();
  if (!owner || !plan) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can see featured plans.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      // Should return the list of featured plans
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message: "Not implemented yet.",
        },
      });

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

export default withLogging(handler);
