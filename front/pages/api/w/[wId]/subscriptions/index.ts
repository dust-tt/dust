import { PlanType } from "@dust-tt/types";
import { ReturnedAPIErrorType } from "@dust-tt/types";
import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import {
  downgradeWorkspaceToFreePlan,
  getCheckoutUrlForUpgrade,
} from "@app/lib/plans/subscription";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

export type PostSubscriptionResponseBody = {
  plan: PlanType;
  checkoutUrl?: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostSubscriptionResponseBody | ReturnedAPIErrorType>
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
          "Only users that are `admins` for the current workspace can see memberships or modify it.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      try {
        const { checkoutUrl, plan: newPlan } = await getCheckoutUrlForUpgrade(
          auth
        );
        return res.status(200).json({ checkoutUrl, plan: newPlan });
      } catch (error) {
        logger.error({ error }, "Error while subscribing workspace to plan");
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Error while subscribing workspace to plan",
          },
        });
      }
      break;
    case "DELETE":
      try {
        const newPlan = await downgradeWorkspaceToFreePlan(auth);
        return res.status(200).json({ plan: newPlan });
      } catch (error) {
        logger.error(
          { error },
          "Error while downgrading workspace to free plan"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Error while downgrading workspace to free plan",
          },
        });
      }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
