import type { GetSubscriptionPricingResponseBody } from "@app/lib/resources/subscription_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/subscriptions/pricing.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetSubscriptionPricingResponseBody> => {
  const auth = ctx.get("auth");

  // Managers read pricing for the usage/members pages; billing-permission holders need it for the
  // subscription page.
  if (
    !auth.isManager() &&
    !(await auth.hasWorkspacePermission("admin", "billing"))
  ) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "You need billing access to manage billing settings, invoices, and payment methods.",
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
