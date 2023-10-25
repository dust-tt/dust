import { Attributes } from "sequelize";

import { Plan } from "@app/lib/models";

export type PlanAttributes = Omit<
  Attributes<Plan>,
  "id" | "createdAt" | "updatedAt"
>;

/**
 * We have 2 FREE plans:
 * - The FREE_TEST plan, a free plan with strong limitations, used until the user subscribes to a paid plan.
 * - The FREE_UPGRADED plan, a free plan with no limitations that won't be users for users that are not Dust once we have paid plans.
 */

/**
 * Our TEST plan is our default plan, when no subscription is ON.
 * It is the only plan not stored in the database.
 */
export const FREE_TEST_PLAN_CODE = "FREE_TEST_PLAN";
export const FREE_TEST_PLAN_DATA: PlanAttributes = {
  code: FREE_TEST_PLAN_CODE,
  name: "Test",
  maxMessages: 100,
  maxUsersInWorkspace: 1,
  isSlackbotAllowed: false,
  isManagedSlackAllowed: false,
  isManagedNotionAllowed: false,
  isManagedGoogleDriveAllowed: false,
  isManagedGithubAllowed: false,
  maxNbStaticDataSources: 10,
  maxNbStaticDocuments: 10,
  maxSizeStaticDataSources: 2, // 2MB
};

/**
 * Other FREE plans are stored in the database.
 * We never remove anything from this list, we only add new plans and run a migration to create new subscriptions for them.
 */
export const FREE_UPGRADED_PLAN_CODE = "FREE_UPGRADED_PLAN";
const FREE_PLANS_DATA: PlanAttributes[] = [
  {
    code: FREE_UPGRADED_PLAN_CODE,
    name: "Free Trial",
    maxMessages: -1,
    maxUsersInWorkspace: -1,
    isSlackbotAllowed: true,
    isManagedSlackAllowed: true,
    isManagedNotionAllowed: true,
    isManagedGoogleDriveAllowed: true,
    isManagedGithubAllowed: true,
    maxNbStaticDataSources: -1,
    maxNbStaticDocuments: -1,
    maxSizeStaticDataSources: 2, // 2MB
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
