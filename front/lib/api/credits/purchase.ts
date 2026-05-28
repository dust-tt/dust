import { MAX_DISCOUNT_PERCENT } from "@app/lib/api/assistant/token_pricing";
import type { Authenticator } from "@app/lib/auth";
import type { CreditPurchaseBillingTarget } from "@app/lib/credits/committed";
import {
  createEnterpriseCreditPurchase,
  createProCreditPurchase,
} from "@app/lib/credits/committed";
import type { CreditPurchaseLimits } from "@app/lib/credits/limits";
import { getCreditPurchaseLimits } from "@app/lib/credits/limits";
import { getMetronomeCustomerStripeCustomerId } from "@app/lib/metronome/client";
import { resolveCurrencyForExistingMetronomeCustomer } from "@app/lib/metronome/contracts";
import { isEntreprisePlanPrefix } from "@app/lib/plans/plan_codes";
import {
  getCreditPurchasePriceId,
  getStripePricingData,
  getStripeSubscription,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import logger from "@app/logger/logger";
import type { SupportedCurrency } from "@app/types/currency";
import { isSupportedCurrency } from "@app/types/currency";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { StripePricingData } from "@app/types/stripe/pricing";

export type CreditPurchaseInfo = {
  isEnterprise: boolean;
  currency: string;
  discountPercent: number;
  creditPricing: StripePricingData | null;
  creditPurchaseLimits: CreditPurchaseLimits | null;
  billingCycleStartDay: number | null;
};

export class CreditPurchaseInfoError extends Error {
  constructor(readonly type: "subscription_not_found" | "internal") {
    super(type);
  }
}

export class CreateCreditPurchaseError extends Error {
  constructor(
    readonly type:
      | "subscription_not_found"
      | "purchase_not_allowed"
      | "amount_exceeds_limit"
      | "internal",
    readonly details: {
      reason?: "trialing" | "other";
      maxAmountMicroUsd?: number;
    } = {}
  ) {
    super(type);
  }
}

export type CreatedCreditPurchase = {
  creditsAddedMicroUsd: number;
  invoiceId: string | null;
  paymentUrl: string | null;
};

export async function getCreditPurchaseInfo(
  auth: Authenticator
): Promise<Result<CreditPurchaseInfo, CreditPurchaseInfoError>> {
  const subscription = auth.subscriptionResource();
  if (
    !subscription?.stripeSubscriptionId &&
    !subscription?.isMetronomeOnlyBilled
  ) {
    return new Err(new CreditPurchaseInfoError("subscription_not_found"));
  }

  const isMetronomeOnly = subscription.isMetronomeOnlyBilled;
  const workspace = auth.getNonNullableWorkspace();

  let isEnterprise = false;
  let currency = "usd";
  let creditPurchaseLimits: CreditPurchaseLimits | null = null;
  let billingCycleStartDay: number | null = null;

  if (isMetronomeOnly) {
    isEnterprise = isEntreprisePlanPrefix(subscription.getPlan().code);
    creditPurchaseLimits = await getCreditPurchaseLimits(auth, {
      type: "metronome",
      subscription,
    });

    if (workspace.metronomeCustomerId) {
      // Bill in the same currency as the contract / Stripe customer.
      const currencyResult = await resolveCurrencyForExistingMetronomeCustomer({
        metronomeCustomerId: workspace.metronomeCustomerId,
        stripeSubscriptionId: null,
      });
      if (currencyResult.isErr()) {
        logger.warn(
          {
            workspaceId: workspace.sId,
            error: currencyResult.error.message,
          },
          "[Credit Purchase] Failed to resolve currency for Metronome-only workspace"
        );
        return new Err(new CreditPurchaseInfoError("internal"));
      }
      currency = currencyResult.value;
    }

    if (subscription.startDate) {
      billingCycleStartDay = new Date(subscription.startDate).getUTCDate();
    }
  } else {
    const stripeSubscription = await getStripeSubscription(
      subscription.stripeSubscriptionId!
    );

    if (stripeSubscription) {
      isEnterprise = isEnterpriseSubscription(stripeSubscription);
      currency = isSupportedCurrency(stripeSubscription.currency)
        ? stripeSubscription.currency
        : "usd";
      creditPurchaseLimits = await getCreditPurchaseLimits(auth, {
        type: "stripe-subscription",
        stripeSubscription,
      });
    }

    // Use subscription.startDate to align with getBillingCycle used in the
    // header; fall back to Stripe's current period start.
    if (subscription.startDate) {
      billingCycleStartDay = new Date(subscription.startDate).getUTCDate();
    } else if (stripeSubscription?.current_period_start) {
      billingCycleStartDay = new Date(
        stripeSubscription.current_period_start * 1000
      ).getUTCDate();
    }
  }

  // Discount lives on `credit_usage_configuration` for credit-priced
  // (Metronome) workspaces and on `programmatic_usage_configuration` for
  // the legacy Stripe-billed programmatic-usage flow. The two stores are
  // never read from the other's code path.
  const discountPercent = isMetronomeOnly
    ? ((await CreditUsageConfigurationResource.fetchByWorkspaceId(auth))
        ?.defaultDiscountPercent ?? 0)
    : ((await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth))
        ?.defaultDiscountPercent ?? 0);

  const creditPricing = await getStripePricingData(getCreditPurchasePriceId());

  return new Ok({
    isEnterprise,
    currency,
    discountPercent,
    creditPricing,
    creditPurchaseLimits,
    billingCycleStartDay,
  });
}

