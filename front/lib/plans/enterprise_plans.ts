import { ENT_PLAN_FAKE_CODE } from "@app/lib/plans/plan_codes";
import type { PlanAttributes } from "@app/lib/resources/plan_resource";

/**
 * We have 3 categories of plans:
 * - Free: plans with no paid subscription.
 * - Pro: plans with a paid subscription, not tailored. -> i.e. the same plan is used by all Pro workspaces.
 * - Entreprise: plans with a paid subscription, tailored to the needs of the entreprise. -> i.e. we will have one plan per "Entreprise".
 *
 * This file about Entreprise plans.
 * As entreprise plans are custom, we won't create them in this file, but directly from Poké.
 */

export const ENT_PLAN_FAKE_DATA: PlanAttributes = {
  code: ENT_PLAN_FAKE_CODE,
  name: "Entreprise",
  maxMessages: -1,
  maxMessagesTimeframe: "lifetime",
  maxUsersInWorkspace: -1,
  maxVaultsInWorkspace: -1,
  isSlackbotAllowed: true,
  isManagedConfluenceAllowed: true,
  isManagedSlackAllowed: true,
  isManagedNotionAllowed: true,
  isManagedGoogleDriveAllowed: true,
  isManagedGithubAllowed: true,
  isManagedIntercomAllowed: true,
  isManagedWebCrawlerAllowed: true,
  isManagedSalesforceAllowed: true,
  maxDataSourcesCount: -1,
  maxDataSourcesDocumentsCount: -1,
  maxDataSourcesDocumentsSizeMb: 2,
  trialPeriodDays: 0,
  canUseProduct: true,
};
