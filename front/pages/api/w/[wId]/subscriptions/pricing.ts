import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { SubscriptionPerSeatPricing } from "@app/types/plan";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetSubscriptionPricingResponseBody = {
  perSeatPricing: SubscriptionPerSeatPricing | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetSubscriptionPricingResponseBody>
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
      const subscriptionResource = auth.subscriptionResource();
      if (!subscriptionResource) {
        return res.status(200).json({ perSeatPricing: null });
      }

      const perSeatPricing = await subscriptionResource.getPerSeatPricing();
      return res.status(200).json({ perSeatPricing });
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
