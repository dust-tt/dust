import type { SubscriptionPerSeatPricing } from "@app/types/plan";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

export type GetSubscriptionPricingResponseBody = {
  perSeatPricing: SubscriptionPerSeatPricing | null;
};

// Mounted at /api/w/:wId/subscriptions/pricing.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetSubscriptionPricingResponseBody> => {
    const auth = ctx.get("auth");

    const subscriptionResource = auth.subscriptionResource();
    if (!subscriptionResource) {
      return ctx.json({ perSeatPricing: null });
    }

    const perSeatPricing = await subscriptionResource.getPerSeatPricing();
    return ctx.json({ perSeatPricing });
  }
);

export default app;
