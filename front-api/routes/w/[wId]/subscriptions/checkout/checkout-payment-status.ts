import type { CheckoutPayment } from "@app/lib/credits/checkout_payment_status";
import { getCheckoutPaymentStatus } from "@app/lib/credits/checkout_payment_status";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

export type GetCheckoutPaymentStatusResponseBody = {
  checkoutPayment: CheckoutPayment | null;
};

// Mounted at /api/w/:wId/subscriptions/checkout/checkout-payment-status.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetCheckoutPaymentStatusResponseBody> => {
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

export default app;
