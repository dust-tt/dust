import type { GetCheckoutStatusResponseBody } from "@app/lib/api/subscription";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const GetCheckoutStatusQuerySchema = z.object({
  session_id: z.string(),
  plan_code: z.string(),
});

// Mounted at /api/w/:wId/subscriptions/checkout-status. Endpoint used only
// for the Stripe-only checkout flow (PaymentProcessingPage).
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  validate("query", GetCheckoutStatusQuerySchema),
  async (ctx): HandlerResult<GetCheckoutStatusResponseBody> => {
    const auth = ctx.get("auth");

    const { plan_code } = ctx.req.valid("query");

    const subscription = auth.subscription();
    if (subscription?.plan.code === plan_code) {
      return ctx.json({ status: "success" });
    }

    return ctx.json({ status: "pending" });
  }
);

export default app;
