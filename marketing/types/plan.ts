export type BillingPeriod = "monthly" | "yearly";

export type MaxMessagesTimeframeType = "day" | "lifetime";

export type ManageDataSourcesLimitsType = {
  isConfluenceAllowed: boolean;
  isSlackAllowed: boolean;
  isNotionAllowed: boolean;
  isGoogleDriveAllowed: boolean;
  isGithubAllowed: boolean;
  isIntercomAllowed: boolean;
  isWebCrawlerAllowed: boolean;
  isSalesforceAllowed: boolean;
};

export type LimitsType = {
  assistant: {
    isSlackBotAllowed: boolean;
    maxMessages: number;
    maxMessagesTimeframe: MaxMessagesTimeframeType;
    isDeepDiveAllowed: boolean;
  };
  connections: ManageDataSourcesLimitsType;
  dataSources: {
    count: number;
    documents: {
      count: number;
      sizeMb: number;
    };
  };
  users: {
    maxUsers: number;
    maxFreeUsers: number;
    maxLifetimeFreeUsers: number;
    isSSOAllowed: boolean;
    isSCIMAllowed: boolean;
  };
  vaults: {
    maxVaults: number;
  };
  capabilities: {
    images: {
      maxImagesPerWeek: number;
    };
  };
  canUseProduct: boolean;
};

export type PlanType = {
  code: string;
  name: string;
  limits: LimitsType;
  trialPeriodDays: number;
  isByok: boolean;
  isAuditLogsAllowed: boolean;
};
