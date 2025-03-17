import * as t from "io-ts";
export declare const MAX_MESSAGE_TIMEFRAMES: readonly ["day", "lifetime"];
export type MaxMessagesTimeframeType = (typeof MAX_MESSAGE_TIMEFRAMES)[number];
export declare function isMaxMessagesTimeframeType(value: string): value is MaxMessagesTimeframeType;
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
export declare const SUBSCRIPTION_STATUSES: readonly ["active", "ended", "ended_backend_only"];
export type SubscriptionStatusType = (typeof SUBSCRIPTION_STATUSES)[number];
export type PlanType = {
    code: string;
    name: string;
    limits: LimitsType;
    trialPeriodDays: number;
};
export type SubscriptionType = {
    sId: string | null;
    status: SubscriptionStatusType;
    trialing: boolean;
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
export declare const CreatePlanFormSchema: t.TypeC<{
    code: import("io-ts-types/lib/NonEmptyString").NonEmptyStringC;
    name: import("io-ts-types/lib/NonEmptyString").NonEmptyStringC;
    isSlackbotAllowed: t.BooleanC;
    isSlackAllowed: t.BooleanC;
    isNotionAllowed: t.BooleanC;
    isGoogleDriveAllowed: t.BooleanC;
    isGithubAllowed: t.BooleanC;
    isIntercomAllowed: t.BooleanC;
    isConfluenceAllowed: t.BooleanC;
    isWebCrawlerAllowed: t.BooleanC;
    maxMessages: t.UnionC<[t.NumberC, import("io-ts-types/lib/NumberFromString").NumberFromStringC]>;
    maxMessagesTimeframe: t.KeyofC<{
        day: null;
        lifetime: null;
    }>;
    dataSourcesCount: t.UnionC<[t.NumberC, import("io-ts-types/lib/NumberFromString").NumberFromStringC]>;
    dataSourcesDocumentsCount: t.UnionC<[t.NumberC, import("io-ts-types/lib/NumberFromString").NumberFromStringC]>;
    dataSourcesDocumentsSizeMb: t.UnionC<[t.NumberC, import("io-ts-types/lib/NumberFromString").NumberFromStringC]>;
    maxUsers: t.UnionC<[t.NumberC, import("io-ts-types/lib/NumberFromString").NumberFromStringC]>;
    maxVaults: t.UnionC<[t.NumberC, import("io-ts-types/lib/NumberFromString").NumberFromStringC]>;
}>;
export type CreatePlanFormType = t.TypeOf<typeof CreatePlanFormSchema>;
export declare const EnterpriseUpgradeFormSchema: t.TypeC<{
    stripeSubscriptionId: import("io-ts-types/lib/NonEmptyString").NonEmptyStringC;
    planCode: import("io-ts-types/lib/NonEmptyString").NonEmptyStringC;
}>;
export type EnterpriseUpgradeFormType = t.TypeOf<typeof EnterpriseUpgradeFormSchema>;
//# sourceMappingURL=plan.d.ts.map