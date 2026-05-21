import { resolveCurrencyFromStripe } from "@app/lib/plans/billing_currency";
import { getStripeCustomer } from "@app/lib/plans/stripe";
import type { SupportedCurrency } from "@app/types/currency";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

const PostPokeStripeCustomerCurrencyBodySchema = z.object({
  stripeCustomerId: z.string().min(1, "Required"),
});

export type PostPokeStripeCustomerCurrencyResponseBody = {
  currency: SupportedCurrency;
};

// Mounted at /api/poke/stripe/customers/currency.
const app = new Hono();

app.post(
  "/",
  validate("json", PostPokeStripeCustomerCurrencyBodySchema),
  async (ctx): HandlerResult<PostPokeStripeCustomerCurrencyResponseBody> => {
    const { stripeCustomerId } = ctx.req.valid("json");

    const stripeCustomer = await getStripeCustomer(stripeCustomerId);
    if (!stripeCustomer) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message: `Stripe customer not found: ${stripeCustomerId}.`,
        },
      });
    }

    const currency = resolveCurrencyFromStripe({ stripeCustomer });
    return ctx.json({ currency });
  }
);

export default app;
