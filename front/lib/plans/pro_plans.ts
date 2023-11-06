import { Attributes } from "sequelize";

import { isDevelopment } from "@app/lib/development";
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
export const PRO_PLAN_CODE = "PRO_PLAN_SEAT_29";

/**
 * Paid plans are stored in the database.
 * We can update existing plans or add new one but never remove anything from this list.
 * Entreprise custom plans will be created from Poké.
 */

const PRO_PLANS_DATA: PlanAttributes[] = [];

if (isDevelopment()) {
  PRO_PLANS_DATA.push({
    code: PRO_PLAN_CODE,
    name: "Pro",
    stripeProductId: "prod_OwKvN4XrUwFw5a",
    billingType: "per_seat",
    maxMessages: -1,
    maxUsersInWorkspace: 1000,
    isSlackbotAllowed: true,
    isManagedSlackAllowed: true,
    isManagedNotionAllowed: true,
    isManagedGoogleDriveAllowed: true,
    isManagedGithubAllowed: true,
    maxDataSourcesCount: -1,
    maxDataSourcesDocumentsCount: -1,
    maxDataSourcesDocumentsSizeMb: 2,
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
