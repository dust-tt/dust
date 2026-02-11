import type { NextApiRequest, NextApiResponse } from "next";

import { getMessageUsageCount } from "@app/lib/api/assistant/rate_limits";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { isFreeTrialPhonePlan } from "@app/lib/plans/plan_codes";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";

export type GetSubscriptionStatusResponseBody = {
  shouldRedirect: boolean;
  redirectUrl: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetSubscriptionStatusResponseBody | void>
  >,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();

  // Only admins can be redirected to trial-ended page
  if (!auth.isAdmin()) {
    return res.status(200).json({ shouldRedirect: false, redirectUrl: null });
  }

  const subscription = auth.subscription();
  if (subscription && isFreeTrialPhonePlan(subscription.plan.code)) {
    // Active trial - check if messages are exhausted
    try {
      const { count, limit } = await getMessageUsageCount(auth);
      if (limit !== -1 && count >= limit) {
        return res.status(200).json({
          shouldRedirect: true,
          redirectUrl: `/w/${owner.sId}/trial-ended`,
        });
      }
    } catch {
      // If we can't check message usage, don't redirect
    }
  } else {
    // No active subscription or not a phone trial - check if last subscription was an ended phone trial
    const lastSubscription =
      await SubscriptionResource.fetchLastByWorkspace(owner);
    if (
      lastSubscription &&
      isFreeTrialPhonePlan(lastSubscription.getPlan().code) &&
      lastSubscription.toJSON().status === "ended"
    ) {
      return res.status(200).json({
        shouldRedirect: true,
        redirectUrl: `/w/${owner.sId}/trial-ended`,
      });
    }
  }

  return res.status(200).json({ shouldRedirect: false, redirectUrl: null });
}

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
