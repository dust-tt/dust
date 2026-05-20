import type { SubscriptionPerSeatPricing } from "@app/types/plan";

import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type GetSubscriptionPricingResponseBody = {
  perSeatPricing: SubscriptionPerSeatPricing | null;
};

// Mounted at /api/w/:wId/subscriptions/pricing.
const app = new Hono();

app.get("/", async (ctx) => {
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

  const subscriptionResource = auth.subscriptionResource();
  if (!subscriptionResource) {
    const body: GetSubscriptionPricingResponseBody = { perSeatPricing: null };
    return ctx.json(body);
  }

  const perSeatPricing = await subscriptionResource.getPerSeatPricing();
  const body: GetSubscriptionPricingResponseBody = { perSeatPricing };
  return ctx.json(body);
});

export default app;
