import {
  type BusinessActivationRequestError,
  type GetBusinessActivationResponseBody,
  type PostBusinessActivationResponseBody,
  processBusinessActivation,
} from "@app/lib/api/checkout/business_activation";
import { PostCheckoutPaymentBodySchema } from "@app/lib/api/checkout/payment";
import { getCheckoutPaymentStatus } from "@app/lib/credits/checkout_payment_status";
import { wakeLock } from "@app/lib/wake_lock";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/subscriptions/checkout/business-activation.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetBusinessActivationResponseBody> => {
    const auth = ctx.get("auth");

    const contractId = ctx.req.query("contract_id");
    if (!contractId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Missing required query parameter: contract_id.",
        },
      });
    }

    const checkoutPayment = await getCheckoutPaymentStatus({
      workspaceId: auth.getNonNullableWorkspace().sId,
      contractId,
    });

    return ctx.json({ checkoutPayment });
  }
);

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostCheckoutPaymentBodySchema),
  async (ctx): HandlerResult<PostBusinessActivationResponseBody> => {
    return wakeLock(
      async () => {
        const auth = ctx.get("auth");

        // biome-ignore lint/plugin/noDirectRoleCheck: inside wakeLock callback, middleware not applicable
        if (!auth.isAdmin()) {
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message:
                "Only users that are `admins` for the current workspace can access this endpoint.",
            },
          });
        }

        const { setupSessionId } = ctx.req.valid("json");
        const result = await processBusinessActivation(auth, setupSessionId);
        if (result.isErr()) {
          return mapBusinessActivationError(ctx, result.error);
        }

        return ctx.json<PostBusinessActivationResponseBody>(result.value);
      },
      { endpoint: ctx.req.url ?? null }
    );
  }
);

function mapBusinessActivationError(
  ctx: Parameters<typeof apiError>[0],
  error: BusinessActivationRequestError
) {
  switch (error.type) {
    case "checkout_not_enabled":
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Metronome CP checkout is not enabled for this workspace.",
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
            "Setup session metadata is missing required fields (billingPeriod, seatType, pricePerSeatCents).",
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
    case "missing_payment_method":
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Setup intent is missing a payment method.",
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
    case "target_user_not_found":
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_auth_error",
          message: "Target user not found in workspace.",
        },
      });
    case "not_on_free_plan":
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Workspace is not on the free plan; subscription activation requires a free plan workspace.",
        },
      });
    case "setup_failed":
      return ctx.json<PostBusinessActivationResponseBody>(
        { error: "setup_failed" },
        500
      );
    case "non_card_payment_method":
    case "payment_failed":
      return ctx.json<PostBusinessActivationResponseBody>(
        { error: "payment_failed" },
        500
      );
    case "invalid_coupon":
      return ctx.json<PostBusinessActivationResponseBody>(
        { error: "invalid_coupon" },
        500
      );
    case "metronome_error":
      return ctx.json<PostBusinessActivationResponseBody>(
        { error: "metronome_error" },
        500
      );
    default:
      assertNever(error);
  }
}

export default app;
