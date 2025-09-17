import type { Subscription } from "@app/lib/models/plan";
import type { PlanAttributes } from "@app/lib/plans/free_plans";
import type { PlanType, SubscriptionType } from "@app/types";

// Helper function to render PlanType from PlanAttributes
export function renderPlanFromModel({
  plan,
}: {
  plan: PlanAttributes;
}): PlanType {
  return {
    code: plan.code,
    name: plan.name,
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
        isSalesforceAllowed: plan.isManagedSalesforceAllowed,
      },
      dataSources: {
        count: plan.maxDataSourcesCount,
        documents: {
          count: plan.maxDataSourcesDocumentsCount,
          sizeMb: plan.maxDataSourcesDocumentsSizeMb,
        },
      },
      capabilities: {
        images: {
          maxImagesPerWeek: plan.maxImagesPerWeek,
        },
      },
      users: {
        maxUsers: plan.maxUsersInWorkspace,
        isSSOAllowed: plan.isSSOAllowed,
        isSCIMAllowed: plan.isSCIMAllowed,
      },
      vaults: {
        maxVaults: plan.maxVaultsInWorkspace,
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
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    sId: activeSubscription?.sId || null,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    stripeSubscriptionId: activeSubscription?.stripeSubscriptionId || null,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    startDate: activeSubscription?.startDate?.getTime() || null,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    endDate: activeSubscription?.endDate?.getTime() || null,
    paymentFailingSince:
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      activeSubscription?.paymentFailingSince?.getTime() || null,
    plan: renderPlanFromModel({ plan }),
    requestCancelAt: activeSubscription?.requestCancelAt?.getTime() ?? null,
  };
}
