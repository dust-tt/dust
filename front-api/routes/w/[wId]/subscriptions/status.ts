import { getMessageUsageCount } from "@app/lib/api/assistant/rate_limits";
import { isFreeTrialPhonePlan } from "@app/lib/plans/plan_codes";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";

export type GetSubscriptionStatusResponseBody = {
  shouldRedirect: boolean;
  redirectUrl: string | null;
};

// Mounted at /api/w/:wId/subscriptions/status.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetSubscriptionStatusResponseBody> => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();

  // Only admins can be redirected to trial-ended page.
  if (!auth.isAdmin()) {
    return ctx.json({
      shouldRedirect: false,
      redirectUrl: null,
    });
  }

  const subscription = auth.subscription();
  if (subscription && isFreeTrialPhonePlan(subscription.plan.code)) {
    // Active trial - check if messages are exhausted.
    try {
      const { count, limit } = await getMessageUsageCount(auth);
      if (limit !== -1 && count >= limit) {
        return ctx.json({
          shouldRedirect: true,
          redirectUrl: `/w/${owner.sId}/trial-ended`,
        });
      }
    } catch {
      // If we can't check message usage, don't redirect.
    }
  } else {
    // No active subscription or not a phone trial - check if last subscription
    // was an ended phone trial.
    const lastSubscription =
      await SubscriptionResource.fetchLastByWorkspace(owner);
    if (
      lastSubscription &&
      isFreeTrialPhonePlan(lastSubscription.getPlan().code) &&
      lastSubscription.toJSON().status === "ended"
    ) {
      return ctx.json({
        shouldRedirect: true,
        redirectUrl: `/w/${owner.sId}/trial-ended`,
      });
    }
  }

  return ctx.json({
    shouldRedirect: false,
    redirectUrl: null,
  });
});

export default app;
