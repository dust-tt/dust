import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";
import { z } from "zod";

import { validate } from "@front-api/middleware/validator";

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

app.get("/", validate("query", GetCheckoutStatusQuerySchema), async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  }

  const { plan_code } = c.req.valid("query");

  const subscription = auth.subscription();
  if (subscription?.plan.code === plan_code) {
    const body: GetCheckoutStatusResponseBody = { status: "success" };
    return c.json(body);
  }

  const body: GetCheckoutStatusResponseBody = { status: "pending" };
  return c.json(body);
});

export default app;
