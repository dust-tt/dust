/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type {
  CreateCreditPurchaseError,
  CreatedCreditPurchase,
  CreditPurchaseInfo,
  CreditPurchaseInfoError,
} from "@app/lib/api/credits/purchase";
import {
  createCreditPurchase,
  getCreditPurchaseInfo,
} from "@app/lib/api/credits/purchase";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export const PostCreditPurchaseRequestBody = z.object({
  amountDollars: z.number().positive(),
});

type PostCreditPurchaseResponseBody = CreatedCreditPurchase & {
  success: true;
};

export type GetCreditPurchaseInfoResponseBody = CreditPurchaseInfo;

function infoErrorToApi(
  req: NextApiRequest,
  res: NextApiResponse,
  err: CreditPurchaseInfoError
) {
  switch (err.type) {
    case "subscription_not_found":
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "subscription_not_found",
          message:
            "No active subscription found. Please subscribe to a plan first.",
        },
      });
    case "internal":
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to resolve billing currency for this workspace.",
        },
      });
    default:
      assertNever(err.type);
  }
}

function purchaseErrorToApi(
  req: NextApiRequest,
  res: NextApiResponse,
  err: CreateCreditPurchaseError
) {
  switch (err.type) {
    case "subscription_not_found":
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "subscription_not_found",
          message: "[Credit Purchase] Stripe subscription not found.",
        },
      });
    case "purchase_not_allowed":
      return apiError(req, res, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            err.details.reason === "trialing"
              ? "Credit purchases are not available during trial. Please contact support."
              : "Credit purchases require an active subscription. Please ensure your payment method is up to date.",
        },
      });
    case "amount_exceeds_limit": {
      const maxDollars = (err.details.maxAmountMicroUsd ?? 0) / 1_000_000;
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Amount exceeds maximum allowed: $${maxDollars}. Please contact support for higher limits.`,
        },
      });
    }
    case "internal":
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to process credit purchase.",
        },
      });
    default:
      assertNever(err.type);
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      PostCreditPurchaseResponseBody | GetCreditPurchaseInfoResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access credit purchases.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const infoRes = await getCreditPurchaseInfo(auth);
      if (infoRes.isErr()) {
        return infoErrorToApi(req, res, infoRes.error);
      }
      return res.status(200).json(infoRes.value);
    }

    case "POST": {
      const bodyValidation = PostCreditPurchaseRequestBody.safeParse(req.body);
      if (!bodyValidation.success) {
        const pathError = fromError(bodyValidation.error).toString();
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const purchaseRes = await createCreditPurchase(auth, bodyValidation.data);
      if (purchaseRes.isErr()) {
        return purchaseErrorToApi(req, res, purchaseRes.error);
      }

      return res.status(200).json({ success: true, ...purchaseRes.value });
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