export async function createCreditPurchase(
  auth: Authenticator,
  { amountDollars }: { amountDollars: number }
): Promise<Result<CreatedCreditPurchase, CreateCreditPurchaseError>> {
  const subscription = auth.subscriptionResource();
  if (
    !subscription?.stripeSubscriptionId &&
    !subscription?.isMetronomeOnlyBilled
  ) {
    return new Err(new CreateCreditPurchaseError("subscription_not_found"));
  }

  const isMetronomeOnly = subscription.isMetronomeOnlyBilled;
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();
  const amountMicroUsd = Math.round(amountDollars * 1_000_000);

  let isEnterprise: boolean;
  let limits: CreditPurchaseLimits;
  let metronomeStripeCustomerId: string | null = null;
  let metronomeCurrency: SupportedCurrency = "usd";

  if (isMetronomeOnly) {
    isEnterprise = isEntreprisePlanPrefix(subscription.getPlan().code);
    limits = await getCreditPurchaseLimits(auth, {
      type: "metronome",
      subscription,
    });

    if (!workspace.metronomeCustomerId) {
      logger.error(
        { workspaceId: workspace.sId },
        "[Credit Purchase] Metronome-only workspace has no metronomeCustomerId"
      );
      return new Err(new CreateCreditPurchaseError("internal"));
    }
    const stripeCustomerIdResult = await getMetronomeCustomerStripeCustomerId(
      workspace.metronomeCustomerId
    );
    if (stripeCustomerIdResult.isErr() || !stripeCustomerIdResult.value) {
      logger.error(
        {
          workspaceId: workspace.sId,
          metronomeCustomerId: workspace.metronomeCustomerId,
          error: stripeCustomerIdResult.isErr()
            ? stripeCustomerIdResult.error.message
            : "no stripe billing config",
        },
        "[Credit Purchase] Failed to resolve Stripe customer for Metronome-only workspace"
      );
      return new Err(new CreateCreditPurchaseError("internal"));
    }
    metronomeStripeCustomerId = stripeCustomerIdResult.value;

    const currencyResult = await resolveCurrencyForExistingMetronomeCustomer({
      metronomeCustomerId: workspace.metronomeCustomerId,
      stripeSubscriptionId: null,
    });
    if (currencyResult.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          error: currencyResult.error.message,
        },
        "[Credit Purchase] Failed to resolve currency for Metronome-only workspace"
      );
      return new Err(new CreateCreditPurchaseError("internal"));
    }
    metronomeCurrency = currencyResult.value;
  } else {
    const stripeSubscription = await getStripeSubscription(
      subscription.stripeSubscriptionId!
    );
    if (!stripeSubscription) {
      logger.error(
        {
          workspaceId: workspace.sId,
          stripeError: true,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
        },
        "Failed to retrieve Stripe subscription"
      );
      return new Err(new CreateCreditPurchaseError("subscription_not_found"));
    }
    isEnterprise = isEnterpriseSubscription(stripeSubscription);
    limits = await getCreditPurchaseLimits(auth, {
      type: "stripe-subscription",
      stripeSubscription,
    });
  }

  if (!limits.canPurchase) {
    return new Err(
      new CreateCreditPurchaseError("purchase_not_allowed", {
        reason: limits.reason === "trialing" ? "trialing" : "other",
      })
    );
  }

  if (amountMicroUsd > limits.maxAmountMicroUsd) {
    return new Err(
      new CreateCreditPurchaseError("amount_exceeds_limit", {
        maxAmountMicroUsd: limits.maxAmountMicroUsd,
      })
    );
  }

  // Same split as in `getCreditPurchaseInfo`: Metronome workspaces read
  // `credit_usage_configuration`; legacy Stripe-billed programmatic-usage
  // workspaces read `programmatic_usage_configuration`.
  const configuredDiscount = isMetronomeOnly
    ? (await CreditUsageConfigurationResource.fetchByWorkspaceId(auth))
        ?.defaultDiscountPercent
    : (await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth))
        ?.defaultDiscountPercent;
  let discountPercent =
    configuredDiscount && configuredDiscount > 0
      ? configuredDiscount
      : undefined;

  // Defense in depth: enforced at config level, but double-check here.
  if (discountPercent !== undefined && discountPercent > MAX_DISCOUNT_PERCENT) {
    logger.error(
      {
        workspaceId: workspace.sId,
        discountPercent,
        maxDiscountPercent: MAX_DISCOUNT_PERCENT,
      },
      "[Credit Purchase] Discount exceeds maximum allowed"
    );
    discountPercent = undefined;
  }

  const billingTarget: CreditPurchaseBillingTarget =
    isMetronomeOnly && metronomeStripeCustomerId
      ? {
          type: "metronome",
          stripeCustomerId: metronomeStripeCustomerId,
          currency: metronomeCurrency,
        }
      : {
          type: "stripe-subscription",
          stripeSubscriptionId: subscription.stripeSubscriptionId!,
        };

  if (isEnterprise) {
    const result = await createEnterpriseCreditPurchase({
      auth,
      billingTarget,
      amountMicroUsd,
      discountPercent,
      boughtByUserId: user.id,
    });

    if (result.isErr()) {
      return new Err(new CreateCreditPurchaseError("internal"));
    }

    return new Ok({
      creditsAddedMicroUsd: amountMicroUsd,
      invoiceId: null,
      paymentUrl: null,
    });
  }

  const result = await createProCreditPurchase({
    auth,
    billingTarget,
    amountMicroUsd,
    discountPercent,
    boughtByUserId: user.id,
  });

  if (result.isErr()) {
    return new Err(new CreateCreditPurchaseError("internal"));
  }

  return new Ok({
    creditsAddedMicroUsd: amountMicroUsd,
    invoiceId: result.value.invoiceId,
    paymentUrl: result.value.paymentUrl,
  });
}
