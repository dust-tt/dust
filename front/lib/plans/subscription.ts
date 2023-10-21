import { front_sequelize, ModelId } from "@app/lib/databases";
import { Plan, Subscription } from "@app/lib/models";
import {
  FREE_TRIAL_PLAN_CODE,
  TEST_PLAN_CODE,
} from "@app/lib/plans/free_plans";
import { generateModelSId } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { SubscribedPlanType } from "@app/types/user";

export const getActiveWorkspacePlan = async ({
  workspaceModelId,
}: {
  workspaceModelId: ModelId;
}): Promise<SubscribedPlanType> => {
  let plan = null;
  let startDate = new Date();
  let endDate = null;

  const activeSubscription = await Subscription.findOne({
    where: { workspaceId: workspaceModelId, status: "active" },
  });

  if (activeSubscription) {
    plan = await Plan.findOne({
      where: { id: activeSubscription.planId },
    });
    startDate = activeSubscription.startDate;
    endDate = activeSubscription.endDate;
  }

  // This should never happen, all workspace should have an active subscription
  // If it happens we log and error that requires immediate fix.
  // We return the free test plan to avoid breaking the app
  if (!activeSubscription || !plan) {
    logger.error(
      { workspaceModelId },
      "Cannot find active subscription or plan for workspace. Please fix ASAP. Returning a free plan."
    );
    plan = await Plan.findOne({
      where: { code: TEST_PLAN_CODE },
    });
    if (!plan) {
      throw new Error(`Cannot find free plan ${TEST_PLAN_CODE}.`);
    }
  }

  return {
    code: plan.code,
    name: plan.name,
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
 * Internal function to subscribe a workspace to a free plan.
 * Used to subscribe to free Test plan or free Trial plan only.
 */
export const internalSubscribeWorkspaceToFreePlan = async ({
  workspaceModelId,
  planCode,
}: {
  workspaceModelId: ModelId;
  planCode: string;
}): Promise<SubscribedPlanType> => {
  if (planCode !== TEST_PLAN_CODE && planCode !== FREE_TRIAL_PLAN_CODE) {
    throw new Error(`Cannot subscribe to plan ${planCode}:  not found.`);
  }
  const newPlan = await Plan.findOne({
    where: { code: planCode },
  });
  if (!newPlan) {
    throw new Error(`Cannot subscribe to plan ${planCode}:  not found.`);
  }
  const activeSubscription = await Subscription.findOne({
    where: { workspaceId: workspaceModelId, status: "active" },
  });
  if (activeSubscription && activeSubscription.planId === newPlan.id) {
    throw new Error(
      `Cannot subscribe to plan ${planCode}:  already subscribed.`
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return await front_sequelize.transaction(async (t) => {
    // We end the active subscription if any: status is set to ended yesterday, or cancelled if we both subscribed and cancelled on the same day.
    if (activeSubscription) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (activeSubscription.startDate >= today) {
        await activeSubscription.update(
          { status: "cancelled", endDate: today },
          { transaction: t }
        );
      } else {
        await activeSubscription.update(
          { status: "ended", endDate: yesterday },
          { transaction: t }
        );
      }
    }

    // We create a new subscription
    const newSubscription = await Subscription.create(
      {
        sId: generateModelSId(),
        workspaceId: workspaceModelId,
        planId: newPlan.id,
        status: "active",
        startDate: today,
      },
      { transaction: t }
    );

    return {
      code: newPlan.code,
      name: newPlan.name,
      status: newSubscription.status,
      startDate: newSubscription.startDate?.getTime(),
      endDate: newSubscription.endDate?.getTime() || null,
      limits: {
        assistant: {
          isSlackBotAllowed: newPlan.isSlackbotAllowed,
          maxWeeklyMessages: newPlan.maxWeeklyMessages,
        },
        managedDataSources: {
          isSlackAllowed: newPlan.isManagedSlackAllowed,
          isNotionAllowed: newPlan.isManagedNotionAllowed,
          isGoogleDriveAllowed: newPlan.isManagedGoogleDriveAllowed,
          isGithubAllowed: newPlan.isManagedGithubAllowed,
        },
        staticDataSources: {
          count: newPlan.maxNbStaticDataSources,
          documents: {
            count: newPlan.maxNbStaticDocuments,
            sizeMb: newPlan.maxSizeStaticDataSources,
          },
        },
        users: {
          maxUsers: newPlan.maxUsersInWorkspace,
        },
      },
    };
  });
};
