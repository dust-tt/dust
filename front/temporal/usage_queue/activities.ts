import { Subscription, Workspace } from "@app/lib/models";
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
    },
  });

  const logger = mainLogger.child({ workspaceId });
  logger.info({}, "[UsageQueue] Recording usage for worskpace.");

  if (
    !subscription ||
    !workspace ||
    !subscription.stripeSubscriptionId ||
    !subscription.stripeCustomerId
  ) {
    throw new Error(
      "Cannot record usage of subscription: missing Stripe subscription Id or Stripe customer Id."
    );
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
