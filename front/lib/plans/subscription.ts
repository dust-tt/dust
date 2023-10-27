import { Authenticator } from "@app/lib/auth";
import { front_sequelize } from "@app/lib/databases";
import { Plan, Subscription, Workspace } from "@app/lib/models";
import {
  FREE_TEST_PLAN_CODE,
  FREE_TEST_PLAN_DATA,
  FREE_UPGRADED_PLAN_CODE,
  PlanAttributes,
} from "@app/lib/plans/free_plans";
import { generateModelSId } from "@app/lib/utils";
import { PlanType } from "@app/types/user";

/**
 * Internal function to subscribe to the default FREE_TEST_PLAN.
 * This is the only plan without a database entry: no need to create a subscription, we just end the active one if any.
 */
export const internalSubscribeWorkspaceToFreeTestPlan = async ({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<PlanType> => {
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
}): Promise<PlanType> => {
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
      },
      { transaction: t }
    );

    return {
      code: plan.code,
      name: plan.name,
      status: "active",
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
): Promise<PlanType> => {
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
    return await internalSubscribeWorkspaceToFreeTestPlan({
      workspaceId: workspace.sId,
    });
  }

  const now = new Date();

  return await front_sequelize.transaction(async (t) => {
    // We get the plan to subscribe to
    const newPlan = await Plan.findOne({
      where: { code: planCode },
      transaction: t,
    });
    if (!newPlan) {
      throw new Error(`Cannot subscribe to plan ${planCode}:  not found.`);
    }

    // We search for an active subscription for this workspace
    const activeSubscription = await Subscription.findOne({
      where: { workspaceId: workspace.id, status: "active" },
      transaction: t,
    });

    // We check if the user is already subscribed to this plan
    if (activeSubscription && activeSubscription.planId === newPlan.id) {
      throw new Error(
        `Cannot subscribe to plan ${planCode}:  already subscribed.`
      );
    }

    // We end the active subscription if any
    if (activeSubscription) {
      await activeSubscription.update(
        {
          status: "ended",
          endDate: now,
        },
        { transaction: t }
      );
    }

    // We create a new subscription
    const newSubscription = await Subscription.create(
      {
        sId: generateModelSId(),
        workspaceId: workspace.id,
        planId: newPlan.id,
        status: "active",
        startDate: now,
      },
      { transaction: t }
    );

    return {
      code: newPlan.code,
      name: newPlan.name,
      status: "active",
      startDate: newSubscription.startDate.getTime(),
      endDate: newSubscription.endDate?.getTime() || null,
      limits: {
        assistant: {
          isSlackBotAllowed: newPlan.isSlackbotAllowed,
          maxMessages: newPlan.maxMessages,
        },
        connections: {
          isSlackAllowed: newPlan.isManagedSlackAllowed,
          isNotionAllowed: newPlan.isManagedNotionAllowed,
          isGoogleDriveAllowed: newPlan.isManagedGoogleDriveAllowed,
          isGithubAllowed: newPlan.isManagedGithubAllowed,
        },
        dataSources: {
          count: newPlan.maxDataSourcesCount,
          documents: {
            count: newPlan.maxDataSourcesDocumentsCount,
            sizeMb: newPlan.maxDataSourcesDocumentsSizeMb,
          },
        },
        users: {
          maxUsers: newPlan.maxUsersInWorkspace,
        },
      },
    };
  });
};
