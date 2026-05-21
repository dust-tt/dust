import apiConfig from "@app/lib/api/config";
import { processStripeWebhookEvent } from "@app/lib/api/stripe/webhook_handler";
import { getStripeClient } from "@app/lib/plans/stripe";
import logger from "@app/logger/logger";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";
import type Stripe from "stripe";

export type GetResponseBody = {
  success: boolean;
  message?: string;
};

// Mounted at /api/stripe/webhook.
const app = new Hono();

app.get(
  "/",
  async (ctx): HandlerResult<GetResponseBody> => ctx.json({ success: true })
);

app.post("/", async (ctx): HandlerResult<GetResponseBody> => {
  const stripe = getStripeClient();
  const sig = ctx.req.header("stripe-signature") ?? "";
  let event: Stripe.Event | null = null;

  // Read raw body bytes for Stripe signature verification.
  const rawBody = Buffer.from(await ctx.req.arrayBuffer());

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      apiConfig.getStripeSecretWebhookKey()
    );
  } catch (error) {
    logger.error({ error }, "Error constructing Stripe event in Webhook.");
  }

  if (!event) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "internal_server_error",
        message:
          "Invalid Stripe Webhook event, the signature may not be valid.",
      },
    });
  }

  const result = await processStripeWebhookEvent({
    event,
    stripe,
    now: new Date(),
  });
  if (result.isErr()) {
    return apiError(ctx, result.error);
  }
  return ctx.json({ success: true });
});

export default app;
