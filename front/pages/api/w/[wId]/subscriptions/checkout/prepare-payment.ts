// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  type GetPreparePaymentResponseBody,
  getPreparePaymentData,
  type PreparePaymentError,
} from "@app/lib/api/checkout/prepare_payment";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetPreparePaymentResponseBody>>,
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

  const { setup_session_id } = req.query;
  if (!isString(setup_session_id)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid setup_session_id query parameter.",
      },
    });
  }

  // Prevent HTTP caching as session status can change on every call.
  res.setHeader("Cache-Control", "no-store");

  const result = await getPreparePaymentData(auth, setup_session_id);
  if (result.isErr()) {
    return mapPreparePaymentError(req, res, result.error);
  }

  return res.status(200).json(result.value);
}

function mapPreparePaymentError(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetPreparePaymentResponseBody>>,
  error: PreparePaymentError
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
    case "setup_not_succeeded":
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Setup session has not completed successfully.",
        },
      });
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
            "Setup session metadata is missing seatCount or pricePerSeatCents.",
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
    case "customer_deleted":
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Stripe customer has been deleted.",
        },
      });
    case "tax_calculation_failed":
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: error.message,
        },
      });
    default:
      assertNever(error);
  }
}

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
