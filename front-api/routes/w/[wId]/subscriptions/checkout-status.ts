import { Hono } from "hono";
import { z } from "zod";

import { getMetronomeCheckoutError } from "@app/lib/metronome/checkout_error";

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

// Mounted at /api/w/:wId/subscriptions/checkout-status.
const app = new Hono();

app.get("/", validate("query", GetCheckoutStatusQuerySchema), async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return c.json(
      {
        error: {
          type: "workspace_auth_error",
          message:
            "Only users that are `admins` for the current workspace can access this endpoint.",
        },
      },
      403
    );
  }

  const { session_id, plan_code } = c.req.valid("query");

  const storedError = await getMetronomeCheckoutError(session_id);
  if (storedError) {
    const body: GetCheckoutStatusResponseBody = {
      status: "error",
      message: storedError.message,
    };
    return c.json(body);
  }

  const subscription = auth.subscription();
  if (subscription?.plan.code === plan_code) {
    const body: GetCheckoutStatusResponseBody = { status: "success" };
    return c.json(body);
  }

  const body: GetCheckoutStatusResponseBody = { status: "pending" };
  return c.json(body);
});

export default app;
