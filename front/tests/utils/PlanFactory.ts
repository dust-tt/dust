import { PlanModel } from "@app/lib/models/plan";
import type { CreationAttributes } from "sequelize";

export class PlanFactory {
  /**
   * Upsert an enterprise-tier plan and return the model. Idempotent on `code`
   * so it can be called from multiple tests sharing the same plan code.
   */
  static async enterprise(
    code = "ENT_TEST_PLAN",
    overrides: Partial<CreationAttributes<PlanModel>> = {}
  ): Promise<PlanModel> {
    const [plan] = await PlanModel.upsert({
      code,
      name: "Test Enterprise",
      maxMessages: -1,
      maxMessagesTimeframe: "lifetime",
      isDeepDiveAllowed: true,
      maxImagesPerWeek: 1000,
      maxUsersInWorkspace: 1000,
      maxFreeUsersInWorkspace: -1,
      maxLifetimeFreeUsersInWorkspace: -1,
      maxVaultsInWorkspace: 100,
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
      maxDataSourcesDocumentsSizeMb: 100,
      trialPeriodDays: 0,
      canUseProduct: true,
      isByok: false,
      ...overrides,
    });
    return plan;
  }
}
