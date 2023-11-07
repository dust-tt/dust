import { Authenticator } from "@app/lib/auth";
import { front_sequelize } from "@app/lib/databases";
import { Plan, Subscription, Workspace } from "@app/lib/models";
import { FREE_TEST_PLAN_DATA, PlanAttributes } from "@app/lib/plans/free_plans";
import {
  FREE_TEST_PLAN_CODE,
  FREE_UPGRADED_PLAN_CODE,
} from "@app/lib/plans/plan_codes";
import {
  createCheckoutSession,
  updateStripeSubscriptionQuantity,
} from "@app/lib/plans/stripe";
import { countActiveSeatsInWorkspace } from "@app/lib/plans/workspace_usage";
import { generateModelSId } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { SubscriptionType } from "@app/types/plan";

/**
 * Internal function to subscribe to the default FREE_TEST_PLAN.
 * This is the only plan without a database entry: no need to create a subscription, we just end the active one if any.
 */
export const internalSubscribeWorkspaceToFreeTestPlan = async ({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<SubscriptionType> => {
  const workspace = await Workspace.findOne({
    where: { sId: workspaceId },
  });
  if (!workspace) {
    throw new Error(`Cannot find workspace ${workspaceId}`);
  }
  // We end the active subscription if any
  const activeSubscription = await Subscription.findOne({
    where: { workspaceId: workspace.id, status: "active" },
  });

  if (activeSubscription) {
    await activeSubscription.update({
      status: "ended",
      endDate: new Date(),
    });
  }

  // We return the default subscription to FREE_TEST_PLAN
  const freeTestPlan: PlanAttributes = FREE_TEST_PLAN_DATA;

  return {
    code: freeTestPlan.code,
    name: freeTestPlan.name,
    status: "active",
    subscriptionId: null,
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    stripeProductId: null,
    billingType: freeTestPlan.billingType,
    startDate: null,
    endDate: null,
    limits: {
      assistant: {
        isSlackBotAllowed: freeTestPlan.isSlackbotAllowed,
        maxMessages: freeTestPlan.maxMessages,
      },
      connections: {
        isSlackAllowed: freeTestPlan.isManagedSlackAllowed,
        isNotionAllowed: freeTestPlan.isManagedNotionAllowed,
        isGoogleDriveAllowed: freeTestPlan.isManagedGoogleDriveAllowed,
        isGithubAllowed: freeTestPlan.isManagedGithubAllowed,
      },
      dataSources: {
        count: freeTestPlan.maxDataSourcesCount,
        documents: {
          count: freeTestPlan.maxDataSourcesDocumentsCount,
          sizeMb: freeTestPlan.maxDataSourcesDocumentsSizeMb,
        },
      },
      users: {
        maxUsers: freeTestPlan.maxUsersInWorkspace,
      },
    },
  };
};

/**
 * Internal function to subscribe to the FREE_UPGRADED_PLAN.
 * This plan is free with no limitations, and should be used for Dust workspaces only (once we have paiement plans)
 */
export const internalSubscribeWorkspaceToFreeUpgradedPlan = async ({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<SubscriptionType> => {
  const workspace = await Workspace.findOne({
    where: { sId: workspaceId },
  });
  if (!workspace) {
    throw new Error(`Cannot find workspace ${workspaceId}`);
  }
  const plan = await Plan.findOne({
    where: { code: FREE_UPGRADED_PLAN_CODE },
  });
  if (!plan) {
    throw new Error(
      `Cannot subscribe to plan ${FREE_UPGRADED_PLAN_CODE}:  not found.`
    );
  }

  const now = new Date();

  // We search for an active subscription for this workspace
  const activeSubscription = await Subscription.findOne({
    where: { workspaceId: workspace.id, status: "active" },
  });
  if (activeSubscription && activeSubscription.planId === plan.id) {
    throw new Error(
      `Cannot subscribe to plan ${FREE_UPGRADED_PLAN_CODE}:  already subscribed.`
    );
  }

  return await front_sequelize.transaction(async (t) => {
    // We end the active subscription if any
    if (activeSubscription) {
      await activeSubscription.update({
        status: "ended",
        endDate: now,
      });
    }

    // We create a new subscription
    const newSubscription = await Subscription.create(
      {
        sId: generateModelSId(),
        workspaceId: workspace.id,
        planId: plan.id,
        status: "active",
        startDate: now,
        stripeCustomerId: activeSubscription?.stripeCustomerId || null,
      },
      { transaction: t }
    );

    return {
      code: plan.code,
      name: plan.name,
      status: "active",
      subscriptionId: newSubscription.sId,
      stripeSubscriptionId: newSubscription.stripeSubscriptionId,
      stripeCustomerId: newSubscription.stripeCustomerId,
      stripeProductId: null,
      billingType: "free",
      startDate: newSubscription.startDate.getTime(),
      endDate: newSubscription.endDate?.getTime() || null,
      limits: {
        assistant: {
          isSlackBotAllowed: plan.isSlackbotAllowed,
          maxMessages: plan.maxMessages,
        },
        connections: {
          isSlackAllowed: plan.isManagedSlackAllowed,
          isNotionAllowed: plan.isManagedNotionAllowed,
          isGoogleDriveAllowed: plan.isManagedGoogleDriveAllowed,
          isGithubAllowed: plan.isManagedGithubAllowed,
        },
        dataSources: {
          count: plan.maxDataSourcesCount,
          documents: {
            count: plan.maxDataSourcesDocumentsCount,
            sizeMb: plan.maxDataSourcesDocumentsSizeMb,
          },
        },
        users: {
          maxUsers: plan.maxUsersInWorkspace,
        },
      },
    };
  });
};

export const subscribeWorkspaceToPlan = async (
  auth: Authenticator,
  { planCode }: { planCode: string }
): Promise<string | void> => {
  const user = auth.user();
  const workspace = auth.workspace();
  const activePlan = auth.plan();

  if (!user || !auth.isAdmin() || !workspace || !activePlan) {
    throw new Error(
      "Unauthorized `auth` data: cannot process to subscription of new Plan."
    );
  }

  // We prevent the user to subscribe to the FREE_UPGRADED_PLAN: this is an internal plan for Dust workspaces only.
  if (planCode === FREE_UPGRADED_PLAN_CODE) {
    throw new Error(
      `Unauthorized: cannot subscribe to ${FREE_UPGRADED_PLAN_CODE}.`
    );
  }

  // Case of a downgrade to the free default plan: we use the internal function
  if (planCode === FREE_TEST_PLAN_CODE) {
    await internalSubscribeWorkspaceToFreeTestPlan({
      workspaceId: workspace.sId,
    });
    return;
  }

  // We make sure the user is not trying to subscribe to a plan he already has
  const newPlan = await Plan.findOne({
    where: { code: planCode },
  });
  if (!newPlan) {
    throw new Error(`Cannot subscribe to plan ${planCode}:  not found.`);
  }
  const activeSubscription = await Subscription.findOne({
    where: { workspaceId: workspace.id, status: "active" },
  });
  if (activeSubscription && activeSubscription.planId === newPlan.id) {
    throw new Error(
      `Cannot subscribe to plan ${planCode}:  already subscribed.`
    );
  }

  if (newPlan.billingType === "free") {
    // We can immediately subscribe to a free plan: end the current subscription if any and create a new active one.
    const now = new Date();
    await front_sequelize.transaction(async (t) => {
      if (activeSubscription) {
        await activeSubscription.update(
          {
            status: "ended",
            endDate: now,
          },
          { transaction: t }
        );
      }
      await Subscription.create(
        {
          sId: generateModelSId(),
          workspaceId: workspace.id,
          planId: newPlan.id,
          status: "active",
          startDate: now,
          stripeCustomerId: activeSubscription?.stripeCustomerId || null,
        },
        { transaction: t }
      );
    });
  } else if (newPlan.stripeProductId) {
    // We enter Stripe Checkout flow
    const checkoutUrl = await createCheckoutSession({
      owner: workspace,
      planCode: newPlan.code,
      productId: newPlan.stripeProductId,
      billingType: newPlan.billingType,
      stripeCustomerId: activeSubscription?.stripeCustomerId || null,
    });
    if (checkoutUrl) {
      return checkoutUrl;
    }
  } else {
    throw new Error(
      `Plan with code ${planCode} is not a free plan and has no Stripe Product ID.`
    );
  }
};

export const updateWorkspacePerSeatSubscriptionUsage = async ({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> => {
  try {
    const workspace = await Workspace.findOne({
      where: { sId: workspaceId },
    });
    if (!workspace) {
      throw new Error(
        "Cannot process update usage in subscription: workspace not found."
      );
    }

    const activeSubscription = await Subscription.findOne({
      where: { workspaceId: workspace.id, status: "active" },
      include: [
        {
          model: Plan,
          as: "plan",
          required: true,
        },
      ],
    });
    if (!activeSubscription) {
      // No active subscription: the workspace is in the free default plan
      return;
    }
    if (activeSubscription.plan.billingType !== "per_seat") {
      // We only update the usage for plans with billingType === "per_seat"
      return;
    }
    if (
      !activeSubscription.stripeSubscriptionId ||
      !activeSubscription.stripeCustomerId ||
      !activeSubscription.plan.stripeProductId
    ) {
      throw new Error(
        "Cannot update usage in per_seat subscription: missing Stripe subscription ID or Stripe customer ID."
      );
    }

    // We update the subscription usage
    const activeSeats = await countActiveSeatsInWorkspace(workspace.sId);

    await updateStripeSubscriptionQuantity({
      stripeSubscriptionId: activeSubscription.stripeSubscriptionId,
      stripeCustomerId: activeSubscription.stripeCustomerId,
      stripeProductId: activeSubscription.plan.stripeProductId,
      quantity: activeSeats,
    });
  } catch (err) {
    logger.error(
      `Error while updating Stripe subscription quantity for workspace ${workspaceId}: ${err}`
    );
  }
};
