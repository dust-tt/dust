import type { SubscriptionPerSeatPricing } from "@app/types/plan";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

export type GetSubscriptionPricingResponseBody = {
  perSeatPricing: SubscriptionPerSeatPricing | null;
};

// Mounted at /api/w/:wId/subscriptions/pricing.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetSubscriptionPricingResponseBody> => {
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
    return ctx.json({ perSeatPricing: null });
  }

  const perSeatPricing = await subscriptionResource.getPerSeatPricing();
  return ctx.json({ perSeatPricing });
});

export default app;
