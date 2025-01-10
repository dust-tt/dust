import { isDevelopment } from "@dust-tt/types";
import type { Attributes } from "sequelize";

import { Plan } from "@app/lib/models/plan";
import { PRO_PLAN_SEAT_29_CODE } from "@app/lib/plans/plan_codes";

export type PlanAttributes = Omit<
  Attributes<Plan>,
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

if (isDevelopment()) {
  PRO_PLANS_DATA.push({
    code: PRO_PLAN_SEAT_29_CODE,
    name: "Pro",
    maxMessages: -1,
    maxMessagesTimeframe: "lifetime",
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
    maxDataSourcesCount: -1,
    maxDataSourcesDocumentsCount: -1,
    maxDataSourcesDocumentsSizeMb: 2,
    trialPeriodDays: 14,
    canUseProduct: true,
  });
}

/**
 * Function to call when we edit something in FREE_PLANS_DATA to update the database. It will create or update the plans.
 */
export const upsertProPlans = async () => {
  for (const planData of PRO_PLANS_DATA) {
    const plan = await Plan.findOne({
      where: {
        code: planData.code,
      },
    });
    if (plan === null) {
      await Plan.create(planData);
      console.log(`Pro plan ${planData.code} created.`);
    } else {
      await plan.update(planData);
      console.log(`Pro plan ${planData.code} updated.`);
    }
  }
};
