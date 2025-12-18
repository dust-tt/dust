import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getInvoicePaymentUrl } from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type {
  CreditDisplayData,
  GetCreditsResponseBody,
  PendingCreditData,
} from "@app/types/credits";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetCreditsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  // Only admins can view credits.
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can view credits.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      // Fetch all credits for the workspace.
      const credits = await CreditResource.listAll(auth, {
        includeBuyer: true,
      });

      // Transform started credits to display format with computed consumed amount.
      const creditsData: CreditDisplayData[] = credits
        .filter((credit) => credit.startDate !== null)
        .map((credit) => credit.toJSON());

      // Find pending committed credits (not yet started, awaiting payment).
      const pendingCommittedCredits = credits.filter(
        (credit) =>
          credit.startDate === null &&
          credit.type === "committed" &&
          credit.invoiceOrLineItemId !== null
      );

      // Fetch payment URLs for pending credits.
      const pendingCreditsData: PendingCreditData[] = await concurrentExecutor(
        pendingCommittedCredits,
        async (credit) => {
          const paymentUrl = credit.invoiceOrLineItemId
            ? await getInvoicePaymentUrl(credit.invoiceOrLineItemId)
            : null;
          return {
            sId: credit.sId,
            type: credit.type,
            initialAmountMicroUsd: credit.initialAmountMicroUsd,
            paymentUrl,
            createdAt: credit.createdAt.getTime(),
          };
        },
        { concurrency: 8 }
      );

      return res.status(200).json({
        credits: creditsData,
        pendingCredits:
          pendingCreditsData.length > 0 ? pendingCreditsData : undefined,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
