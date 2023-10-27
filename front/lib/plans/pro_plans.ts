import { Attributes } from "sequelize";

import { Plan } from "@app/lib/models";

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

// Current pro plans:
export const PRO_PLAN_MAU_29_CODE = "PRO_PLAN_MAU_29";
export const PRO_PLAN_FIXED_1000_CODE = "PRO_PLAN_FIXED_1000";

/**
 * Paid plans are stored in the database.
 * We can update existing plans or add new one but never remove anything from this list.
 * Entreprise custom plans will be created from Poké.
 */
const PRO_PLANS_DATA: PlanAttributes[] = [
  {
    code: "PRO_PLAN_MAU_29",
    name: "Pro",
    stripeProductId: "prod_OtB9SOIwFyiQnl",
    maxMessages: -1,
    maxUsersInWorkspace: 500,
    isSlackbotAllowed: true,
    isManagedSlackAllowed: true,
    isManagedNotionAllowed: true,
    isManagedGoogleDriveAllowed: true,
    isManagedGithubAllowed: true,
    // to remove
    maxNbStaticDataSources: -1,
    maxNbStaticDocuments: -1,
    maxSizeStaticDataSources: 2, // 2MB
    // to keep
    maxDataSourcesCount: -1,
    maxDataSourcesDocumentsCount: -1,
    maxDataSourcesDocumentsSizeMb: 2,
  },
  {
    code: "PRO_PLAN_FIXED_1000",
    name: "Pro Fixed",
    stripeProductId: "prod_OtBhelMswszehT",
    maxMessages: -1,
    maxUsersInWorkspace: 50,
    isSlackbotAllowed: true,
    isManagedSlackAllowed: true,
    isManagedNotionAllowed: true,
    isManagedGoogleDriveAllowed: true,
    isManagedGithubAllowed: true,
    // to remove
    maxNbStaticDataSources: -1,
    maxNbStaticDocuments: -1,
    maxSizeStaticDataSources: 2, // 2MB
    // to keep
    maxDataSourcesCount: -1,
    maxDataSourcesDocumentsCount: -1,
    maxDataSourcesDocumentsSizeMb: 2,
  },
];

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
