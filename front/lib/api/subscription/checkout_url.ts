import assert from "node:assert";
import type {
  CheckoutBillingPeriod,
  CheckoutSeatType,
} from "@app/lib/api/checkout/types";
import { CheckoutSeatTypeSchema } from "@app/lib/api/checkout/types";
import { isMetronomeBillingEnabled } from "@app/lib/api/subscription";
import type { Authenticator } from "@app/lib/auth";
import {
  CP_MAX_SEAT_COST_MONTHLY,
  CP_MAX_SEAT_COST_YEARLY,
  CP_PRO_SEAT_COST_MONTHLY,
  CP_PRO_SEAT_COST_YEARLY,
} from "@app/lib/client/subscription";
import {
  BUSINESS_USD_PACKAGE_ALIAS,
  LEGACY_BUSINESS_PACKAGE_ALIAS,
  LEGACY_PRO_ANNUAL_PACKAGE_ALIAS,
  LEGACY_PRO_MONTHLY_PACKAGE_ALIAS,
} from "@app/lib/metronome/types";
import {
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
  PRO_PLAN_SEAT_29_CODE,
  PRO_PLAN_SEAT_39_CODE,
} from "@app/lib/plans/plan_codes";
import {
  createEmbeddedMetronomeSetupCheckoutSession,
  createStripeSubscriptionCheckoutSession,
  type SupportedPaymentMethod,
} from "@app/lib/plans/stripe";
import type { BillingPeriod, CheckoutUrlResult } from "@app/types/plan";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { z } from "zod";

export const PostSubscriptionRequestBody = z.object({
  billingPeriod: z.enum(["monthly", "yearly"]),
  couponCode: z.string().optional(),
  // CP self-serve checkout fields (only used when Metronome billing is enabled)
  seatType: CheckoutSeatTypeSchema.optional(),
  targetUserId: z.string().optional(),
});

export type CheckoutUrlError =
  | { type: "missing_cp_fields" }
  | { type: "already_on_pro_plan" };

type LegacyPlanParams = {
  planCode: string;
  allowedPaymentMethods: SupportedPaymentMethod[];
  metronomePackageAlias: string;
  isBusiness: boolean;
};

function resolveLegacyPlanParams(
  owner: { metadata?: { isBusiness?: boolean } | null },
  billingPeriod: BillingPeriod
): LegacyPlanParams {
  const isBusiness = !!owner.metadata?.isBusiness;
  return isBusiness
    ? {
        isBusiness: true,
        planCode: PRO_PLAN_SEAT_39_CODE,
        allowedPaymentMethods: [
          "card",
          "sepa_debit",
        ] satisfies SupportedPaymentMethod[],
        metronomePackageAlias: LEGACY_BUSINESS_PACKAGE_ALIAS,
      }
    : {
        isBusiness: false,
        planCode: PRO_PLAN_SEAT_29_CODE,
        allowedPaymentMethods: ["card"] satisfies SupportedPaymentMethod[],
        metronomePackageAlias:
          billingPeriod === "yearly"
            ? LEGACY_PRO_ANNUAL_PACKAGE_ALIAS
            : LEGACY_PRO_MONTHLY_PACKAGE_ALIAS,
      };
}

async function createCPCheckoutUrl(
  auth: Authenticator,
  {
    seatType,
    billingPeriod,
    targetUserId,
    couponCode,
  }: {
    seatType: CheckoutSeatType;
    billingPeriod: CheckoutBillingPeriod;
    targetUserId: string;
    couponCode?: string;
  }
): Promise<CheckoutUrlResult> {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser().toJSON();

  // Prices in USD cents. Yearly = per-month price × 12.
  const monthlyPrice =
    seatType === "pro" ? CP_PRO_SEAT_COST_MONTHLY : CP_MAX_SEAT_COST_MONTHLY;
  const yearlyMonthlyPrice =
    seatType === "pro" ? CP_PRO_SEAT_COST_YEARLY : CP_MAX_SEAT_COST_YEARLY;
  const pricePerSeatCents =
    billingPeriod === "monthly"
      ? monthlyPrice * 100
      : yearlyMonthlyPrice * 12 * 100;

  const { clientSecret, sessionId } =
    await createEmbeddedMetronomeSetupCheckoutSession({
      allowedPaymentMethods: ["card"],
      metronomePackageAlias: BUSINESS_USD_PACKAGE_ALIAS,
      owner,
      planCode: CREDIT_PRICED_BUSINESS_PLAN_CODE,
      billingPeriod,
      seatCount: 1,
      pricePerSeatCents,
      couponCode,
      user,
      seatType,
      targetUserId,
    });

  return { mode: "embedded", clientSecret, sessionId };
}

async function createLegacyStripeCheckoutUrl(
  auth: Authenticator,
  billingPeriod: BillingPeriod,
  planParams: LegacyPlanParams
): Promise<CheckoutUrlResult> {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser().toJSON();
  const { planCode, allowedPaymentMethods, metronomePackageAlias } = planParams;

  const checkoutUrl = await createStripeSubscriptionCheckoutSession({
    owner,
    user,
    billingPeriod,
    planCode,
    metronomePackageAlias,
    allowedPaymentMethods,
  });

  assert(
    checkoutUrl,
    `Cannot subscribe to plan ${planCode}: error while creating checkout session (URL is null).`
  );

  return { mode: "hosted", checkoutUrl };
}

export async function createCheckoutUrl(
  auth: Authenticator,
  {
    billingPeriod,
    couponCode,
    seatType,
    targetUserId,
  }: {
    billingPeriod: BillingPeriod;
    couponCode?: string;
    seatType?: CheckoutSeatType;
    targetUserId?: string;
  }
): Promise<Result<CheckoutUrlResult, CheckoutUrlError>> {
  const useMetronomeBilling = await isMetronomeBillingEnabled(auth);
  if (useMetronomeBilling) {
    if (!seatType || !targetUserId) {
      return new Err({ type: "missing_cp_fields" });
    }
    return new Ok(
      await createCPCheckoutUrl(auth, {
        seatType,
        billingPeriod,
        targetUserId,
        couponCode,
      })
    );
  }

  // Metronome billing is disabled here (otherwise the credit-priced checkout
  // above would have returned): fall back to the legacy Stripe checkout.
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.getNonNullableSubscriptionResource();

  const isAlreadyOnProPlan =
    await subscription.isSubscriptionOnProOrBusinessPlan(owner);
  if (isAlreadyOnProPlan) {
    return new Err({ type: "already_on_pro_plan" });
  }

  const planParams = resolveLegacyPlanParams(owner, billingPeriod);

  return new Ok(
    await createLegacyStripeCheckoutUrl(auth, billingPeriod, planParams)
  );
}
