import type { Attributes } from "sequelize";

import { Plan } from "@app/lib/models/plan";
import {
  FREE_NO_PLAN_CODE,
  FREE_TEST_PLAN_CODE,
  FREE_UPGRADED_PLAN_CODE,
} from "@app/lib/plans/plan_codes";

export type PlanAttributes = Omit<
  Attributes<Plan>,
  "id" | "createdAt" | "updatedAt"
>;

/**
 * We have 3 categories of plans:
 * - Free: plans with no paid subscription.
 * - Pro: plans with a paid subscription, not tailored. -> i.e. the same plan is used by all Pro
 *        workspaces.
 * - Entreprise: plans with a paid subscription, tailored to the needs of the entreprise.
 *               -> i.e. we will have one plan per "Entreprise".
 *
 * This file about Free plans.
 */

/**
 * FREE_NO_PLAN is the plan used for workspaces that are being created and have not yet subscribed
 * to a plan (card has not been entered yet for free trial). It prevents using the product entirely.
 */
export const FREE_NO_PLAN_DATA: PlanAttributes = {
  code: FREE_NO_PLAN_CODE,
  name: "No Plan",
  maxMessages: 0,
  maxMessagesTimeframe: "lifetime",
  maxUsersInWorkspace: 1,
  maxVaultsInWorkspace: 1,
  isSlackbotAllowed: false,
  isManagedConfluenceAllowed: false,
  isManagedSlackAllowed: false,
  isManagedNotionAllowed: false,
  isManagedGoogleDriveAllowed: false,
  isManagedGithubAllowed: false,
  isManagedIntercomAllowed: false,
  isManagedWebCrawlerAllowed: false,
  maxDataSourcesCount: 0,
  maxDataSourcesDocumentsCount: 0,
  maxDataSourcesDocumentsSizeMb: 0,
  trialPeriodDays: 0,
  canUseProduct: false,
};

/**
 * FREE plans are stored in the database.
 * We can update existing plans or add new one but never remove anything from this list.
 */
const FREE_PLANS_DATA: PlanAttributes[] = [
  {
    code: FREE_TEST_PLAN_CODE,
    name: "Free",
    maxMessages: 50,
    maxMessagesTimeframe: "lifetime",
    maxUsersInWorkspace: 1,
    maxVaultsInWorkspace: 1,
    isSlackbotAllowed: false,
    isManagedConfluenceAllowed: false,
    isManagedSlackAllowed: false,
    isManagedNotionAllowed: false,
    isManagedGoogleDriveAllowed: false,
    isManagedGithubAllowed: false,
    isManagedIntercomAllowed: false,
    isManagedWebCrawlerAllowed: false,
    maxDataSourcesCount: 5,
    maxDataSourcesDocumentsCount: 10,
    maxDataSourcesDocumentsSizeMb: 2,
    trialPeriodDays: 0,
    canUseProduct: true,
  },
  {
    code: FREE_UPGRADED_PLAN_CODE,
    name: "Free Trial",
    maxMessages: -1,
    maxUsersInWorkspace: -1,
    maxVaultsInWorkspace: -1,
    maxMessagesTimeframe: "lifetime",
    isSlackbotAllowed: true,
    isManagedConfluenceAllowed: true,
    isManagedSlackAllowed: true,
    isManagedNotionAllowed: true,
    isManagedGoogleDriveAllowed: true,
    isManagedGithubAllowed: true,
    isManagedIntercomAllowed: true,
    isManagedWebCrawlerAllowed: true,
    maxDataSourcesCount: -1,
    maxDataSourcesDocumentsCount: -1,
    maxDataSourcesDocumentsSizeMb: 2,
    trialPeriodDays: 0,
    canUseProduct: true,
  },
];

/**
 * Function to call when we edit something in FREE_PLANS_DATA to update the database. It will create or update the plans.
 */
export const upsertFreePlans = async () => {
  for (const planData of FREE_PLANS_DATA) {
    const plan = await Plan.findOne({
      where: {
        code: planData.code,
      },
    });
    if (plan === null) {
      await Plan.create(planData);
      console.log(`Free plan ${planData.code} created.`);
    } else {
      await plan.update(planData);
      console.log(`Free plan ${planData.code} updated.`);
    }
  }
};
