import type { WorkspaceType } from "@dust-tt/types";
import type {
  PlanInvitationType,
  PlanType,
  SubscriptionType,
} from "@dust-tt/types";
import { v4 as uuidv4 } from "uuid";

import type { Authenticator } from "@app/lib/auth";
import { Plan, Subscription, Workspace } from "@app/lib/models";
import { PlanInvitation } from "@app/lib/models/plan";
import type { PlanAttributes } from "@app/lib/plans/free_plans";
import { FREE_NO_PLAN_DATA } from "@app/lib/plans/free_plans";
import { PRO_PLAN_SEAT_29_CODE } from "@app/lib/plans/plan_codes";
import {
  cancelSubscriptionImmediately,
  createCheckoutSession,
  getStripeSubscription,
  updateStripeSubscriptionQuantity,
  updateStripeSubscriptionUsage,
} from "@app/lib/plans/stripe";
import {
  countActiveSeatsInWorkspace,
  countActiveUsersInWorkspaceSince,
} from "@app/lib/plans/workspace_usage";
import { redisClient } from "@app/lib/redis";
import { frontSequelize } from "@app/lib/resources/storage";
import { generateModelSId } from "@app/lib/utils";
import logger from "@app/logger/logger";

// Helper function to render PlanType from PlanAttributes
export function renderPlanFromModel({
  plan,
}: {
  plan: PlanAttributes;
}): PlanType {
  return {
    code: plan.code,
    name: plan.name,
    stripeProductId: plan.stripeProductId,
    billingType: plan.billingType,
    limits: {
      assistant: {
        isSlackBotAllowed: plan.isSlackbotAllowed,
        maxMessages: plan.maxMessages,
        maxMessagesTimeframe: plan.maxMessagesTimeframe,
      },
      connections: {
        isConfluenceAllowed: plan.isManagedConfluenceAllowed,
        isSlackAllowed: plan.isManagedSlackAllowed,
        isNotionAllowed: plan.isManagedNotionAllowed,
        isGoogleDriveAllowed: plan.isManagedGoogleDriveAllowed,
        isGithubAllowed: plan.isManagedGithubAllowed,
        isIntercomAllowed: plan.isManagedIntercomAllowed,
        isWebCrawlerAllowed: plan.isManagedWebCrawlerAllowed,
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
      canUseProduct: plan.canUseProduct,
    },
    trialPeriodDays: plan.trialPeriodDays,
  };
}

// Helper in charge of rendering the SubscriptionType object form PlanAttributes and optionally an
// active Subscription model.
export function renderSubscriptionFromModels({
  plan,
  activeSubscription,
}: {
  plan: PlanAttributes;
  activeSubscription: Subscription | null;
}): SubscriptionType {
  return {
    status: activeSubscription?.status ?? "active",
    trialing: activeSubscription?.trialing === true,
    sId: activeSubscription?.sId || null,
    stripeSubscriptionId: activeSubscription?.stripeSubscriptionId || null,
    stripeCustomerId: activeSubscription?.stripeCustomerId || null,
    startDate: activeSubscription?.startDate?.getTime() || null,
    endDate: activeSubscription?.endDate?.getTime() || null,
    paymentFailingSince:
      activeSubscription?.paymentFailingSince?.getTime() || null,
    plan: renderPlanFromModel({ plan }),
  };
}

/**
 * Internal function to subscribe to the FREE_NO_PLAN.
 * This is the only plan without a database entry: no need to create a subscription, we just end the active one if any.
 */
export const internalSubscribeWorkspaceToFreeNoPlan = async ({
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
  const now = new Date();

  const activeSubscription = await Subscription.findOne({
    where: { workspaceId: workspace.id, status: "active" },
  });

  if (activeSubscription) {
    await frontSequelize.transaction(async (t) => {
      // End the subscription
      const endedStatus = activeSubscription.stripeSubscriptionId
        ? "ended_backend_only"
        : "ended";

      await activeSubscription.update(
        {
          status: endedStatus,
          endDate: now,
        },
        { transaction: t }
      );
    });

    // Notify Stripe that we ended the subscription if the subscription was a paid one
    if (activeSubscription?.stripeSubscriptionId) {
      await cancelSubscriptionImmediately({
        stripeSubscriptionId: activeSubscription.stripeSubscriptionId,
      });
    }
  }

  const plan: PlanAttributes = FREE_NO_PLAN_DATA;
  return renderSubscriptionFromModels({
    plan,
    // No active subscription for FREE_NO_PLAN
    activeSubscription: null,
  });
};

/**
 * Internal function to subscribe to a new Plan.
 * The new plan must be a free plan because the new subscription is created without Stripe data.
 */
export const internalSubscribeWorkspaceToFreePlan = async ({
  workspaceId,
  planCode,
}: {
  workspaceId: string;
  planCode: string;
}): Promise<SubscriptionType> => {
  const workspace = await Workspace.findOne({
    where: { sId: workspaceId },
  });
  if (!workspace) {
    throw new Error(`Cannot find workspace ${workspaceId}`);
  }
  const newPlan = await Plan.findOne({
    where: { code: planCode },
  });
  if (!newPlan) {
    throw new Error(`Cannot subscribe to plan ${planCode}:  not found.`);
  }

  const now = new Date();

  // We search for an active subscription for this workspace
  const activeSubscription = await Subscription.findOne({
    where: { workspaceId: workspace.id, status: "active" },
  });

  // Prevent subscribing to the same plan
  if (activeSubscription && activeSubscription.planId === newPlan.id) {
    throw new Error(
      `Cannot subscribe to plan ${planCode}: already subscribed.`
    );
  }

  // Prevent subscribing if the new plan is not a free plan
  if (newPlan.billingType !== "free") {
    throw new Error(
      `Cannot subscribe to plan ${planCode}: billingType is not "free".`
    );
  }

  // Prevent subscribing if the new plan has less users allowed then the current one on the workspace
  if (newPlan.maxUsersInWorkspace !== -1) {
    const activeSeats = await countActiveSeatsInWorkspace(workspace.sId);
    if (activeSeats > newPlan.maxUsersInWorkspace) {
      throw new Error(
        `Cannot subscribe to plan ${planCode}: new plan has less users allowed than currently in workspace.`
      );
    }
  }

  // Proceed to the termination of the active subscription (if any) and creation of the new one
  const newSubscription = await frontSequelize.transaction(async (t) => {
    if (activeSubscription) {
      const endedStatus = activeSubscription.stripeSubscriptionId
        ? "ended_backend_only"
        : "ended";

      await activeSubscription.update(
        {
          status: endedStatus,
          endDate: now,
        },
        { transaction: t }
      );
    }

    return Subscription.create(
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

  // Notify Stripe that we ended the subscription if the subscription was a paid one
  if (activeSubscription?.stripeSubscriptionId) {
    await cancelSubscriptionImmediately({
      stripeSubscriptionId: activeSubscription.stripeSubscriptionId,
    });
  }

  return renderSubscriptionFromModels({
    plan: newPlan,
    activeSubscription: newSubscription,
  });
};

/**
 * Internal function to create a PlanInvitation for the workspace.
 */
export const pokeUpgradeOrInviteWorkspaceToPlan = async (
  auth: Authenticator,
  planCode: string
): Promise<PlanInvitationType | void> => {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Cannot find workspace}");
  }

  if (!auth.isDustSuperUser()) {
    throw new Error("Cannot invite workspace to enterprise plan: not allowed.");
  }

  const newPlan = await Plan.findOne({
    where: { code: planCode },
  });
  if (!newPlan) {
    throw new Error(
      `Cannot invite workspace to plan ${planCode}: plan not found.`
    );
  }

  // We search for an active subscription for this workspace
  const activeSubscription = auth.subscription();
  if (activeSubscription && activeSubscription.plan.code === newPlan.code) {
    throw new Error(
      `Cannot subscribe to plan ${planCode}: already subscribed.`
    );
  }

  // If plan is a free plan, we subscribe immediately no need for an invitation
  if (newPlan.stripeProductId === null) {
    await internalSubscribeWorkspaceToFreePlan({
      workspaceId: owner.sId,
      planCode: newPlan.code,
    });
    return;
  }

  const invitation = await getPlanInvitation(auth);
  if (invitation?.planCode === newPlan.code) {
    return invitation;
  }

  const model = await frontSequelize.transaction(async (t) => {
    if (invitation) {
      await PlanInvitation.destroy({
        where: { workspaceId: owner.id, consumedAt: null },
        transaction: t,
      });
    }

    return PlanInvitation.create(
      {
        secret: uuidv4(),
        workspaceId: owner.id,
        planId: newPlan.id,
      },
      {
        transaction: t,
      }
    );
  });

  return {
    planCode: newPlan.code,
    planName: newPlan.name,
    secret: model.secret,
  };
};

// Returns the Stripe checkout URL for the plan the workspace can upgrade to.
// The plan can either be the "PRO_PLAN_SEAT_29_CODE" (aka the pro plan), or
// the enterprise plan the workspace has been invited to.
export const getCheckoutUrlForUpgrade = async (
  auth: Authenticator
): Promise<{ checkoutUrl: string; plan: PlanType }> => {
  const owner = auth.workspace();

  if (!owner) {
    throw new Error(
      "Unauthorized `auth` data: cannot process to subscription of new Plan."
    );
  }

  const planInvitation = await getPlanInvitation(auth);

  const planCode = planInvitation?.planCode ?? PRO_PLAN_SEAT_29_CODE;

  const plan = await Plan.findOne({
    where: { code: planCode },
  });

  if (!plan) {
    throw new Error(`Cannot subscribe to plan ${planCode}: not found.`);
  }
  if (!plan.stripeProductId) {
    throw new Error(
      `Cannot subscribe to plan ${planCode}: no Stripe Product ID.`
    );
  }
  if (plan.billingType === "free") {
    throw new Error(
      `Cannot subscribe to plan ${planCode}: billingType is "free".`
    );
  }

  const existingSubscription = auth.subscription();
  if (existingSubscription && existingSubscription.plan.code === plan.code) {
    throw new Error(
      `Cannot subscribe to pro plan ${planCode}: already subscribed.`
    );
  }

  // We enter Stripe Checkout flow
  const checkoutUrl = await createCheckoutSession({
    auth,
    planCode: plan.code,
  });

  if (!checkoutUrl) {
    throw new Error(
      `Cannot subscribe to plan ${planCode}: error while creating Stripe Checkout session (URL is null).`
    );
  }

  return {
    checkoutUrl,
    plan: renderPlanFromModel({ plan }),
  };
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
      throw new Error(
        "Cannot process update usage in subscription: workspace has no subscription."
      );
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
      stripeProductId: activeSubscription.plan.stripeProductId,
      quantity: activeSeats,
    });
  } catch (err) {
    logger.warn(
      `Error while updating Stripe subscription quantity for workspace ${workspaceId}: ${err}`
    );
  }
};

