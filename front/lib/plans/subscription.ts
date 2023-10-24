import { front_sequelize, ModelId } from "@app/lib/databases";
import { Plan, Subscription } from "@app/lib/models";
import {
  FREE_TEST_PLAN_DATA,
  FREE_UPGRADED_PLAN_CODE,
  PlanAttributes,
} from "@app/lib/plans/free_plans";
import { generateModelSId } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { SubscribedPlanType } from "@app/types/user";

export const getActiveWorkspacePlan = async ({
  workspaceModelId,
}: {
  workspaceModelId: ModelId | null;
}): Promise<SubscribedPlanType> => {
  let activeSubscription: Subscription | null = null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (workspaceModelId) {
    activeSubscription = await Subscription.findOne({
      where: { workspaceId: workspaceModelId, status: "active" },
    });
  }

  // Default values when no subscription
  let plan: PlanAttributes = FREE_TEST_PLAN_DATA;
  let startDate = today;
  let endDate = null;
  let status = "active";

  if (activeSubscription) {
    const subscribedPlan = await Plan.findOne({
      where: { id: activeSubscription.planId },
    });
    startDate = activeSubscription.startDate;
    endDate = activeSubscription.endDate;
    status = activeSubscription.status;
    if (subscribedPlan) {
      plan = subscribedPlan;
    } else {
      logger.error(
        {
          workspaceModelId,
          activeSubscription,
        },
        "Cannot find plan for active subscription. Will use limits of FREE_TEST_PLAN instead. Please check and fix."
      );
    }
  }

  return {
    code: plan.code,
    name: plan.name,
    status: status,
    startDate: startDate?.getTime(),
    endDate: endDate?.getTime() || null,
    limits: {
      assistant: {
        isSlackBotAllowed: plan.isSlackbotAllowed,
        maxWeeklyMessages: plan.maxWeeklyMessages,
      },
      managedDataSources: {
        isSlackAllowed: plan.isManagedSlackAllowed,
        isNotionAllowed: plan.isManagedNotionAllowed,
        isGoogleDriveAllowed: plan.isManagedGoogleDriveAllowed,
        isGithubAllowed: plan.isManagedGithubAllowed,
      },
      staticDataSources: {
        count: plan.maxNbStaticDataSources,
        documents: {
          count: plan.maxNbStaticDocuments,
          sizeMb: plan.maxSizeStaticDataSources,
        },
      },
      users: {
        maxUsers: plan.maxUsersInWorkspace,
      },
    },
  };
};

/**
 * Internal function to subscribe to the default FREE_TEST_PLAN.
 * This is the only plan without a database entry: no need to create a subscription, we just end the active one if any.
 */
export const internalSubscribeWorkspaceToFreeTestPlan = async ({
  workspaceModelId,
}: {
  workspaceModelId: ModelId;
}): Promise<SubscribedPlanType> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // We end the active subscription if any
  const activeSubscription = await Subscription.findOne({
    where: { workspaceId: workspaceModelId, status: "active" },
  });
  if (activeSubscription) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (activeSubscription.startDate >= today) {
      await activeSubscription.update({
        status: "cancelled",
        startDate: today,
        endDate: today,
      });
    } else {
      await activeSubscription.update({
        status: "ended",
        endDate: yesterday,
      });
    }
  }

  // We return the default subscription to FREE_TEST_PLAN
  const freeTestPlan: PlanAttributes = FREE_TEST_PLAN_DATA;

  return {
    code: freeTestPlan.code,
    name: freeTestPlan.name,
    status: "active",
    startDate: today.getTime(),
    endDate: null,
    limits: {
      assistant: {
        isSlackBotAllowed: freeTestPlan.isSlackbotAllowed,
        maxWeeklyMessages: freeTestPlan.maxWeeklyMessages,
      },
      managedDataSources: {
        isSlackAllowed: freeTestPlan.isManagedSlackAllowed,
        isNotionAllowed: freeTestPlan.isManagedNotionAllowed,
        isGoogleDriveAllowed: freeTestPlan.isManagedGoogleDriveAllowed,
        isGithubAllowed: freeTestPlan.isManagedGithubAllowed,
      },
      staticDataSources: {
        count: freeTestPlan.maxNbStaticDataSources,
        documents: {
          count: freeTestPlan.maxNbStaticDocuments,
          sizeMb: freeTestPlan.maxSizeStaticDataSources,
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
  workspaceModelId,
}: {
  workspaceModelId: ModelId;
}): Promise<SubscribedPlanType> => {
  const plan = await Plan.findOne({
    where: { code: FREE_UPGRADED_PLAN_CODE },
  });
  if (!plan) {
    throw new Error(
      `Cannot subscribe to plan ${FREE_UPGRADED_PLAN_CODE}:  not found.`
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // We search for an active subscription for this workspace
  const activeSubscription = await Subscription.findOne({
    where: { workspaceId: workspaceModelId, status: "active" },
  });
  if (activeSubscription && activeSubscription.planId === plan.id) {
    throw new Error(
      `Cannot subscribe to plan ${FREE_UPGRADED_PLAN_CODE}:  already subscribed.`
    );
  }

  return await front_sequelize.transaction(async (t) => {
    // We end the active subscription if any
    if (activeSubscription) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (activeSubscription.startDate >= today) {
        await activeSubscription.update({
          status: "cancelled",
          startDate: today,
          endDate: today,
        });
      } else {
        await activeSubscription.update({
          status: "ended",
          endDate: yesterday,
        });
      }
    }

    // We create a new subscription
    const newSubscription = await Subscription.create(
      {
        sId: generateModelSId(),
        workspaceId: workspaceModelId,
        planId: plan.id,
        status: "active",
        startDate: today,
      },
      { transaction: t }
    );

    return {
      code: plan.code,
      name: plan.name,
      status: newSubscription.status,
      startDate: newSubscription.startDate?.getTime(),
      endDate: newSubscription.endDate?.getTime() || null,
      limits: {
        assistant: {
          isSlackBotAllowed: plan.isSlackbotAllowed,
          maxWeeklyMessages: plan.maxWeeklyMessages,
        },
        managedDataSources: {
          isSlackAllowed: plan.isManagedSlackAllowed,
          isNotionAllowed: plan.isManagedNotionAllowed,
          isGoogleDriveAllowed: plan.isManagedGoogleDriveAllowed,
          isGithubAllowed: plan.isManagedGithubAllowed,
        },
        staticDataSources: {
          count: plan.maxNbStaticDataSources,
          documents: {
            count: plan.maxNbStaticDocuments,
            sizeMb: plan.maxSizeStaticDataSources,
          },
        },
        users: {
          maxUsers: plan.maxUsersInWorkspace,
        },
      },
    };
  });
};
