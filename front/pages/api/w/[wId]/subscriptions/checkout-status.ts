/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

type CheckoutStatus =
  | { status: "success" }
  | { status: "error"; message: string }
  | { status: "pending" };

export type GetCheckoutStatusResponseBody = CheckoutStatus;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetCheckoutStatusResponseBody>>,
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

  const { session_id, plan_code } = req.query;
  if (!isString(session_id)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid `session_id` query parameter.",
      },
    });
  }

  // New path (no plan_code): success is determined by metronomeContractId on the
  // active subscription, set atomically by the payment webhook handler.
  if (!isString(plan_code)) {
    const workspace = auth.getNonNullableWorkspace();
    const activeSubscription =
      await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
    if (activeSubscription?.metronomeContractId) {
      return res.status(200).json({ status: "success" });
    }
    return res.status(200).json({ status: "pending" });
  }

  // Legacy path (plan_code present): used by PaymentProcessingPage for the
  // existing Metronome setup checkout flow.
  const subscription = auth.subscription();
  if (subscription?.plan.code === plan_code) {
    return res.status(200).json({ status: "success" });
  }

  return res.status(200).json({ status: "pending" });
}

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
