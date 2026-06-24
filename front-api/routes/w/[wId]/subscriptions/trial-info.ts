import { getStripeSubscription } from "@app/lib/plans/stripe";
import type { GetSubscriptionTrialInfoResponseBody } from "@app/types/api/subscription";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/subscriptions/trial-info.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetSubscriptionTrialInfoResponseBody> => {
    const auth = ctx.get("auth");

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
