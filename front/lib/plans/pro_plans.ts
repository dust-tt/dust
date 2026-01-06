import type { Attributes } from "sequelize";

import { PlanModel } from "@app/lib/models/plan";
import {
  PRO_PLAN_SEAT_29_CODE,
  PRO_PLAN_SEAT_39_CODE,
} from "@app/lib/plans/plan_codes";
import { isDevelopment, isTest } from "@app/types";

export type PlanAttributes = Omit<
  Attributes<PlanModel>,
  "id" | "createdAt" | "updatedAt"
>;

/**
 * We have 3 categories of plans:
 * - Free: plans with no paid subscription.
 * - Pro: plans with a paid subscription, not tailored. -> i.e. the same plan is used by all Pro workspaces.
 * - Entreprise: plans with a paid subscription, tailored to the needs of the entreprise. -> i.e. we will have one plan per "Entreprise".
 *
 * This file about Pro plans.
 */

/**
 * Paid plans are stored in the database.
 * We can update existing plans or add new one but never remove anything from this list.
 * Entreprise custom plans will be created from Poké.
 */

const PRO_PLANS_DATA: PlanAttributes[] = [];

if (isDevelopment() || isTest()) {
  PRO_PLANS_DATA.push({
    code: PRO_PLAN_SEAT_29_CODE,
    name: "Pro",
    maxMessages: -1,
    maxMessagesTimeframe: "lifetime",
    isDeepDiveAllowed: true,
    maxImagesPerWeek: 100,
    maxUsersInWorkspace: 1000,
    maxVaultsInWorkspace: 1,
    isSlackbotAllowed: true,
    isManagedSlackAllowed: true,
    isManagedConfluenceAllowed: true,
    isManagedNotionAllowed: true,
    isManagedGoogleDriveAllowed: true,
    isManagedGithubAllowed: true,
    isManagedIntercomAllowed: true,
    isManagedWebCrawlerAllowed: true,
    isManagedSalesforceAllowed: false,
    isSSOAllowed: false,
    isSCIMAllowed: false,
    maxDataSourcesCount: -1,
    maxDataSourcesDocumentsCount: -1,
    maxDataSourcesDocumentsSizeMb: 2,
    trialPeriodDays: 14,
    canUseProduct: true,
  });
  PRO_PLANS_DATA.push({
    code: PRO_PLAN_SEAT_39_CODE,
    name: "Pro Business",
    maxMessages: -1,
    maxMessagesTimeframe: "lifetime",
    isDeepDiveAllowed: true,
    maxImagesPerWeek: 100,
    maxUsersInWorkspace: 1000,
    maxVaultsInWorkspace: 5,
    isSlackbotAllowed: true,
    isManagedSlackAllowed: true,
    isManagedConfluenceAllowed: true,
    isManagedNotionAllowed: true,
    isManagedGoogleDriveAllowed: true,
    isManagedGithubAllowed: true,
    isManagedIntercomAllowed: true,
    isManagedWebCrawlerAllowed: true,
    isManagedSalesforceAllowed: false,
    isSSOAllowed: true,
    isSCIMAllowed: false,
    maxDataSourcesCount: -1,
    maxDataSourcesDocumentsCount: -1,
    maxDataSourcesDocumentsSizeMb: 2,
    trialPeriodDays: 14,
    canUseProduct: true,
  });
}

/**
 * Function to call when we edit something in PRO_PLANS_DATA to update the database. It will create or update the plans.
 * @param planCode - Optional plan code to upsert. If not provided, all plans are upserted.
 */
export const upsertProPlans = async (planCode?: string) => {
  const plansToUpsert = planCode
    ? PRO_PLANS_DATA.filter((p) => p.code === planCode)
    : PRO_PLANS_DATA;

  for (const planData of plansToUpsert) {
    const plan = await PlanModel.findOne({
      where: {
        code: planData.code,
      },
    });
    if (plan === null) {
      await PlanModel.create(planData);
      // console.log(`Pro plan ${planData.code} created.`);
    } else {
      await plan.update(planData);
      // console.log(`Pro plan ${planData.code} updated.`);
    }
  }
};
