import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";

export type GetSubscriptionTrialInfoResponseBody = {
  trialDaysRemaining: number | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetSubscriptionTrialInfoResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const subscription = auth.subscription();
      if (!subscription) {
        return res.status(200).json({ trialDaysRemaining: null });
      }

      let trialDaysRemaining: number | null = null;

      if (subscription.trialing && subscription.stripeSubscriptionId) {
        const stripeSubscription = await getStripeSubscription(
          subscription.stripeSubscriptionId
        );
        if (stripeSubscription && stripeSubscription.trial_end) {
          trialDaysRemaining = Math.ceil(
            (stripeSubscription.trial_end * 1000 - Date.now()) /
              (1000 * 60 * 60 * 24)
          );
        }
      }

      return res.status(200).json({ trialDaysRemaining });
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

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
