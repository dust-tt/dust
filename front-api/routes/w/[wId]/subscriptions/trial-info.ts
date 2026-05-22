import { getStripeSubscription } from "@app/lib/plans/stripe";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";

export type GetSubscriptionTrialInfoResponseBody = {
  trialDaysRemaining: number | null;
};

// Mounted at /api/w/:wId/subscriptions/trial-info.
const app = workspaceApp();

app.get(
  "/",
  async (ctx): HandlerResult<GetSubscriptionTrialInfoResponseBody> => {
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

    const subscription = auth.subscription();
    if (!subscription) {
      return ctx.json({
        trialDaysRemaining: null,
      });
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

    return ctx.json({ trialDaysRemaining });
  }
);

export default app;
