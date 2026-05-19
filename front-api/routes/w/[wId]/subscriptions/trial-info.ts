import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";
import { workspaceAuth } from "@front-api/middleware/workspace_auth";

import { getStripeSubscription } from "@app/lib/plans/stripe";

export type GetSubscriptionTrialInfoResponseBody = {
  trialDaysRemaining: number | null;
};

// Mounted at /api/w/:wId/subscriptions/trial-info.
const app = new Hono();

app.use("*", workspaceAuth({ doesNotRequireCanUseProduct: true }));

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

  const subscription = auth.subscription();
  if (!subscription) {
    const body: GetSubscriptionTrialInfoResponseBody = {
      trialDaysRemaining: null,
    };
    return c.json(body);
  }

  let trialDaysRemaining: number | null = null;

  if (subscription.trialing && subscription.stripeSubscriptionId) {
    const stripeSubscription = await getStripeSubscription(
      subscription.stripeSubscriptionId
    );
    if (stripeSubscription && stripeSubscription.trial_end) {
      trialDaysRemaining = Math.ceil(
        (stripeSubscription.trial_end * 1000 - Date.now()) /
          (1000 * 60 * 60 * 24)
      );
    }
  }

  const body: GetSubscriptionTrialInfoResponseBody = { trialDaysRemaining };
  return c.json(body);
});

export default app;
