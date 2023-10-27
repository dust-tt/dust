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
 * This file about Free plans.
 */

// Current free plans:
export const FREE_TEST_PLAN_CODE = "FREE_TEST_PLAN";
export const FREE_UPGRADED_PLAN_CODE = "FREE_UPGRADED_PLAN";

/**
 * FREE_TEST plan is our default plan: this is the plan used by all workspaces until they subscribe to a plan.
 * It is not stored in the database (as we don't create a subsription).
 */
export const FREE_TEST_PLAN_DATA: PlanAttributes = {
  code: FREE_TEST_PLAN_CODE,
  name: "Test",
  stripeProductId: null,
  maxMessages: 100,
  maxUsersInWorkspace: 1,
  isSlackbotAllowed: false,
  isManagedSlackAllowed: false,
  isManagedNotionAllowed: false,
  isManagedGoogleDriveAllowed: false,
  isManagedGithubAllowed: false,

  // to remove
  maxNbStaticDataSources: 10,
  maxNbStaticDocuments: 50,
  maxSizeStaticDataSources: 2, // 2MB
  // to keep
  maxDataSourcesCount: 10,
  maxDataSourcesDocumentsCount: 10,
  maxDataSourcesDocumentsSizeMb: 2,
};

/**
 * Other FREE plans are stored in the database.
 * We can update existing plans or add new one but never remove anything from this list.
 */
const FREE_PLANS_DATA: PlanAttributes[] = [
  {
    code: FREE_UPGRADED_PLAN_CODE,
    name: "Free Trial",
    stripeProductId: null,
    maxMessages: -1,
    maxUsersInWorkspace: -1,
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
