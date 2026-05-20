import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

type CheckoutStatus =
  | { status: "success" }
  | { status: "error"; message: string }
  | { status: "pending" };

export type GetCheckoutStatusResponseBody = CheckoutStatus;

const GetCheckoutStatusQuerySchema = z.object({
  session_id: z.string(),
  plan_code: z.string(),
});

// Mounted at /api/w/:wId/subscriptions/checkout-status. Endpoint used only
// for the Stripe-only checkout flow (PaymentProcessingPage).
const app = new Hono();

app.get(
  "/",
  validate("query", GetCheckoutStatusQuerySchema),
  async (ctx): HandlerResult<GetCheckoutStatusResponseBody> => {
    const auth = ctx.get("auth");

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

    const { plan_code } = ctx.req.valid("query");

    const subscription = auth.subscription();
    if (subscription?.plan.code === plan_code) {
      return ctx.json({ status: "success" });
    }

    return ctx.json({ status: "pending" });
  }
);

export default app;
