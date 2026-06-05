import { isCreditPricedPlanPrefix } from "@app/lib/plans/plan_codes";
import { z } from "zod";

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

export const SUBSCRIPTION_STATUSES = [
  "active",
  "created_backend_only", // Provisioned in DB, waiting on contract.start to flip to "active"
  "ended",
  "ended_backend_only", // Ended on the backend but not yet propagated to Stripe
] as const;
export type SubscriptionStatusType = (typeof SUBSCRIPTION_STATUSES)[number];

export type PlanType = {
  code: string;
  name: string;
  limits: LimitsType;
  trialPeriodDays: number;
  isByok: boolean;
  isAuditLogsAllowed: boolean;
};

export type SubscriptionType = {
  // `null` for FREE_NO_PLAN which is the default plan when there is no Subscription in DB, which
  // means the workspace is not accessible.
  sId: string | null;
  status: SubscriptionStatusType;
  trialing: boolean;
  // `null` means that this is a free plan. Otherwise, it's a paid plan.
  stripeSubscriptionId: string | null;
  metronomeContractId: string | null;
  startDate: number | null;
  endDate: number | null;
  paymentFailingSince: number | null;
  plan: PlanType;
  requestCancelAt: number | null;
};

type StripeBilledSubscriptionType = SubscriptionType & {
  stripeSubscriptionId: string;
};

type MetronomeBilledSubscriptionType = SubscriptionType & {
  stripeSubscriptionId: null;
  metronomeContractId: string;
};

export function isSubscriptionStripeBilled(
  subscription: SubscriptionType
): subscription is StripeBilledSubscriptionType {
  return subscription.stripeSubscriptionId !== null;
}

export function isSubscriptionMetronomeBilled(
  subscription: SubscriptionType
): subscription is MetronomeBilledSubscriptionType {
  return (
    subscription.metronomeContractId !== null &&
    !isSubscriptionStripeBilled(subscription)
  );
}

/**
 * Returns true if the workspace is on a credit-priced plan.
 *
 * Credit-priced plans are prefixed by CP_ by convention.
 *
 * - isCreditPricedPlan && isSubscriptionMetronomeBilled: new credit-priced plans.
 * - isCredeitPricedPlan && !isSubscriptionMetronomeBilled: no possible.
 * - !isCreditPricedPlan && !isSubscriptionStripeBilled: Legacy PRO/Business (before transition to
 *   metronome) and Enterprise before renewal
 * - !isCreditPricedPlan && isSubscriptionStripeBilled: Legacy PRO/Business (after transition to
 *   metronome)
 */
export function isCreditPricedPlan(plan: PlanType): boolean {
  return isCreditPricedPlanPrefix(plan.code);
}

export type BillingPeriod = "monthly" | "yearly";

export type SubscriptionPerSeatPricing = {
  seatPrice: number;
  seatCurrency: string;
  billingPeriod: BillingPeriod;
  quantity: number;
};

export const EnterpriseUpgradeFormSchema = z.object({
  planCode: z.string().min(1),
  freeCreditsOverrideEnabled: z.boolean(),
  paygEnabled: z.boolean(),
  stripeSubscriptionId: z.string().min(1).optional(),
  // For the Metronome path: id of the Metronome package the customer will
  // be placed on, plus a timestamp at least one hour in the future
  // when the new contracts starts (and the existing contract sunsets),
  // and the Stripe customer ID to link as the Metronome billing provider.
  metronomePackageId: z.string().min(1).optional(),
  startingAt: z.string().min(1).optional(),
  stripeCustomerId: z.string().min(1).optional(),
  freeCreditsDollars: z.number().optional(),
  defaultDiscountPercent: z.number().optional(),
  paygCapDollars: z.number().optional(),
});

export type EnterpriseUpgradeFormType = z.infer<
  typeof EnterpriseUpgradeFormSchema
>;

export const FreePlanUpgradeFormSchema = z.object({
  planCode: z.string().min(1),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD date string")
    .optional(),
});

export type FreePlanUpgradeFormType = z.infer<typeof FreePlanUpgradeFormSchema>;

export type CheckoutUrlResult =
  | { mode: "hosted"; checkoutUrl: string }
  | { mode: "embedded"; clientSecret: string; sessionId: string };
