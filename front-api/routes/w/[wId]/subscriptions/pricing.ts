import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";
import { workspaceAuth } from "@front-api/middleware/workspace_auth";

import type { SubscriptionPerSeatPricing } from "@app/types/plan";

export type GetSubscriptionPricingResponseBody = {
  perSeatPricing: SubscriptionPerSeatPricing | null;
};

// Mounted at /api/w/:wId/subscriptions/pricing.
const app = new Hono();

app.use("*", workspaceAuth());

app.get("/", async (c) => {
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

  const subscriptionResource = auth.subscriptionResource();
  if (!subscriptionResource) {
    const body: GetSubscriptionPricingResponseBody = { perSeatPricing: null };
    return c.json(body);
  }

  const perSeatPricing = await subscriptionResource.getPerSeatPricing();
  const body: GetSubscriptionPricingResponseBody = { perSeatPricing };
  return c.json(body);
});

export default app;
