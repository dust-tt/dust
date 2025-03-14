import * as t from "io-ts";
import { NonEmptyString } from "io-ts-types/lib/NonEmptyString";
import { NumberFromString } from "io-ts-types/lib/NumberFromString";

export const MAX_MESSAGE_TIMEFRAMES = ["day", "lifetime"] as const;
export type MaxMessagesTimeframeType = (typeof MAX_MESSAGE_TIMEFRAMES)[number];

export function isMaxMessagesTimeframeType(
  value: string
): value is MaxMessagesTimeframeType {
  return (MAX_MESSAGE_TIMEFRAMES as unknown as string[]).includes(value);
}

/**
 *  Expresses limits for usage of the product
 * Any positive number enforces the limit, -1 means no limit.
 * */
export type ManageDataSourcesLimitsType = {
  isConfluenceAllowed: boolean;
  isSlackAllowed: boolean;
  isNotionAllowed: boolean;
  isGoogleDriveAllowed: boolean;
  isGithubAllowed: boolean;
  isIntercomAllowed: boolean;
  isWebCrawlerAllowed: boolean;
};
export type LimitsType = {
  assistant: {
    isSlackBotAllowed: boolean;
    maxMessages: number;
    maxMessagesTimeframe: MaxMessagesTimeframeType;
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
  };
  vaults: {
    maxVaults: number;
  };
  canUseProduct: boolean;
};

export const SUBSCRIPTION_STATUSES = [
  "active",
  "ended",
  "ended_backend_only", // Ended on the backend but not yet propagated to Stripe
] as const;
export type SubscriptionStatusType = (typeof SUBSCRIPTION_STATUSES)[number];

export type PlanType = {
  code: string;
  name: string;
  limits: LimitsType;
  trialPeriodDays: number;
};

export type SubscriptionType = {
  // `null` for FREE_NO_PLAN which is the default plan when there is no Subscription in DB, which
  // means the workspace is not accessible.
  sId: string | null;
  status: SubscriptionStatusType;
  trialing: boolean;
  // `null` means that this is a free plan. Otherwise, it's a paid plan.
  stripeSubscriptionId: string | null;
  startDate: number | null;
  endDate: number | null;
  paymentFailingSince: number | null;
  plan: PlanType;
  requestCancelAt: number | null;
};

export type BillingPeriod = "monthly" | "yearly";

export type SubscriptionPerSeatPricing = {
  seatPrice: number;
  seatCurrency: string;
  billingPeriod: BillingPeriod;
  quantity: number;
};

export const CreatePlanFormSchema = t.type({
  code: NonEmptyString,
  name: NonEmptyString,
  isSlackbotAllowed: t.boolean,
  isSlackAllowed: t.boolean,
  isNotionAllowed: t.boolean,
  isGoogleDriveAllowed: t.boolean,
  isGithubAllowed: t.boolean,
  isIntercomAllowed: t.boolean,
  isConfluenceAllowed: t.boolean,
  isWebCrawlerAllowed: t.boolean,
  maxMessages: t.union([t.number, NumberFromString]),
  maxMessagesTimeframe: t.keyof({
    day: null,
    lifetime: null,
  }),
  dataSourcesCount: t.union([t.number, NumberFromString]),
  dataSourcesDocumentsCount: t.union([t.number, NumberFromString]),
  dataSourcesDocumentsSizeMb: t.union([t.number, NumberFromString]),
  maxUsers: t.union([t.number, NumberFromString]),
  maxVaults: t.union([t.number, NumberFromString]),
});

export type CreatePlanFormType = t.TypeOf<typeof CreatePlanFormSchema>;

export const EnterpriseUpgradeFormSchema = t.type({
  stripeSubscriptionId: NonEmptyString,
  planCode: NonEmptyString,
});

export type EnterpriseUpgradeFormType = t.TypeOf<
  typeof EnterpriseUpgradeFormSchema
>;
