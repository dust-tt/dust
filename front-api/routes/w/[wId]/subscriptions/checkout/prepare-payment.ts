import {
  type GetPreparePaymentResponseBody,
  getPreparePaymentData,
  type PreparePaymentError,
} from "@app/lib/api/checkout/prepare_payment";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/subscriptions/checkout/prepare-payment.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetPreparePaymentResponseBody> => {
    const setup_session_id = ctx.req.query("setup_session_id");
    if (!isString(setup_session_id)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Missing or invalid setup_session_id query parameter.",
        },
      });
    }

    // Prevent HTTP caching as session status can change on every call.
    ctx.header("Cache-Control", "no-store");

    const auth = ctx.get("auth");
    const result = await getPreparePaymentData(auth, setup_session_id);
    if (result.isErr()) {
      return mapPreparePaymentError(ctx, result.error);
    }

    return ctx.json<GetPreparePaymentResponseBody>(result.value);
  }
);

function mapPreparePaymentError(
  ctx: Parameters<typeof apiError>[0],
  error: PreparePaymentError
): ReturnType<typeof apiError> {
  switch (error.type) {
    case "metronome_not_enabled":
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Metronome billing is not enabled for this workspace.",
        },
      });
    case "setup_not_succeeded":
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Setup session has not completed successfully.",
        },
      });
    case "workspace_mismatch":
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Setup intent does not correspond to the current workspace.",
        },
      });
    case "missing_metadata":
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message:
            "Setup session metadata is missing seatCount or pricePerSeatCents.",
        },
      });
    case "missing_customer_id":
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Setup session is missing a customer ID.",
        },
      });
    case "customer_deleted":
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Stripe customer has been deleted.",
        },
      });
    case "tax_calculation_failed":
      return apiError(ctx, {
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

export default app;
