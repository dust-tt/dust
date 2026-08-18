import type { PlanType } from "@app/types/plan";

// Sync, in-memory factory for component tests. Unlike PlanFactory, this does
// not touch the database — use it from tests that render React components
// and only need a plausibly-shaped plan object.
export class LightPlanFactory {
  static build(overrides: Partial<PlanType> = {}): PlanType {
    return {
      code: "PRO_PLAN_SEAT_29",
      name: "Pro",
      limits: {
        assistant: {
          isSlackBotAllowed: true,
          maxMessages: -1,
          maxMessagesTimeframe: "lifetime",
          maxAwuCredits: -1,
          maxAwuCreditsTimeframe: "lifetime",
          isDeepDiveAllowed: true,
        },
        connections: {
          count: -1,
          isConfluenceAllowed: true,
          isSlackAllowed: true,
          isNotionAllowed: true,
          isGoogleDriveAllowed: true,
          isGithubAllowed: true,
          isIntercomAllowed: true,
          isWebCrawlerAllowed: true,
          isSalesforceAllowed: true,
        },
        dataSources: { count: -1, documents: { count: -1, sizeMb: -1 } },
        users: {
          maxUsers: -1,
          maxFreeUsers: -1,
          maxLifetimeFreeUsers: -1,
          isSSOAllowed: true,
          isSCIMAllowed: true,
        },
        vaults: { maxVaults: -1 },
        capabilities: { images: { maxImagesPerWeek: -1 } },
        canUseProduct: true,
      },
      trialPeriodDays: 0,
      isByok: false,
      isAuditLogsAllowed: true,
      hasAdvancedModelAccess: true,
      ...overrides,
    };
  }
}
