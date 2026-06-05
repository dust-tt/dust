// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { CheckoutPayment } from "@app/lib/credits/checkout_payment_status";
import { getCheckoutPaymentStatus } from "@app/lib/credits/checkout_payment_status";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetCheckoutPaymentStatusResponseBody = {
  checkoutPayment: CheckoutPayment | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetCheckoutPaymentStatusResponseBody>
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

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can check checkout payment status.",
      },
    });
  }

  const { contract_id } = req.query;
  if (!isString(contract_id) || contract_id === "") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing required query parameter: contract_id.",
      },
    });
  }

  const checkoutPayment = await getCheckoutPaymentStatus({
    workspaceId: auth.getNonNullableWorkspace().sId,
    contractId: contract_id,
  });

  return res.status(200).json({ checkoutPayment });
}

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
