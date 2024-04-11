import { Plan, Subscription, Workspace } from "@app/lib/models";
import { FREE_TEST_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { reportUsageForSubscriptionItems } from "@app/lib/plans/usage";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import mainLogger from "@app/logger/logger";

export async function recordUsageActivity(workspaceId: string) {
  const workspace = await Workspace.findOne({
    where: {
      sId: workspaceId,
    },
  });
  if (!workspace) {
    throw new Error("Workspace not found.");
  }

  const subscription = await Subscription.findOne({
    where: {
      workspaceId: workspace.id,
      status: "active",
    },
    include: [Plan],
  });

  const logger = mainLogger.child({ workspaceId });
  logger.info({}, "[UsageQueue] Recording usage for worskpace.");

  if (!subscription) {
    // The workspace likely downgraded during the debouncing period of usage reporting.
    logger.info(
      { workspaceId },
      "[UsageQueue] Cannot record usage of subscription: missing subscription."
    );

    return;
  }

  // Legacy free test plans don't have a Stripe subscription.
  if (subscription.plan.code === FREE_TEST_PLAN_CODE) {
    logger.info(
      { subscription, workspaceId },
      "[UsageQueue] Subscription is on free test plan -- skipping reporting usage."
    );

    return;
  }

  if (!subscription.stripeSubscriptionId) {
    // TODO(2024-04-05 flav) Uncomment once all workspaces have a valid stripe subscription.
    // throw new Error(
    //   "Cannot record usage of subscription: missing Stripe subscription Id or Stripe customer Id."
    // );
    logger.info(
      { subscription, workspaceId },
      "[UsageQueue] Cannot record usage of subscription: missing Stripe subscription Id."
    );

    return;
  }

  const stripeSubscription = await getStripeSubscription(
    subscription.stripeSubscriptionId
  );
  if (!stripeSubscription) {
    throw new Error(
      `Cannot update usage in subscription: Stripe subscription ${subscription.stripeSubscriptionId} not found.`
    );
  }

  await reportUsageForSubscriptionItems(
    stripeSubscription,
    renderLightWorkspaceType({ workspace })
  );
}
