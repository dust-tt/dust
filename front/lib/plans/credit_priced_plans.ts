import { PlanModel } from "@app/lib/models/plan";
import { CREDIT_PRICED_BUSINESS_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { isDevelopment, isTest } from "@app/types/shared/env";
import type { Attributes } from "sequelize";

export type PlanAttributes = Omit<
  Attributes<PlanModel>,
  "id" | "createdAt" | "updatedAt"
>;

/**
 * This file introduces new credit-priced plans living entirely in the new world.
 */

/**
 * Paid plans are stored in the database.
 * We can update existing plans or add new one but never remove anything from this list.
 * Entreprise custom plans will be created from Poké.
 */

const CREDIT_PRICED_PLANS_DATA: PlanAttributes[] = [];

if (isDevelopment() || isTest()) {
  CREDIT_PRICED_PLANS_DATA.push({
    code: CREDIT_PRICED_BUSINESS_PLAN_CODE,
    name: "Business",
    maxMessages: -1,
    maxMessagesTimeframe: "lifetime",
    isDeepDiveAllowed: true,
    maxImagesPerWeek: 100,
    maxUsersInWorkspace: 1000,
    maxFreeUsersInWorkspace: -1,
    maxLifetimeFreeUsersInWorkspace: -1,
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
    isAuditLogsAllowed: false,
    maxDataSourcesCount: -1,
    maxDataSourcesDocumentsCount: -1,
    maxDataSourcesDocumentsSizeMb: 2,
    trialPeriodDays: 14,
    canUseProduct: true,
    isByok: false,
  });
}

/**
 * Function to call when we edit something in PRO_PLANS_DATA to update the database. It will create or update the plans.
 * Uses atomic upsert to avoid race conditions when called concurrently (e.g., in parallel tests).
 * @param planCode - Optional plan code to upsert. If not provided, all plans are upserted.
 */
export const upsertCreditPricedPlans = async (planCode?: string) => {
  const plansToUpsert = planCode
    ? CREDIT_PRICED_PLANS_DATA.filter((p) => p.code === planCode)
    : CREDIT_PRICED_PLANS_DATA;

  for (const planData of plansToUpsert) {
    await PlanModel.upsert(planData, {
      conflictFields: ["code"],
    });
  }
};
