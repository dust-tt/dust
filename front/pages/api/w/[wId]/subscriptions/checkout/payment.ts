// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  type CheckoutPaymentError,
  PostCheckoutPaymentBodySchema,
  type PostCheckoutPaymentResponseBody,
  processCheckoutPayment,
} from "@app/lib/api/checkout/payment";
import type { Authenticator } from "@app/lib/auth";
import { wakeLock } from "@app/lib/wake_lock";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostCheckoutPaymentResponseBody>>,
  auth: Authenticator
): Promise<void> {
  return wakeLock(
    async () => {
      if (req.method !== "POST") {
        return apiError(req, res, {
          status_code: 405,
          api_error: {
            type: "method_not_supported_error",
            message: "The method passed is not supported, POST is expected.",
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

      const bodyValidation = PostCheckoutPaymentBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(bodyValidation.error).toString(),
          },
        });
      }

      const { setupSessionId } = bodyValidation.data;
      const result = await processCheckoutPayment(auth, setupSessionId);
      if (result.isErr()) {
        return mapCheckoutPaymentError(req, res, result.error);
      }

      return res.status(200).json({ success: true });
    },
    { endpoint: req.url ?? null }
  );
}

function mapCheckoutPaymentError(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostCheckoutPaymentResponseBody>>,
  error: CheckoutPaymentError
): void {
  switch (error.type) {
    case "metronome_not_enabled":
      return apiError(req, res, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Metronome billing is not enabled for this workspace.",
        },
      });
    case "setup_failed":
      res.status(500).json({ error: "setup_failed" });
      return;
    case "workspace_mismatch":
      return apiError(req, res, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Setup intent does not correspond to the current workspace.",
        },
      });
    case "missing_metadata":
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message:
            "Setup session metadata is missing billingPeriod, seatCount or pricePerSeatCents.",
        },
      });
    case "missing_customer_id":
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Setup session is missing a customer ID.",
        },
      });
    case "missing_payment_method":
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Setup intent is missing a payment method.",
        },
      });
    case "customer_deleted":
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Stripe customer has been deleted.",
        },
      });
    case "invalid_coupon":
      res.status(500).json({ error: "invalid_coupon" });
      return;
    case "payment_failed":
      res.status(500).json({ error: "payment_failed" });
      return;
    case "metronome_provisioning_failed":
      res.status(500).json({ error: "metronome_error" });
      return;
    default:
      assertNever(error);
  }
}

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
