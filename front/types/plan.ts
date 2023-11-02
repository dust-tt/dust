/**
 *  Expresses limits for usage of the product
 * Any positive number enforces the limit, -1 means no limit.
 * */

export type ManageDataSourcesLimitsType = {
  isSlackAllowed: boolean;
  isNotionAllowed: boolean;
  isGoogleDriveAllowed: boolean;
  isGithubAllowed: boolean;
};
export type LimitsType = {
  assistant: {
    isSlackBotAllowed: boolean;
    maxMessages: number;
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
};

export const FREE_BILLING_TYPES = ["free"] as const;
export const PAID_BILLING_TYPES = [
  "fixed",
  "monthly_active_users",
  "per_seat",
] as const;

export type FreeBillingType = (typeof FREE_BILLING_TYPES)[number];
export type PaidBillingType = (typeof PAID_BILLING_TYPES)[number];

export type PlanType = {
  code: string;
  name: string;
  status: "active" | "ended";
  subscriptionId: string | null; // null for the free test plan that is not in db
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  stripeProductId: string | null;
  billingType: FreeBillingType | PaidBillingType;
  startDate: number | null;
  endDate: number | null;
  limits: LimitsType;
};
