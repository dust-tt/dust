import { PlanModel } from "@app/lib/models/plan";
import {
  CREDIT_PRICED_BUSINESS_LEGACY_LARGE_PLAN_CODE,
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
  CREDIT_PRICED_ENTERPRISE_DEFAULT_PLAN_CODE,
  CREDIT_PRICED_FREE_PLAN_CODE,
} from "@app/lib/plans/plan_codes";
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
    maxAwuCredits: -1,
    maxAwuCreditsTimeframe: "lifetime",
    isDeepDiveAllowed: true,
    // Ignored at enforcement: credit-priced plans have no weekly image cap
    // (see checkImageGenerationRateLimit).
    maxImagesPerWeek: 100,
    maxUsersInWorkspace: 100,
    maxFreeUsersInWorkspace: 100,
    maxLifetimeFreeUsersInWorkspace: 100,
    maxVaultsInWorkspace: 5,
    isSlackbotAllowed: true,
    isManagedSlackAllowed: true,
    isManagedConfluenceAllowed: true,
    isManagedNotionAllowed: true,
    isManagedGoogleDriveAllowed: true,
    isManagedGithubAllowed: true,
    isManagedIntercomAllowed: true,
    isManagedWebCrawlerAllowed: true,
    isManagedSalesforceAllowed: true,
    isSSOAllowed: false,
    isSCIMAllowed: false,
    isAuditLogsAllowed: false,
    maxDataSourcesCount: 3,
    maxDataSourcesDocumentsCount: -1,
    maxDataSourcesDocumentsSizeMb: 2,
    trialPeriodDays: 14,
    canUseProduct: true,
    isByok: false,
    hasAdvancedModelAccess: false,
  });
  // Business variant with limits permissive enough to fit any legacy PRO_* plan
  // (max of PRO_PLAN_SEAT_29 / PRO_PLAN_SEAT_39): unlimited free users and data
  // sources, 1000 seats, SSO allowed. Used to migrate legacy Pro workspaces that
  // exceed the standard Business plan limits without downgrading them.
  CREDIT_PRICED_PLANS_DATA.push({
    code: CREDIT_PRICED_BUSINESS_LEGACY_LARGE_PLAN_CODE,
    name: "Business (Legacy Large)",
    maxMessages: -1,
    maxMessagesTimeframe: "lifetime",
    maxAwuCredits: -1,
    maxAwuCreditsTimeframe: "lifetime",
    isDeepDiveAllowed: true,
    // Ignored at enforcement: credit-priced plans have no weekly image cap
    // (see checkImageGenerationRateLimit).
    maxImagesPerWeek: 100,
    maxUsersInWorkspace: 1000,
    maxFreeUsersInWorkspace: -1,
    maxLifetimeFreeUsersInWorkspace: -1,
    // Prod PRO_PLAN_SEAT_39 allows 15 spaces (the seed values above are stale),
    // so the legacy-large variant must allow at least that to fit any PRO_*.
    maxVaultsInWorkspace: 15,
    isSlackbotAllowed: true,
    isManagedSlackAllowed: true,
    isManagedConfluenceAllowed: true,
    isManagedNotionAllowed: true,
    isManagedGoogleDriveAllowed: true,
    isManagedGithubAllowed: true,
    isManagedIntercomAllowed: true,
    isManagedWebCrawlerAllowed: true,
    isManagedSalesforceAllowed: true,
    isSSOAllowed: true,
    isSCIMAllowed: false,
    isAuditLogsAllowed: false,
    maxDataSourcesCount: -1,
    maxDataSourcesDocumentsCount: -1,
    maxDataSourcesDocumentsSizeMb: 5,
    trialPeriodDays: 14,
    canUseProduct: true,
    isByok: false,
    hasAdvancedModelAccess: false,
  });
  CREDIT_PRICED_PLANS_DATA.push({
    code: CREDIT_PRICED_FREE_PLAN_CODE,
    name: "Free",
    maxMessages: -1,
    maxMessagesTimeframe: "lifetime",
    maxAwuCredits: -1,
    maxAwuCreditsTimeframe: "lifetime",
    isDeepDiveAllowed: true,
    maxUsersInWorkspace: 5,
    maxFreeUsersInWorkspace: 5,
    maxLifetimeFreeUsersInWorkspace: 5,
    maxVaultsInWorkspace: 5,
    // Ignored at enforcement: credit-priced plans have no weekly image cap
    // (see checkImageGenerationRateLimit).
    maxImagesPerWeek: 100,
    isSlackbotAllowed: true,
    isManagedConfluenceAllowed: true,
    isManagedSlackAllowed: true,
    isManagedNotionAllowed: true,
    isManagedGoogleDriveAllowed: true,
    isManagedGithubAllowed: true,
    isManagedIntercomAllowed: true,
    isManagedWebCrawlerAllowed: true,
    isManagedSalesforceAllowed: true,
    isSSOAllowed: false,
    isSCIMAllowed: false,
    isAuditLogsAllowed: false,
    maxDataSourcesCount: 3,
    maxDataSourcesDocumentsCount: -1,
    maxDataSourcesDocumentsSizeMb: 2,
    trialPeriodDays: 0,
    canUseProduct: true,
    isByok: false,
    hasAdvancedModelAccess: false,
  });
  CREDIT_PRICED_PLANS_DATA.push({
    code: CREDIT_PRICED_ENTERPRISE_DEFAULT_PLAN_CODE,
    name: "Enterprise",
    maxMessages: -1,
    maxMessagesTimeframe: "lifetime",
    maxAwuCredits: -1,
    maxAwuCreditsTimeframe: "lifetime",
    isDeepDiveAllowed: true,
    // Ignored at enforcement: credit-priced plans have no weekly image cap
    // (see checkImageGenerationRateLimit).
    maxImagesPerWeek: 100,
    maxUsersInWorkspace: -1,
    maxFreeUsersInWorkspace: -1,
    maxLifetimeFreeUsersInWorkspace: -1,
    maxVaultsInWorkspace: 500,
    isSlackbotAllowed: true,
    isManagedSlackAllowed: true,
    isManagedConfluenceAllowed: true,
    isManagedNotionAllowed: true,
    isManagedGoogleDriveAllowed: true,
    isManagedGithubAllowed: true,
    isManagedIntercomAllowed: true,
    isManagedWebCrawlerAllowed: true,
    isManagedSalesforceAllowed: true,
    isSSOAllowed: true,
    isSCIMAllowed: true,
    isAuditLogsAllowed: true,
    maxDataSourcesCount: -1,
    maxDataSourcesDocumentsCount: -1,
    maxDataSourcesDocumentsSizeMb: 2,
    trialPeriodDays: 0,
    canUseProduct: true,
    isByok: false,
    hasAdvancedModelAccess: false,
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
