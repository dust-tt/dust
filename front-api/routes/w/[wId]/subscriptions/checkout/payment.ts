import {
  type CheckoutPaymentError,
  PostCheckoutPaymentBodySchema,
  type PostCheckoutPaymentResponseBody,
  processCheckoutPayment,
} from "@app/lib/api/checkout/payment";
import { wakeLock } from "@app/lib/wake_lock";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/subscriptions/checkout/payment.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostCheckoutPaymentBodySchema),
  async (ctx): HandlerResult<PostCheckoutPaymentResponseBody> => {
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
        const result = await processCheckoutPayment(auth, setupSessionId);
        if (result.isErr()) {
          return mapCheckoutPaymentError(ctx, result.error);
        }

        return ctx.json<PostCheckoutPaymentResponseBody>({ success: true });
      },
      { endpoint: ctx.req.url ?? null }
    );
  }
);

function mapCheckoutPaymentError(
  ctx: Parameters<typeof apiError>[0],
  error: CheckoutPaymentError
) {
  switch (error.type) {
    case "metronome_not_enabled":
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Metronome billing is not enabled for this workspace.",
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
            "Setup session metadata is missing billingPeriod, seatCount or pricePerSeatCents.",
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
    case "setup_failed":
      return ctx.json<PostCheckoutPaymentResponseBody>(
        { error: "setup_failed" },
        500
      );
    case "invalid_coupon":
      return ctx.json<PostCheckoutPaymentResponseBody>(
        { error: "invalid_coupon" },
        500
      );
    case "payment_failed":
      return ctx.json<PostCheckoutPaymentResponseBody>(
        { error: "payment_failed" },
        500
      );
    case "metronome_provisioning_failed":
      return ctx.json<PostCheckoutPaymentResponseBody>(
        { error: "metronome_error" },
        500
      );
    default:
      assertNever(error);
  }
}

export default app;