export const updateWorkspacePerMonthlyActiveUsersSubscriptionUsage = async ({
  owner,
  subscription,
}: {
  owner: WorkspaceType;
  subscription: SubscriptionType;
}): Promise<void> => {
  let redis = null;
  try {
    redis = await redisClient();
    if (subscription.plan.billingType !== "monthly_active_users") {
      // We only update the usage for plans with billingType === "monthly_active_users"
      return;
    }
    if (
      !subscription.stripeSubscriptionId ||
      !subscription.stripeCustomerId ||
      !subscription.plan.stripeProductId
    ) {
      throw new Error(
        "Cannot update usage in monthly_active_users subscription: missing Stripe subscription ID or Stripe customer ID."
      );
    }

    const redisKey = `workspace:usage:${owner.sId}`;
    const usageForWorkspace = await redis.get(redisKey);
    if (usageForWorkspace) {
      // If already reported usage for this workspace in the last hour we do nothing
      return;
    }

    const stripeSubscription = await getStripeSubscription(
      subscription.stripeSubscriptionId
    );

    if (!stripeSubscription) {
      throw new Error(
        `Cannot update usage in monthly_active_users subscription: Stripe subscription ${subscription.stripeSubscriptionId} not found.`
      );
    }
    const quantity = await countActiveUsersInWorkspaceSince({
      workspace: owner,
      since: new Date(stripeSubscription.current_period_start * 1000),
    });
    await updateStripeSubscriptionUsage({
      stripeSubscription,
      quantity,
    });

    // We store the usage in Redis to update Stripe only once per hour if mutliple messages are sent
    await redis.set(redisKey, quantity, {
      EX: 3600, // 1 hour
    });
  } catch (err) {
    logger.error(
      `Error while updating Stripe subscription usage for workspace ${owner.sId}: ${err}`
    );
  } finally {
    if (redis) {
      await redis.quit();
    }
  }
};

export async function getPlanInvitation(
  auth: Authenticator
): Promise<PlanInvitationType | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Cannot find workspace");
  }

  const planInvitations = await PlanInvitation.findAll({
    where: { workspaceId: owner.id, consumedAt: null },
    include: [
      {
        model: Plan,
        as: "plan",
        required: true,
      },
    ],
  });

  if (planInvitations.length > 1) {
    logger.warn(
      "unreachable: there should be at most one pending invitation per workspace"
    );
  }

  if (!planInvitations.length) {
    return null;
  }

  return {
    planCode: planInvitations[0].plan.code,
    planName: planInvitations[0].plan.name,
    secret: planInvitations[0].secret,
  };
}
