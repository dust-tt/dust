import { FREE_TEST_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { PlanModel, SubscriptionModel } from "@app/lib/models/plan";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }) => {
  // Find the FREE_TEST_PLAN.
  const plan = await PlanModel.findOne({
    where: { code: FREE_TEST_PLAN_CODE },
  });

  if (!plan) {
    throw new Error(`Plan ${FREE_TEST_PLAN_CODE} not found.`);
  }

  // Find all active FREE_TEST_PLAN subscriptions without an end date.
  const subscriptions = await SubscriptionModel.findAll({
    where: {
      status: "active",
      planId: plan.id,
      endDate: null,
    },
    include: [WorkspaceModel],
  });

  logger.info(
    { count: subscriptions.length },
    "Found FREE_TEST_PLAN subscriptions without end date"
  );

  if (subscriptions.length === 0) {
    logger.info("No subscriptions to update.");
    return;
  }

  for (const subscription of subscriptions) {
    const workspace = renderLightWorkspaceType({
      workspace: subscription.workspace,
    });

    logger.info(
      {
        subscriptionId: subscription.id,
        subscriptionSId: subscription.sId,
        workspaceSId: workspace.sId,
        execute,
      },
      "Ending subscription"
    );

    if (execute) {
      await SubscriptionResource.endActiveSubscription(workspace);
    }
  }

  logger.info(
    { count: subscriptions.length, execute },
    "Done ending subscriptions"
  );
});
