import type { CheckoutUrlResult, SubscriptionType } from "@app/types/plan";
import { z } from "zod";

export const PatchSubscriptionRequestBody = z.object({
  action: z.enum(["cancel_free_trial", "pay_now", "upgrade_to_business"]),
});

type CheckoutStatus =
  | { status: "success" }
  | { status: "error"; message: string }
  | { status: "pending" };

export type GetCheckoutStatusResponseBody = CheckoutStatus;

export type PostSubscriptionResponseBody = CheckoutUrlResult;

export type GetSubscriptionsResponseBody = {
  subscriptions: SubscriptionType[];
};

export type GetSubscriptionTrialInfoResponseBody = {
  trialDaysRemaining: number | null;
};
