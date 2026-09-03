import type { CheckoutSeatType } from "@app/lib/api/checkout/types";
import config from "@app/lib/api/config";
import { countActiveSeatsForWorkspace } from "@app/lib/api/workspace_seats";
import { getMetronomeCustomerStripeCustomerId } from "@app/lib/metronome/client";
import { CONTRACT_CREDIT_TYPE_POOL } from "@app/lib/metronome/constants";
import { PlanModel, SubscriptionModel } from "@app/lib/models/plan";
import { isOldFreePlan } from "@app/lib/plans/plan_codes";
import { PHONE_TRIAL_ENABLED } from "@app/lib/plans/trial/constants";
import {
  isEnterpriseReportUsage,
  isMauReportUsage,
  isSupportedReportUsage,
  SUPPORTED_REPORT_USAGE,
} from "@app/lib/plans/usage/types";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { DEFAULT_AUTO_INVOICE_FINALIZATION_ENABLED } from "@app/lib/resources/storage/models/credit_usage_configurations";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import type { SupportedCurrency } from "@app/types/currency";
import { SUPPORTED_CURRENCIES } from "@app/types/currency";
import type { BillingPeriod, SubscriptionType } from "@app/types/plan";
import { isDevelopment } from "@app/types/shared/env";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type { StripePricingData } from "@app/types/stripe/pricing";
import type {
  LightWorkspaceType,
  UserType,
  WorkspaceType,
} from "@app/types/user";
import assert from "assert";
import { Stripe } from "stripe";

const DEV_PRO_PLAN_PRODUCT_ID = "prod_OwKvN4XrUwFw5a";
const DEV_BUSINESS_PRO_PLAN_PRODUCT_ID = "prod_RkNr4qbHJD3oUp";

const PROD_PRO_PLAN_PRODUCT_ID = "prod_OwALjyfxfi2mln";
const PROD_BUSINESS_PRO_PLAN_PRODUCT_ID = "prod_RkPFpfBzLo79gd";

export function getProPlanProductId() {
  return isDevelopment() ? DEV_PRO_PLAN_PRODUCT_ID : PROD_PRO_PLAN_PRODUCT_ID;
}

export function getBusinessProPlanProductId() {
  return isDevelopment()
    ? DEV_BUSINESS_PRO_PLAN_PRODUCT_ID
    : PROD_BUSINESS_PRO_PLAN_PRODUCT_ID;
}

function getStripeCheckoutSessionProductId(owner: WorkspaceType) {
  const isBusiness = owner.metadata?.isBusiness;
  return isBusiness ? getBusinessProPlanProductId() : getProPlanProductId();
}

export function getCreditPurchasePriceId() {
  const devCreditPurchasePriceId = "price_1SUoyQDKd2JRwZF6FBHIGbwC";
  const prodCreditPurchasePriceId = "price_1SVYsjDKd2JRwZF6zdIW29mC";

  return isDevelopment() ? devCreditPurchasePriceId : prodCreditPurchasePriceId;
}

function getPAYGCreditPriceId() {
  const devPAYGPriceId = "price_1SZviPDKd2JRwZF6XHCzjgqp";
  const prodPAYGPriceId = "price_1SZvmdDKd2JRwZF64DE4tZ6c";

  return isDevelopment() ? devPAYGPriceId : prodPAYGPriceId;
}

export const getStripeClient = () => {
  return new Stripe(config.getStripeSecretKey(), {
    apiVersion: "2023-10-16",
    typescript: true,
  });
};

export async function getStripePricingData(
  priceId: string
): Promise<StripePricingData | null> {
  const stripe = getStripeClient();
  const price = await stripe.prices.retrieve(priceId, {
    expand: ["currency_options"],
  });

  if (!price.unit_amount || !price.currency_options) {
    logger.error(
      { priceId },
      "[Stripe] Credit purchase price missing unit_amount or currency_options"
    );
    return null;
  }

  const currencyOptions: StripePricingData["currencyOptions"] = {
    usd: { unitAmount: 0 },
    eur: { unitAmount: 0 },
    gbp: { unitAmount: 0 },
  };

  for (const currency of SUPPORTED_CURRENCIES) {
    const currencyOption = price.currency_options[currency];
    const unitAmount = currencyOption
      ? Number(currencyOption.unit_amount ?? currencyOption.unit_amount_decimal)
      : 0;
    if (unitAmount) {
      currencyOptions[currency] = {
        unitAmount,
      };
    } else {
      logger.error(
        { priceId, currency, stripeError: true },
        "[Stripe] Currency option not configured"
      );
    }
  }

  assert(
    currencyOptions.usd.unitAmount > 0,
    "no USD currency option found for price"
  );

  return { currencyOptions };
}

/**
 * Calls the Stripe API to get the price ID for a given product ID.
 * We use prices metata to find the default price for a given product.
 * For the Pro plan, the metadata are "IS_DEFAULT_YEARLY_PRICE" and "IS_DEFAULT_MONHTLY_PRICE" and are set to "true".
 */
async function getDefautPriceFromMetadata(
  productId: string,
  key: string
): Promise<string | null> {
  const stripe = getStripeClient();
  const prices = await stripe.prices.list({ product: productId, active: true });
  for (const price of prices.data) {
    if (
      price.metadata &&
      key in price.metadata &&
      price.metadata[key] === "true"
    ) {
      return price.id;
    }
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SUPPORTED_PAYMENT_METHODS = ["card", "sepa_debit"] as const;

export const ENTERPRISE_N30_PAYMENTS_DAYS = 30;

// We allow for 3 retries of invoices (not counting first payment)
// before we give up, void the invoice and remove resources pending payment on Dust
// At the time of writing, this is only used for Credit Purchase self-serve flow
export const MAX_PRO_INVOICE_ATTEMPTS_BEFORE_VOIDED = 3;

export type SupportedPaymentMethod = (typeof SUPPORTED_PAYMENT_METHODS)[number];

/**
 * Calls the Stripe API to create a pro plan checkout session for a given workspace.
 * We return the URL of the checkout session.
 * Once the users has completed the checkout, we will receive an event on our Stripe webhook
 * The `auth` role is not checked, because we allow anyone (even if not logged in or not part of the WS)
 * to go through the checkout process.
 */
export const createStripeSubscriptionCheckoutSession = async ({
  allowedPaymentMethods = ["card"],
  billingPeriod,
  metronomePackageAlias,
  owner,
  planCode,
  user,
}: {
  allowedPaymentMethods?: SupportedPaymentMethod[];
  billingPeriod: BillingPeriod;
  metronomePackageAlias?: string;
  owner: WorkspaceType;
  planCode: string;
  user: UserType;
}): Promise<string | null> => {
  const stripe = getStripeClient();

  const plan = await PlanModel.findOne({ where: { code: planCode } });
  if (!plan) {
    throw new Error(
      `Cannot create checkout session for plan ${planCode}: plan not found.`
    );
  }

  const stripeProductId = getStripeCheckoutSessionProductId(owner);
  let priceId: string | null = null;

  if (billingPeriod === "yearly") {
    priceId = await getDefautPriceFromMetadata(
      stripeProductId,
      "IS_DEFAULT_YEARLY_PRICE"
    );
  } else {
    priceId = await getDefautPriceFromMetadata(
      stripeProductId,
      "IS_DEFAULT_MONHTLY_PRICE"
    );
  }

  if (!priceId) {
    throw new Error(
      `Cannot subscribe to plan ${planCode}: price not found for product ${stripeProductId}.`
    );
  }

  // Determine if Stripe trial is allowed.
  // When phone trial is enabled, we don't offer Stripe trials (users get phone trial instead).
  // When phone trial is disabled, we allow Stripe trial only if the workspace never had a
  // subscription before (except for the grandfathered old free plan).
  let stripeTrialDays: number | undefined = undefined;
  if (!PHONE_TRIAL_ENABLED && plan.trialPeriodDays) {
    const existingSubscription = await SubscriptionModel.findOne({
      where: { workspaceId: owner.id },
      include: [PlanModel],
    });
    const trialAllowed =
      !existingSubscription || isOldFreePlan(existingSubscription.plan.code);
    if (trialAllowed) {
      stripeTrialDays = plan.trialPeriodDays;
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    client_reference_id: owner.sId,
    customer_email: user.email,
    payment_method_types: allowedPaymentMethods,
    subscription_data: {
      metadata: {
        planCode: planCode,
        workspaceId: owner.sId,
      },
      trial_period_days: stripeTrialDays,
    },
    metadata: {
      planCode: planCode,
      userId: user.sId,
      ...(metronomePackageAlias ? { metronomePackageAlias } : {}),
    },
    line_items: [
      {
        price: priceId,
        quantity: await countActiveSeatsForWorkspace(owner.sId),
      },
    ],
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    automatic_tax: {
      enabled: true,
    },
    tax_id_collection: {
      enabled: true,
    },
    success_url: `${config.getAppUrl()}/w/${owner.sId}/subscription/payment_processing?type=succeeded&session_id={CHECKOUT_SESSION_ID}&plan_code=${planCode}`,
    cancel_url: `${config.getAppUrl()}/w/${owner.sId}/subscription?type=cancelled`,
    consent_collection: {
      terms_of_service: "required",
    },
    custom_text: {
      terms_of_service_acceptance: {
        message:
          "I have read and accept the [Master Services Agreement](https://dust-tt.notion.site/Master-Services-Agreement-2bdcf30156db4a40bcb20d27b0b1bd4e?pvs=4) and [Data Processing Addendum](https://dust-tt.notion.site/Data-Processing-Addendum-466528e861e34f08949428e06eecd5f4?pvs=4).",
      },
    },
  });

  return session.url;
};

/**
 * Creates an Embedded Stripe Checkout session in "setup" mode for Metronome-billed workspaces.
 * This captures the payment method without creating a Stripe subscription.
 * After checkout, the webhook provisions a Metronome customer + contract.
 */
export const createEmbeddedMetronomeSetupCheckoutSession = async ({
  allowedPaymentMethods = ["card"],
  metronomePackageAlias,
  owner,
  planCode,
  billingPeriod,
  seatCount,
  pricePerSeatCents,
  couponCode,
  user,
  seatType,
  targetUserId,
}: {
  allowedPaymentMethods?: SupportedPaymentMethod[];
  metronomePackageAlias: string;
  owner: WorkspaceType;
  planCode: string;
  billingPeriod: string;
  seatCount?: number;
  pricePerSeatCents?: number;
  couponCode?: string;
  user: UserType;
  seatType?: CheckoutSeatType;
  targetUserId?: string;
}): Promise<{ clientSecret: string; sessionId: string }> => {
  const stripe = getStripeClient();

  const metadata: Record<string, string> = {
    planCode,
    userId: user.sId,
    metronomePackageAlias,
    billingPeriod,
  };

  if (seatCount !== undefined) {
    metadata.seatCount = String(seatCount);
  }
  if (pricePerSeatCents !== undefined) {
    metadata.pricePerSeatCents = String(pricePerSeatCents);
  }
  if (couponCode) {
    metadata.couponCode = couponCode;
  }
  if (seatType) {
    metadata.seatType = seatType;
  }
  if (targetUserId) {
    metadata.targetUserId = targetUserId;
  }

  const session = await stripe.checkout.sessions.create({
    ui_mode: "embedded",
    mode: "setup",
    client_reference_id: owner.sId,
    customer_email: user.email,
    customer_creation: "always",
    payment_method_types: allowedPaymentMethods,
    metadata,
    billing_address_collection: "required",
    tax_id_collection: {
      enabled: true,
    },
    redirect_on_completion: "if_required",
    return_url: (() => {
      const params = new URLSearchParams({
        billingPeriod,
        setup_session_id: "{CHECKOUT_SESSION_ID}",
      });
      if (seatType) {
        params.set("seatType", seatType);
      }
      if (targetUserId) {
        params.set("targetUserId", targetUserId);
      }
      return `${config.getAppUrl()}/w/${owner.sId}/subscription/checkout?${params.toString()}`;
    })(),
    consent_collection: {
      terms_of_service: "required",
    },
    custom_text: {
      terms_of_service_acceptance: {
        message:
          "I have read and accept the [Master Services Agreement](https://dust-tt.notion.site/Master-Services-Agreement-2bdcf30156db4a40bcb20d27b0b1bd4e?pvs=4) and [Data Processing Addendum](https://dust-tt.notion.site/Data-Processing-Addendum-466528e861e34f08949428e06eecd5f4?pvs=4).",
      },
    },
  });

  if (!session.client_secret) {
    throw new Error("Stripe embedded checkout session missing client_secret.");
  }

  return { clientSecret: session.client_secret, sessionId: session.id };
};

export async function calculateTax({
  stripeCustomerId,
  amountCents,
  currency,
}: {
  stripeCustomerId: string;
  amountCents: number;
  currency: SupportedCurrency;
}): Promise<
  Result<{ taxCents: number; totalCents: number }, { error_message: string }>
> {
  const stripe = getStripeClient();
  try {
    const calculation = await stripe.tax.calculations.create({
      currency,
      customer: stripeCustomerId,
      line_items: [{ amount: amountCents, reference: "subscription" }],
    });
    return new Ok({
      taxCents: calculation.tax_amount_exclusive,
      totalCents: calculation.amount_total,
    });
  } catch (error) {
    logger.error(
      {
        stripeCustomerId,
        stripeError: true,
        error: normalizeError(error).message,
      },
      "[Stripe] Failed to calculate tax"
    );
    return new Err({
      error_message: `Failed to calculate tax: ${normalizeError(error).message}`,
    });
  }
}

export async function setStripeCustomerDefaultPaymentMethod({
  stripeCustomerId,
  paymentMethodId,
  workspaceId,
}: {
  stripeCustomerId: string;
  paymentMethodId: string;
  workspaceId: string;
}): Promise<Result<void, { error_message: string }>> {
  const stripe = getStripeClient();
  try {
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    return new Ok(undefined);
  } catch (error) {
    logger.error(
      {
        workspaceId,
        stripeCustomerId,
        stripeError: true,
        error: normalizeError(error).message,
      },
      "[Stripe] Failed to set default payment method on Stripe customer"
    );
    return new Err({
      error_message: normalizeError(error).message,
    });
  }
}

/**
 * Ensure the Stripe customer has a default payment method
 * (`invoice_settings.default_payment_method`). A paid Stripe subscription can
 * keep its card on the subscription without the customer having a default;
 * Metronome bills the customer's default, so a missing one makes Metronome
 * invoices fail. No-op when a default is already set; otherwise adopt the
 * subscription's payment method (or, failing that, the customer's most recent
 * card). Returns the resolved default (null when none could be found to set).
 */
export async function ensureStripeCustomerDefaultPaymentMethod({
  stripeCustomerId,
  stripeSubscription,
  workspaceId,
}: {
  stripeCustomerId: string;
  stripeSubscription: Stripe.Subscription;
  workspaceId: string;
}): Promise<
  Result<
    { defaultPaymentMethodId: string | null; updated: boolean },
    { error_message: string }
  >
> {
  const stripe = getStripeClient();
  const customer = await getStripeCustomer(stripeCustomerId);
  if (!customer) {
    return new Err({
      error_message: `Stripe customer not found: ${stripeCustomerId}.`,
    });
  }

  const existing = customer.invoice_settings?.default_payment_method;
  if (existing) {
    return new Ok({
      defaultPaymentMethodId: isString(existing) ? existing : existing.id,
      updated: false,
    });
  }

  // Adopt the subscription's payment method, else the customer's most recent card.
  let paymentMethodId = getDefaultPaymentMethodId(stripeSubscription);
  if (!paymentMethodId) {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: "card",
      limit: 1,
    });
    paymentMethodId = paymentMethods.data[0]?.id;
  }
  if (!paymentMethodId) {
    logger.warn(
      { workspaceId, stripeCustomerId },
      "[Stripe] No payment method available to set as customer default"
    );
    return new Ok({ defaultPaymentMethodId: null, updated: false });
  }

  const result = await setStripeCustomerDefaultPaymentMethod({
    stripeCustomerId,
    paymentMethodId,
    workspaceId,
  });
  if (result.isErr()) {
    return new Err(result.error);
  }
  return new Ok({ defaultPaymentMethodId: paymentMethodId, updated: true });
}

/**
 * Calls the Stripe API to create a customer portal session for a given workspace/plan.
 * This allows the user to access her Stripe dashbaord without having to log in on Stripe.
 */
export const createCustomerPortalSession = async ({
  owner,
  subscription,
}: {
  owner: WorkspaceType;
  subscription: SubscriptionType;
}): Promise<string | null> => {
  const stripe = getStripeClient();

  const stripeCustomerIdRes = await getBillingStripeCustomerId({
    owner,
    subscription,
  });
  if (stripeCustomerIdRes.isErr()) {
    throw stripeCustomerIdRes.error;
  }
  if (!stripeCustomerIdRes.value) {
    throw new Error(
      `No Stripe subscription or Metronome customer for the workspace: ${owner.sId}`
    );
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerIdRes.value,
    return_url: `${config.getAppUrl()}/w/${owner.sId}/subscription`,
  });

  return portalSession.url;
};

export async function getBillingStripeCustomerId({
  owner,
  subscription,
}: {
  owner: WorkspaceType;
  subscription: SubscriptionType;
}): Promise<Result<string | null, Error>> {
  if (subscription.stripeSubscriptionId) {
    const stripeSubscription = await getStripeSubscription(
      subscription.stripeSubscriptionId
    );
    if (!stripeSubscription) {
      return new Err(
        new Error(`No stripeSubscription found for workspace ${owner.sId}.`)
      );
    }

    return new Ok(getCustomerId(stripeSubscription));
  }

  if (owner.metronomeCustomerId) {
    const result = await getMetronomeCustomerStripeCustomerId(
      owner.metronomeCustomerId
    );
    if (result.isErr()) {
      return new Err(
        new Error(
          `Failed to resolve Stripe customer for Metronome workspace ` +
            `${owner.sId}: ${result.error.message}`
        )
      );
    }

    return new Ok(result.value);
  }

  return new Ok(null);
}

/**
 * Calls the Stripe API to retrieve a product by its ID.
 */
export const getProduct = async (
  productId: string
): Promise<Stripe.Product> => {
  const stripe = getStripeClient();
  const product = await stripe.products.retrieve(productId);
  return product;
};

/**
 * Calls the Stripe API to retrieve a subscription by its ID.
 */
export const getStripeSubscription = async (
  stripeSubscriptionId: string,
  { expandPriceCurrencyOptions }: { expandPriceCurrencyOptions?: boolean } = {}
): Promise<Stripe.Subscription | null> => {
  const stripe = getStripeClient();
  try {
    if (expandPriceCurrencyOptions) {
      return await stripe.subscriptions.retrieve(stripeSubscriptionId, {
        expand: ["items.data.price.currency_options"],
      });
    } else {
      return await stripe.subscriptions.retrieve(stripeSubscriptionId);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
  } catch (error) {
    return null;
  }
};

/**
 * Calls the Stripe API to retrieve a customer by its ID. Returns `null` when
 * the customer cannot be retrieved or has been deleted.
 */
export const getStripeCustomer = async (
  stripeCustomerId: string
): Promise<Stripe.Customer | null> => {
  const stripe = getStripeClient();
  try {
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    if (customer.deleted) {
      return null;
    }
    return customer;
  } catch {
    return null;
  }
};

export async function getSubscriptionInvoices({
  subscriptionId,
  status,
  createdSinceDate,
}: {
  subscriptionId: string;
  status?: Stripe.InvoiceListParams["status"];
  createdSinceDate: Date;
}): Promise<Stripe.Invoice[]> {
  const stripe = getStripeClient();
  const invoices = await stripe.invoices.list({
    subscription: subscriptionId,
    status,
    created: { gte: Math.floor(createdSinceDate.getTime() / 1000) },
  });
  return invoices.data.filter(
    (inv) =>
      inv.billing_reason === "subscription_cycle" ||
      inv.billing_reason === "subscription_create" ||
      inv.billing_reason === "subscription_update"
  );
}

const DAY_IN_SECONDS = 24 * 60 * 60;

export const extendStripeSubscriptionTrial = async (
  stripeSubscriptionId: string,
  { days }: { days: number }
): Promise<Result<{ trialEnd: number | null }, Error>> => {
  const stripe = getStripeClient();
  const subscription = await getStripeSubscription(stripeSubscriptionId);
  if (!subscription) {
    return new Err(new Error("The subscription does not exist."));
  }

  if (!subscription.trial_end) {
    return new Err(new Error("The subscription is not in trial."));
  }

  const newTrialEnd = Math.floor(Date.now() / 1000) + days * DAY_IN_SECONDS;

  const updatedSubscription = await stripe.subscriptions.update(
    stripeSubscriptionId,
    {
      trial_end: newTrialEnd,
      proration_behavior: "none",
    }
  );

  return new Ok({ trialEnd: updatedSubscription.trial_end });
};

/**
 * Calls the Stripe API to update the quantity of a subscription. Used for
 * subscription items with prices of type "licensed" (that is, per seat).
 * https://stripe.com/docs/billing/subscriptions/upgrade-downgrade
 */
const updateStripeQuantityForSubscriptionItem = async (
  subscriptionItem: Stripe.SubscriptionItem,
  quantity: number
): Promise<void> => {
  const stripe = getStripeClient();
  const currentQuantity = subscriptionItem.quantity;

  if (currentQuantity === quantity) {
    // No need to update the subscription
    return;
  }

  await stripe.subscriptionItems.update(subscriptionItem.id, {
    quantity,
  });
};

/**
 * Calls the Stripe API to update the usage of a subscription.
 * Used for our metered prices.
 * For those plans Stripe price is configured with: "Usage type = Metered usage, Aggregation mode = Last value during period"
 * https://stripe.com/docs/products-prices/pricing-models#reporting-usage
 */
export async function updateStripeActiveUsersForSubscriptionItem(
  subscriptionItem: Stripe.SubscriptionItem,
  quantity: number
) {
  const stripe = getStripeClient();
  await stripe.subscriptionItems.createUsageRecord(subscriptionItem.id, {
    // We do not send a timestamp, because we want to use the current time.
    // We use action = "set" to override the previous usage (as opposed to "increment")
    action: "set",
    quantity,
  });
}

/**
 *
 * Move a subscription from a free trial state to a paying state,
 * immediately charging the customer.
 */
export async function skipSubscriptionFreeTrial({
  stripeSubscriptionId,
}: {
  stripeSubscriptionId: string;
}) {
  const stripe = getStripeClient();
  return stripe.subscriptions.update(stripeSubscriptionId, {
    trial_end: "now",
  });
}

/**
 * Cancel a subscription immediately,
 * without waiting for the end of the billing period.
 */
export async function cancelSubscriptionImmediately({
  stripeSubscriptionId,
}: {
  stripeSubscriptionId: string;
}) {
  const stripe = getStripeClient();
  await stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: false,
  });
  await stripe.subscriptions.cancel(stripeSubscriptionId, { prorate: true });

  return true;
}

/**
 * Cancel a subscription at the end of the current period,
 * allowing users to retain access until that time.
 */
export async function cancelSubscriptionAtPeriodEnd({
  stripeSubscriptionId,
}: {
  stripeSubscriptionId: string;
}) {
  const stripe = getStripeClient();
  await stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  return true;
}

/**
 * Schedule a subscription to cancel at a future timestamp. Used by the
 * switch_contract flow when migrating a Stripe-billed workspace to Metronome:
 * the Stripe sub stops at the new Metronome contract's start time, so the two
 * rails don't double-bill. Prorations at cancellation follow the subscription's
 * existing proration settings (default: a credit for the unused portion).
 */
export async function scheduleSubscriptionCancellation({
  stripeSubscriptionId,
  cancelAt,
}: {
  stripeSubscriptionId: string;
  cancelAt: Date;
}) {
  const stripe = getStripeClient();
  await stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at: Math.floor(cancelAt.getTime() / 1000),
  });

  return true;
}

/**
 * Clear a previously scheduled cancellation (the reverse of
 * `scheduleSubscriptionCancellation`). Used when a pending contract switch is
 * cancelled so the current Stripe subscription keeps running instead of
 * stopping at the (now abandoned) swap time.
 */
export async function clearScheduledSubscriptionCancellation({
  stripeSubscriptionId,
}: {
  stripeSubscriptionId: string;
}): Promise<Result<void, Error>> {
  try {
    const stripe = getStripeClient();
    await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at: null,
    });
    return new Ok(undefined);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

// Marks a Stripe subscription (via metadata) as cut short by the legacy →
// Business yearly migration, so the `customer.subscription.deleted` webhook
// knows to refund the unused prepaid days when it ends.
export const YEARLY_MIGRATION_REFUND_METADATA_KEY =
  "dust_yearly_migration_refund";

export async function markSubscriptionForMigrationRefund({
  stripeSubscriptionId,
}: {
  stripeSubscriptionId: string;
}): Promise<Result<void, Error>> {
  try {
    const stripe = getStripeClient();
    await stripe.subscriptions.update(stripeSubscriptionId, {
      metadata: { [YEARLY_MIGRATION_REFUND_METADATA_KEY]: "true" },
    });
    return new Ok(undefined);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/**
 * Refund the unused prepaid time of a yearly subscription that was cut over
 * early by the migration. Prorated on remaining days, where the paid period is
 * taken from the invoice's yearly line item (NOT the subscription's
 * `current_period_*`, which Stripe clamps to the cancel date):
 *   refund = amountPaid × (paidPeriodEnd − actualEnd) / (paidPeriodEnd − paidPeriodStart)
 *
 * Only acts when the subscription is yearly, carries the migration-refund
 * marker, ended before its paid period end, and its latest invoice was paid.
 * The refund is issued against that invoice's charge and bounded by the amount
 * paid. After refunding to the card, reverses the matching unused-time credit
 * Stripe auto-adds to the customer balance, so the customer isn't refunded
 * twice. Returns the refunded amount in cents (0 when nothing to refund).
 */
export async function refundYearlyMigrationProration({
  stripeSubscription,
}: {
  stripeSubscription: Stripe.Subscription;
}): Promise<Result<{ refundedCents: number }, Error>> {
  try {
    const stripe = getStripeClient();

    // Only subscriptions marked by the migration are refund candidates; every
    // other subscription.deleted returns silently.
    if (
      stripeSubscription.metadata?.[YEARLY_MIGRATION_REFUND_METADATA_KEY] !==
      "true"
    ) {
      return new Ok({ refundedCents: 0 });
    }
    const isYearly = stripeSubscription.items.data.some(
      (item) => item.price.recurring?.interval === "year"
    );
    if (!isYearly) {
      logger.warn(
        { stripeSubscriptionId: stripeSubscription.id },
        "[Stripe] Yearly migration refund: marked sub is not yearly, skipping"
      );
      return new Ok({ refundedCents: 0 });
    }

    const latestInvoiceId =
      typeof stripeSubscription.latest_invoice === "string"
        ? stripeSubscription.latest_invoice
        : (stripeSubscription.latest_invoice?.id ?? null);
    if (!latestInvoiceId) {
      logger.warn(
        { stripeSubscriptionId: stripeSubscription.id },
        "[Stripe] Yearly migration refund: no latest invoice, skipping"
      );
      return new Ok({ refundedCents: 0 });
    }
    const invoice = await stripe.invoices.retrieve(latestInvoiceId);

    // Anchor the proration on the ACTUALLY-PAID coverage window, taken from the
    // invoice's yearly line item(s). We can't use `subscription.current_period_*`
    // here: once a cancellation is scheduled, Stripe clamps `current_period_end`
    // to the cancel date, so `remaining` would read 0 and no refund would fire.
    const yearlyLines = invoice.lines.data.filter(
      (line) => line.price?.recurring?.interval === "year"
    );
    const paidPeriodStartSec =
      yearlyLines.length > 0
        ? Math.min(...yearlyLines.map((line) => line.period.start))
        : stripeSubscription.current_period_start;
    const paidPeriodEndSec =
      yearlyLines.length > 0
        ? Math.max(...yearlyLines.map((line) => line.period.end))
        : stripeSubscription.current_period_end;

    const actualEndSec =
      stripeSubscription.ended_at ??
      stripeSubscription.canceled_at ??
      Math.floor(Date.now() / 1000);
    const periodSec = paidPeriodEndSec - paidPeriodStartSec;
    const remainingSec = paidPeriodEndSec - actualEndSec;
    if (periodSec <= 0 || remainingSec <= 0) {
      logger.info(
        {
          stripeSubscriptionId: stripeSubscription.id,
          periodSec,
          remainingSec,
        },
        "[Stripe] Yearly migration refund: no prepaid days remaining, skipping"
      );
      return new Ok({ refundedCents: 0 });
    }

    const chargeId =
      typeof invoice.charge === "string" ? invoice.charge : invoice.charge?.id;
    if (!chargeId) {
      logger.warn(
        { stripeSubscriptionId: stripeSubscription.id, invoiceId: invoice.id },
        "[Stripe] Yearly migration refund: invoice has no charge, skipping"
      );
      return new Ok({ refundedCents: 0 });
    }

    // Verify the charge was actually paid (and not already fully refunded)
    // before refunding anything.
    const charge = await stripe.charges.retrieve(chargeId);
    if (!charge.paid || charge.status !== "succeeded") {
      logger.warn(
        {
          stripeSubscriptionId: stripeSubscription.id,
          chargeId,
          chargePaid: charge.paid,
          chargeStatus: charge.status,
        },
        "[Stripe] Yearly migration refund: charge not paid, skipping"
      );
      return new Ok({ refundedCents: 0 });
    }
    const refundableCents = charge.amount - charge.amount_refunded;
    const proratedCents = Math.round(
      (charge.amount * remainingSec) / periodSec
    );
    const refundedCents = Math.min(refundableCents, proratedCents);

    // Always log the refund attempt for a marked sub, with the computed amount.
    logger.info(
      {
        stripeSubscriptionId: stripeSubscription.id,
        chargeId,
        chargeAmount: charge.amount,
        alreadyRefunded: charge.amount_refunded,
        remainingDays: Math.ceil(remainingSec / 86400),
        proratedCents,
        refundedCents,
      },
      refundedCents > 0
        ? "[Stripe] Issuing yearly migration prorated refund"
        : "[Stripe] Yearly migration refund: nothing left to refund, skipping"
    );
    if (refundedCents <= 0) {
      return new Ok({ refundedCents: 0 });
    }
    await stripe.refunds.create({ charge: chargeId, amount: refundedCents });

    // When the scheduled cancellation fired, Stripe credited the unused time to
    // the customer's balance (store credit that would offset a future
    // Metronome-pushed invoice). We've now refunded that same unused time to the
    // card, so remove the matching credit — otherwise the customer is refunded
    // twice. Bounded by the credit actually present, so we never push the
    // customer into a debit if no (or a smaller) credit was created.
    await reverseMigrationBalanceCredit({
      stripeSubscription,
      refundedCents,
      currency: charge.currency,
    });

    return new Ok({ refundedCents });
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/**
 * Remove up to `refundedCents` of credit from the customer's Stripe balance,
 * used after a yearly-migration card refund to cancel out the unused-time
 * credit Stripe auto-creates on cancellation (so the customer isn't refunded
 * twice — once to the card, once as balance credit). No-op when the customer
 * has no credit balance. Best-effort: logs and swallows failures so a balance
 * hiccup never blocks the (already-issued) refund.
 */
async function reverseMigrationBalanceCredit({
  stripeSubscription,
  refundedCents,
  currency,
}: {
  stripeSubscription: Stripe.Subscription;
  refundedCents: number;
  currency: string;
}): Promise<void> {
  const stripe = getStripeClient();
  const stripeCustomerId = getCustomerId(stripeSubscription);
  const customer = await getStripeCustomer(stripeCustomerId);
  // A negative balance is credit owed to the customer (offsets future invoices).
  const creditCents = customer && customer.balance < 0 ? -customer.balance : 0;
  const reverseCents = Math.min(creditCents, refundedCents);
  if (reverseCents <= 0) {
    logger.info(
      { stripeSubscriptionId: stripeSubscription.id, stripeCustomerId },
      "[Stripe] Yearly migration refund: no balance credit to reverse"
    );
    return;
  }
  try {
    // A positive amount debits the customer, bringing a credit balance back
    // toward zero.
    await stripe.customers.createBalanceTransaction(stripeCustomerId, {
      amount: reverseCents,
      currency,
      description:
        "Reversed unused-time credit: refunded to card (legacy → Business yearly migration)",
    });
    logger.info(
      {
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId,
        reverseCents,
      },
      "[Stripe] Yearly migration refund: reversed unused-time balance credit"
    );
  } catch (err) {
    logger.error(
      {
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId,
        reverseCents,
        err: normalizeError(err).message,
      },
      "[Stripe] Yearly migration refund: failed to reverse balance credit (refund already issued)"
    );
  }
}

/**
 * Creates a new Stripe Business subscription for upgrading Pro → Business.
 * The old subscription is cancelled separately after the DB flip.
 */
export async function createStripeBusinessSubscription({
  stripeSubscriptionId,
  owner,
  planCode,
}: {
  stripeSubscriptionId: string;
  owner: WorkspaceType;
  planCode: string;
}): Promise<Result<{ stripeSubscriptionId: string }, Error>> {
  const stripe = getStripeClient();

  const existingSubscription =
    await getStripeSubscription(stripeSubscriptionId);
  if (!existingSubscription) {
    return new Err(new Error("Existing subscription not found"));
  }

  const businessProductId = getBusinessProPlanProductId();
  const newPriceId = await getDefautPriceFromMetadata(
    businessProductId,
    "IS_DEFAULT_MONHTLY_PRICE"
  );
  if (!newPriceId) {
    return new Err(new Error("Business monthly price not found"));
  }

  const defaultPaymentMethodId =
    getDefaultPaymentMethodId(existingSubscription);

  const quantity = await countActiveSeatsForWorkspace(owner.sId);

  const newSubscription = await stripe.subscriptions.create({
    customer: getCustomerId(existingSubscription),
    currency: existingSubscription.currency,
    items: [{ price: newPriceId, quantity }],
    default_payment_method: defaultPaymentMethodId,
    automatic_tax: {
      enabled: existingSubscription.automatic_tax.enabled,
    },
    metadata: {
      planCode,
      workspaceId: owner.sId,
    },
  });

  return new Ok({ stripeSubscriptionId: newSubscription.id });
}

/**
 * Checks that a subscription created in Stripe is usable by Dust, returns an
 * error otherwise.
 */
export function assertStripeSubscriptionIsValid(
  stripeSubscription: Stripe.Subscription
): Result<true, { invalidity_message: string }> {
  // very unlikely, so handling is overkill at time of writing
  if (stripeSubscription.items.has_more) {
    return new Err({
      invalidity_message: "Subscription has too many items.",
    });
  }

  const itemsToCheck = stripeSubscription.items.data.filter(
    (item) => !item.deleted
  );

  if (itemsToCheck.length === 0) {
    return new Err({ invalidity_message: "Subscription has no items." });
  }

  // All the business logic checks below are validating that the stripe
  // subscription doesn't have a configuration that we don't support
  for (const item of itemsToCheck) {
    const itemValidation = assertStripeSubscriptionItemIsValid({ item });
    if (itemValidation.isErr()) {
      return itemValidation;
    }
  }

  return new Ok(true);
} // TODO(2024-04-05,pr): immediately after flav's merge, use the global constant

// "Cheap" way to verify if a Stripe subscription can be considered an enterprise subscription.
export function isEnterpriseSubscription(
  stripeSubscription: Stripe.Subscription
) {
  const activeItems = stripeSubscription.items.data.filter(
    (item) => !item.deleted
  );

  return activeItems.every((item) => {
    const isRecurring = Boolean(item.price.recurring);
    const reportUsage = item.price.metadata?.REPORT_USAGE;

    return isRecurring && isEnterpriseReportUsage(reportUsage);
  });
}

/**
 * Extracts the customer ID from a Stripe subscription.
 * Handles both string and expanded customer object.
 */
export function getCustomerId(subscription: Stripe.Subscription): string {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
}

function getDefaultPaymentMethodId(
  subscription: Stripe.Subscription
): string | undefined {
  return isString(subscription.default_payment_method)
    ? subscription.default_payment_method
    : subscription.default_payment_method?.id;
}

/**
 * Checks if a Stripe invoice is for a programmatic credit purchase.
 */
export function isCreditPurchaseInvoice(invoice: Stripe.Invoice): boolean {
  return invoice.metadata?.credit_purchase === "true";
}

/**
 * Checks if a Stripe invoice is for a Metronome subscription activation.
 */
export function isSubscriptionActivationInvoice(
  invoice: Stripe.Invoice
): boolean {
  return invoice.metadata?.subscription_activation === "true";
}

/**
 * Checks if a Stripe invoice is for an AWU credit pool purchase.
 */
export function isAwuPurchaseInvoice(invoice: Stripe.Invoice): boolean {
  return invoice.metadata?.awu_purchase === "true";
}

/**
 * Any invoice Metronome generated and pushed to Stripe — identified by the
 * `metronome_customer_id` metadata Metronome stamps on every invoice it pushes.
 * Scopes the line-cleaning flow to Metronome invoices only.
 */
export function isMetronomePushedInvoice(invoice: Stripe.Invoice): boolean {
  return invoice.metadata?.metronome_customer_id != null;
}

/**
 * Extracts the credit amount in cents from a credit purchase invoice.
 * Returns null if the invoice is not a credit purchase or if the amount is invalid.
 */
export function getCreditAmountFromInvoice(
  invoice: Stripe.Invoice
): number | null {
  if (!isCreditPurchaseInvoice(invoice) || !invoice.metadata) {
    return null;
  }

  const amountCents = parseInt(invoice.metadata.credit_amount_cents, 10);

  if (isNaN(amountCents) || amountCents <= 0) {
    return null;
  }

  return amountCents;
}

export async function voidInvoiceWithReason(
  invoiceId: string,
  voidReason: string
): Promise<Result<Stripe.Invoice, Error>> {
  const stripe = getStripeClient();
  try {
    const voidedInvoice = await stripe.invoices.voidInvoice(invoiceId);
    await stripe.invoices.update(invoiceId, {
      metadata: { void_reason: voidReason },
    });
    return new Ok(voidedInvoice);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function getCreditPurchaseCouponId(
  discountPercent: number
): Promise<Result<string | undefined, Error>> {
  const couponId = `programmatic-usage-credits-once-${discountPercent}`;
  const couponResult = await createCreditPurchaseCoupon(
    couponId,
    discountPercent
  );

  if (couponResult.isErr()) {
    return new Err(new Error(couponResult.error.error_message));
  }

  return new Ok(couponResult.value);
}

export async function createCreditPurchaseCoupon(
  couponId: string,
  percentOff: number
): Promise<Result<string, { error_message: string }>> {
  const stripe = getStripeClient();

  // why this try/catch ?
  // Stripe will throw if the coupon does not exist (http 404)
  try {
    const existingCoupon = await stripe.coupons.retrieve(couponId);
    return new Ok(existingCoupon.id);
  } catch (error) {
    if (
      error instanceof Stripe.errors.StripeInvalidRequestError &&
      error.code === "resource_missing"
    ) {
      const newCoupon = await stripe.coupons.create({
        id: couponId,
        percent_off: percentOff,
        duration: "once",
        name: `Programmatic Usage Credits Discount`,
      });
      return new Ok(newCoupon.id);
    } else {
      throw error;
    }
  }
}

type InvoiceCollectionParams =
  | {
      collectionMethod: "charge_automatically";
      daysUntilDue?: never;
      requestThreeDSecure?: "any" | "automatic" | "challenge";
    }
  | {
      collectionMethod: "send_invoice";
      daysUntilDue: number;
      requestThreeDSecure?: never;
    };

type InvoiceLineItem = {
  priceId: string;
  quantity: number;
  description: string;
  couponId?: string;
};

export type CustomerFacingInvoiceInfo = {
  purchaseOrderId?: string;
};

/**
 * Target of an invoice: either an existing Stripe subscription (the invoice
 * gets attached to it and inherits its currency) or a Stripe customer
 * directly (used for Metronome-only billed workspaces with no Stripe
 * subscription, where the currency must be passed explicitly).
 */
type InvoiceTarget =
  | { kind: "subscription"; stripeSubscription: Stripe.Subscription }
  | {
      kind: "customer";
      stripeCustomerId: string;
      currency: SupportedCurrency;
    };

async function makeInvoice({
  target,
  metadata,
  lineItem,
  idempotencyKey,
  customerFacingInfo,
  ...collectionParams
}: {
  target: InvoiceTarget;
  metadata: Record<string, string>;
  lineItem: InvoiceLineItem;
  idempotencyKey?: string;
  customerFacingInfo?: CustomerFacingInvoiceInfo;
} & InvoiceCollectionParams): Promise<
  Result<
    Stripe.Invoice,
    { error_message: string; isIdempotencyError?: boolean }
  >
> {
  const stripe = getStripeClient();
  const customerId =
    target.kind === "subscription"
      ? getCustomerId(target.stripeSubscription)
      : target.stripeCustomerId;

  const invoiceParams: Stripe.InvoiceCreateParams = {
    customer: customerId,
    ...(target.kind === "subscription"
      ? { subscription: target.stripeSubscription.id }
      : { currency: target.currency }),
    collection_method: collectionParams.collectionMethod,
    metadata,
    auto_advance: true,
    automatic_tax: {
      enabled: true,
    },
    custom_fields: customerFacingInfo?.purchaseOrderId
      ? [{ name: "Purchase Order", value: customerFacingInfo.purchaseOrderId }]
      : undefined,
  };

  switch (collectionParams.collectionMethod) {
    case "charge_automatically":
      invoiceParams.payment_settings = {
        payment_method_options: {
          card: {
            // Stripe types are missing "challenge" but API supports it
            request_three_d_secure: (collectionParams.requestThreeDSecure ??
              "automatic") as Stripe.InvoiceCreateParams.PaymentSettings.PaymentMethodOptions.Card.RequestThreeDSecure,
          },
        },
      };
      break;
    case "send_invoice":
      invoiceParams.days_until_due = collectionParams.daysUntilDue;
      break;
    default:
      assertNever(collectionParams);
  }

  try {
    const invoice = await stripe.invoices.create(
      invoiceParams,
      idempotencyKey ? { idempotencyKey } : undefined
    );

    await stripe.invoiceItems.create({
      customer: customerId,
      price: lineItem.priceId,
      ...(target.kind === "customer" ? { currency: target.currency } : {}),
      quantity: lineItem.quantity,
      description: lineItem.description,
      invoice: invoice.id,
      ...(lineItem.couponId && { discounts: [{ coupon: lineItem.couponId }] }),
    });

    return new Ok(invoice);
  } catch (error) {
    const isIdempotencyError =
      error instanceof Stripe.errors.StripeError &&
      error.code === "idempotency_key_in_use";

    if (isIdempotencyError) {
      return new Err({
        error_message: `Idempotency key already used: ${idempotencyKey}`,
        isIdempotencyError: true,
      });
    }

    logger.error(
      {
        stripeError: true,
        ...(target.kind === "subscription"
          ? { stripeSubscriptionId: target.stripeSubscription.id }
          : { stripeCustomerId: target.stripeCustomerId }),
      },
      "[Stripe] Failed to create invoice"
    );
    return new Err({
      error_message: `Failed to create invoice: ${normalizeError(error).message}`,
    });
  }
}

export function assertStripeSubscriptionItemIsValid({
  item,
  recurringRequired,
}: {
  item: Stripe.SubscriptionItem;
  recurringRequired?: boolean;
}): Result<true, { invalidity_message: string }> {
  if (!item.price) {
    return new Err({
      invalidity_message: "Subscription item has no price.",
    });
  }

  if (recurringRequired && !item.price.recurring) {
    return new Err({
      invalidity_message: "Price must be recurring.",
    });
  }

  const reportUsage = item.price.metadata?.REPORT_USAGE;

  if (!item.price.recurring && reportUsage) {
    return new Err({
      invalidity_message:
        "Subscription item has a REPORT_USAGE metadata but the price is not recurring.",
    });
  }

  if (item.price.recurring) {
    if (!isSupportedReportUsage(reportUsage)) {
      return new Err({
        invalidity_message:
          "Subscription recurring price REPORT_USAGE metadata should have values in " +
          JSON.stringify(SUPPORTED_REPORT_USAGE),
      });
    }

    if (item.price.recurring.usage_type === "licensed") {
      switch (reportUsage) {
        case "PER_SEAT":
          break;
        case "FIXED":
          if (item.quantity !== 1) {
            return new Err({
              invalidity_message:
                "Subscription recurring price has REPORT_USAGE set to 'FIXED' but has a quantity different from 1.",
            });
          }
          break;
        default:
          return new Err({
            invalidity_message:
              "Subscription recurring price has usage_type 'licensed' but has a REPORT_USAGE different from PER_SEAT or FIXED.",
          });
      }
    }

    if (item.price.recurring.usage_type === "metered") {
      if (!isMauReportUsage(item.price.metadata?.REPORT_USAGE)) {
        return new Err({
          invalidity_message: `Subscription recurring price has usage_type 'metered' but no valid REPORT_USAGE metadata. REPORT_USAGE should be MAU_{number} (e.g. MAU_1, MAU_5, MAU_10). Got ${reportUsage}`,
        });
      }

      // if (item.price.recurring.aggregate_usage !== "last_during_period") {
      //   return new Err({
      //     invalidity_message:
      //       "Subscription recurring price with usage_type 'metered' has invalid aggregate_usage, should be last during period",
      //   });
      // }
    }

    if (
      !["month", "year"].includes(item.price.recurring.interval) ||
      item.price.recurring.interval_count !== 1
    ) {
      return new Err({
        invalidity_message:
          "Subscription recurring price has invalid interval, only 1-month or 1-year intervals are allowed.",
      });
    }
  }

  return new Ok(true);
}

export async function reportActiveSeats(
  stripeSubscriptionItem: Stripe.SubscriptionItem,
  workspace: LightWorkspaceType
): Promise<void> {
  const activeSeats = await countActiveSeatsForWorkspace(workspace.sId);

  await updateStripeQuantityForSubscriptionItem(
    stripeSubscriptionItem,
    activeSeats
  );
}

export async function makeCreditPurchaseOneOffInvoiceForSubscription({
  stripeSubscriptionId,
  amountMicroUsd,
  couponId,
  customerFacingInfo,
  ...collectionParams
}: {
  stripeSubscriptionId: string;
  amountMicroUsd: number;
  couponId?: string;
  customerFacingInfo?: CustomerFacingInvoiceInfo;
} & InvoiceCollectionParams): Promise<
  Result<Stripe.Invoice, { error_message: string }>
> {
  const subscription = await getStripeSubscription(stripeSubscriptionId);
  if (!subscription) {
    return new Err({
      error_message: `Subscription ${stripeSubscriptionId} not found`,
    });
  }

  const amountCents = Math.ceil(amountMicroUsd / 10_000);
  const amountDollars = amountCents / 100;

  return makeInvoice({
    target: { kind: "subscription", stripeSubscription: subscription },
    metadata: {
      credit_purchase: "true",
      credit_amount_cents: amountCents.toString(),
    },
    lineItem: {
      priceId: getCreditPurchasePriceId(),
      quantity: amountCents,
      description: `Programmatic usage credit: $${amountDollars.toFixed(2)}`,
      couponId,
    },
    customerFacingInfo,
    ...collectionParams,
  });
}

/**
 * Variant for Metronome-only billed customers: no Stripe subscription, just a
 * Stripe customer (linked via the Metronome billing config). Issues a one-off
 * invoice directly on the customer in the requested currency.
 */
export async function makeCreditPurchaseOneOffInvoiceForCustomer({
  stripeCustomerId,
  workspaceId,
  currency,
  amountMicroUsd,
  couponId,
  customerFacingInfo,
  ...collectionParams
}: {
  stripeCustomerId: string;
  // Stamped on the invoice metadata so the Stripe webhook can route
  // subscription-less invoice events (paid / payment_failed / voided)
  // back to the originating workspace without going through Metronome.
  workspaceId: string;
  // Currency to bill in — must match the contract / Stripe customer.
  currency: SupportedCurrency;
  amountMicroUsd: number;
  couponId?: string;
  customerFacingInfo?: CustomerFacingInvoiceInfo;
} & InvoiceCollectionParams): Promise<
  Result<Stripe.Invoice, { error_message: string }>
> {
  const amountCents = Math.ceil(amountMicroUsd / 10_000);
  const amountDollars = amountCents / 100;

  return makeInvoice({
    target: { kind: "customer", stripeCustomerId, currency },
    metadata: {
      credit_purchase: "true",
      credit_amount_cents: amountCents.toString(),
      workspace_id: workspaceId,
    },
    lineItem: {
      priceId: getCreditPurchasePriceId(),
      quantity: amountCents,
      description: `Programmatic usage credit: $${amountDollars.toFixed(2)}`,
      couponId,
    },
    customerFacingInfo,
    ...collectionParams,
  });
}

export async function finalizeInvoice(
  invoice: Stripe.Invoice
): Promise<Result<Stripe.Invoice, { error_message: string }>> {
  const stripe = getStripeClient();

  try {
    // Explicitly re-enable auto_advance so Stripe proceeds with its
    // post-finalization workflow (auto-charge or auto-send), in case the
    // invoice had it disabled (e.g. frozen while editing a Metronome draft).
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id, {
      auto_advance: true,
    });
    return new Ok(finalizedInvoice);
  } catch (error) {
    logger.error(
      {
        stripeInvoiceId: invoice.id,
        stripeError: true,
        error: normalizeError(error).message,
      },
      "[Stripe] Failed to finalize invoice"
    );
    return new Err({
      error_message: `Failed to finalize invoice: ${normalizeError(error).message}`,
    });
  }
}

/**
 * Metadata flag stamped on a Metronome draft invoice once we have normalized its
 * line items, so redeliveries / Temporal retries don't clean it twice.
 */
const METRONOME_INVOICE_LINES_CLEANED_FLAG = "lines_cleaned";

/**
 * Metronome represents a fully-applied commit/credit as a pair of lines on the
 * same invoice with equal and opposite amounts: a negative line whose
 * description is "<label> applied", and the positive usage/subscription line
 * it offsets. The positive line references the label in one of two formats:
 * as its own parenthesized group, "(<label>)" (e.g. a negative
 * "Platform Seat (Yearly) commitment: 53 seats applied" line offsetting a
 * positive "Platform Seat (Yearly) (Platform Seat (Yearly) commitment: 53
 * seats)" line), or as the last comma-separated element of the quantity/price
 * group, ", <label>)" (e.g. "Max Seat (0.0013, $150.00, Business subscription
 * activation (max monthly))"). Neither line carries metadata identifying the
 * pairing (there is no such thing as `metronome_commit_id` on Stripe line
 * items — Metronome does not document or set one), so we match them by
 * description + amount instead.
 */
function findCommitAppliedLineIds(
  lines: Stripe.InvoiceLineItem[]
): Set<string> {
  const appliedSuffix = " applied";
  const matchedLineIds = new Set<string>();

  for (const creditLine of lines) {
    const description = creditLine.description;
    if (
      creditLine.amount >= 0 ||
      !description ||
      !description.endsWith(appliedSuffix)
    ) {
      continue;
    }

    const label = description.slice(0, -appliedSuffix.length);
    const offsetLine = lines.find(
      (candidate) =>
        candidate.id !== creditLine.id &&
        !matchedLineIds.has(candidate.id) &&
        candidate.amount === -creditLine.amount &&
        candidate.currency === creditLine.currency &&
        (candidate.description?.includes(`(${label})`) ||
          candidate.description?.includes(`, ${label})`))
    );

    if (offsetLine) {
      matchedLineIds.add(offsetLine.id);
    }
  }

  return matchedLineIds;
}

/**
 * Stripe accepts at most 12 decimal places on `unit_amount_decimal`.
 */
const STRIPE_MAX_UNIT_AMOUNT_DECIMAL_PLACES = 12;

/**
 * Round-half-up integer division for positive bigints — the bigint equivalent
 * of Math.round(numerator / denominator), which is also how Stripe rounds
 * recomputed line totals. Bigint `/` truncates, so rounding is expressed as
 * floor((2a + b) / 2b).
 */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const two = BigInt(2);
  return (two * numerator + denominator) / (two * denominator);
}

/**
 * Metronome pushes invoice items with `unit_amount_decimal` (Stripe's
 * sub-cent-precision unit price), e.g. "1964.516129032258" cents for a
 * prorated seat. Stripe renders that unit price verbatim on the
 * customer-facing invoice, showing a long tail of decimals. Rewrites the
 * backing invoice item to the shortest unit price — whole cents first, then
 * increasing sub-cent decimals — that multiplies back (by the unchanged
 * quantity) to the exact line total (`amount`, integer cents), so both the
 * displayed quantity and the invoice total are preserved. Any precision with
 * more than log10(quantity) sub-cent decimals reconstructs the total exactly,
 * so a match is always found well within Stripe's 12-decimal maximum.
 */
async function normalizeSubCentUnitAmount(
  stripe: Stripe,
  invoice: Stripe.Invoice,
  line: Stripe.InvoiceLineItem
): Promise<void> {
  const unitAmountDecimalCents = line.price?.unit_amount_decimal;
  if (
    unitAmountDecimalCents == null ||
    Number.isInteger(Number(unitAmountDecimalCents))
  ) {
    return;
  }

  const invoiceItemId = isString(line.invoice_item)
    ? line.invoice_item
    : line.invoice_item?.id;

  if (!invoiceItemId) {
    logger.warn(
      { stripeInvoiceId: invoice.id, lineId: line.id },
      "[Stripe] Cannot normalize sub-cent unit price: line not backed by an invoice item"
    );
    return;
  }

  const quantity = line.quantity ?? 1;
  const amountCents = line.amount;
  if (quantity <= 0) {
    return;
  }

  // BigInt throughout: at 12 decimal places the scaled values exceed Number's
  // safe integer range.
  const amountBig = BigInt(amountCents);
  const quantityBig = BigInt(quantity);

  for (
    let decimalPlaces = 0;
    decimalPlaces <= STRIPE_MAX_UNIT_AMOUNT_DECIMAL_PLACES;
    decimalPlaces++
  ) {
    // 10^12 is well within Number's safe integer range, so the Number
    // exponentiation is exact.
    const scale = BigInt(10 ** decimalPlaces);
    const scaledUnit = divideRoundHalfUp(amountBig * scale, quantityBig);
    // Stripe recomputes the line total as round(unit price × quantity); only
    // keep this precision if that lands back on the exact original total.
    const reconstructed = divideRoundHalfUp(scaledUnit * quantityBig, scale);
    if (reconstructed !== amountBig) {
      continue;
    }

    const update: Stripe.InvoiceItemUpdateParams =
      decimalPlaces === 0
        ? { quantity, unit_amount: Number(scaledUnit) }
        : {
            quantity,
            unit_amount_decimal: `${scaledUnit / scale}.${String(
              scaledUnit % scale
            ).padStart(decimalPlaces, "0")}`,
          };

    logger.info(
      {
        stripeInvoiceId: invoice.id,
        lineId: line.id,
        invoiceItemId,
        unitAmountDecimalCents,
        amountCents,
        quantity,
        update,
      },
      "[Stripe] Normalizing sub-cent unit price on Metronome invoice line"
    );

    await stripe.invoiceItems.update(invoiceItemId, update);
    return;
  }

  logger.warn(
    {
      stripeInvoiceId: invoice.id,
      lineId: line.id,
      invoiceItemId,
      unitAmountDecimalCents,
      amountCents,
      quantity,
    },
    "[Stripe] Could not shorten sub-cent unit price without changing the line total, leaving line as-is"
  );
}

/**
 * Removes from a Metronome-pushed Stripe draft invoice the line items that
 * should not appear on the customer-facing invoice:
 *
 * 1. Negative lines.
 * 2. Lines with a fully-applied commit or credit, matched via
 *    `findCommitAppliedLineIds` (see its doc comment).
 * 3. Wrong-currency lines — non-fiat lines (e.g. AWU-priced) that Metronome may
 *    not transfer to Stripe; guard retained for safety.
 *
 * Lines that are kept get their unit price shortened via
 * `normalizeSubCentUnitAmount`. Quantity and total are preserved, so the totals safety check below is unaffected.
 *
 * Filters 1 and 2 cancel each other out: the negative "applied" line and the
 * positive line it offsets have equal and opposite amounts, so removing both
 * leaves the invoice total unchanged. As a safety net against a bad match, the
 * invoice total before and after cleaning is returned so the caller can abort
 * finalization if it drifted.
 */
async function cleanMetronomeInvoiceLines(
  stripe: Stripe,
  invoice: Stripe.Invoice
): Promise<{
  totalsMatch: boolean;
  originalTotalCents: number;
  newTotalCents: number;
  awuPurchaseMetadata: Record<string, string> | null;
  purchaseOrder: string | null;
}> {
  const invoiceCurrency = invoice.currency;
  const originalTotalCents = invoice.total;

  // `invoice.lines` only holds the first page; iterate the list endpoint so we
  // see every line. The Stripe SDK list result auto-paginates when iterated.
  // We need the full set upfront (not streamed) since matching a commit's
  // negative line to the positive line it offsets requires looking across all
  // of the invoice's lines.
  const lines: Stripe.InvoiceLineItem[] = [];
  for await (const line of stripe.invoices.listLineItems(invoice.id, {
    limit: 100,
  })) {
    lines.push(line);
  }

  const commitAppliedLineIds = findCommitAppliedLineIds(lines);

  // AWU pool commits are stamped (via Metronome custom fields on the commit,
  // mapped to Stripe line-item metadata by Metronome's Stripe integration
  // config) with credit_type=pool plus the credited amount, and optionally a
  // PO / discount. Detected here so the whole invoice can be tagged
  // awu_purchase=true, matching the shape `isAwuPurchaseInvoice` already
  // reads for the payment-gated self-serve path.
  let awuPurchaseMetadata: Record<string, string> | null = null;
  let purchaseOrder: string | null = null;

  for (const line of lines) {
    const isNegative = line.amount < 1;
    const hasAppliedCommitOrCredit = commitAppliedLineIds.has(line.id);
    const isWrongCurrency = line.currency !== invoiceCurrency;
    const shouldRemove =
      isNegative || hasAppliedCommitOrCredit || isWrongCurrency;

    logger.info(
      {
        stripeInvoiceId: invoice.id,
        lineId: line.id,
        amount: line.amount,
        currency: line.currency,
        metadata: line.metadata,
        isNegative,
        hasAppliedCommitOrCredit,
        isWrongCurrency,
        shouldRemove,
        line,
      },
      "[Stripe] Metronome invoice line item"
    );

    if (line.metadata?.credit_type === CONTRACT_CREDIT_TYPE_POOL) {
      awuPurchaseMetadata = {
        awu_purchase: "true",
        awu_amount_credits: line.metadata.awu_amount ?? "",
        ...(line.metadata.awu_discount_percent
          ? { awu_discount_percent: line.metadata.awu_discount_percent }
          : {}),
      };
    }

    if (line.metadata?.purchase_order_id) {
      purchaseOrder = line.metadata.purchase_order_id;
    }

    if (!shouldRemove) {
      await normalizeSubCentUnitAmount(stripe, invoice, line);
      continue;
    }

    const invoiceItemId =
      typeof line.invoice_item === "string"
        ? line.invoice_item
        : line.invoice_item?.id;

    if (!invoiceItemId) {
      logger.warn(
        { stripeInvoiceId: invoice.id, lineId: line.id },
        "[Stripe] Cannot remove line item: not backed by an invoice item"
      );
      continue;
    }

    await stripe.invoiceItems.del(invoiceItemId);
  }

  const updatedInvoice = await stripe.invoices.retrieve(invoice.id);
  const newTotalCents = updatedInvoice.total;

  return {
    totalsMatch: newTotalCents === originalTotalCents,
    originalTotalCents,
    newTotalCents,
    awuPurchaseMetadata,
    purchaseOrder,
  };
}

/**
 * Re-fetches a Metronome-pushed draft invoice, normalizes its line items, then
 * finalizes it. Invoked ~1 minute after Stripe's `invoice.created` (via Temporal)
 * so Metronome has finished writing all line items before we touch the draft.
 *
 * Idempotent and self-gating: re-asserts the invoice is still a Metronome draft
 * we have not cleaned yet, so Stripe redeliveries and Temporal retries collapse to
 * a single effective run. `auto_advance` is disabled up-front so Stripe cannot
 * finalize the draft out from under us while we edit; we finalize explicitly at
 * the end.
 */
export async function cleanAndFinalizeMetronomeDraftInvoice({
  invoiceId,
  workspaceId,
}: {
  invoiceId: string;
  workspaceId: string;
}): Promise<
  Result<
    { outcome: "cleaned" | "skipped" | "totals_mismatch" },
    { error_message: string }
  >
> {
  const stripe = getStripeClient();

  try {
    const invoice = await stripe.invoices.retrieve(invoiceId);

    if (!isMetronomePushedInvoice(invoice)) {
      logger.info(
        { stripeInvoiceId: invoiceId, workspaceId },
        "[Stripe] Skipping invoice clean: not a Metronome-pushed invoice"
      );
      return new Ok({ outcome: "skipped" });
    }

    if (invoice.status !== "draft") {
      logger.info(
        {
          stripeInvoiceId: invoiceId,
          workspaceId,
          invoiceStatus: invoice.status,
        },
        "[Stripe] Skipping invoice clean: invoice is no longer a draft"
      );
      return new Ok({ outcome: "skipped" });
    }

    if (invoice.metadata?.[METRONOME_INVOICE_LINES_CLEANED_FLAG] === "true") {
      logger.info(
        { stripeInvoiceId: invoiceId, workspaceId },
        "[Stripe] Skipping invoice clean: already cleaned"
      );
      return new Ok({ outcome: "skipped" });
    }

    // Freeze the draft so Stripe's auto-advance can't finalize it while we edit.
    await stripe.invoices.update(invoiceId, { auto_advance: false });

    const workspace = await WorkspaceResource.fetchById(workspaceId);
    const creditConfig = workspace
      ? await CreditUsageConfigurationResource.fetchByWorkspaceModelId(
          workspace.id
        )
      : null;
    const autoInvoiceFinalizationEnabled =
      creditConfig?.autoInvoiceFinalizationEnabled ??
      DEFAULT_AUTO_INVOICE_FINALIZATION_ENABLED;

    const {
      totalsMatch,
      originalTotalCents,
      newTotalCents,
      awuPurchaseMetadata,
      purchaseOrder,
    } = await cleanMetronomeInvoiceLines(stripe, invoice);

    await stripe.invoices.update(invoiceId, {
      metadata: {
        ...invoice.metadata,
        workspace_id: workspaceId,
        ...awuPurchaseMetadata,
        ...(purchaseOrder ? { purchase_order_id: purchaseOrder } : {}),
        [METRONOME_INVOICE_LINES_CLEANED_FLAG]: "true",
      },
      // Displayed on the printed/hosted invoice, unlike `metadata`.
      ...(purchaseOrder
        ? {
            custom_fields: [{ name: "Purchase Order", value: purchaseOrder }],
          }
        : {}),
    });

    if (!totalsMatch) {
      // The lines_cleaned flag is already set above, so a Temporal retry
      // would just hit the "already cleaned" early return and no-op — this
      // needs a human, not a retry. Report Ok rather than throwing.
      logger.error(
        {
          panic: true,
          stripeInvoiceId: invoiceId,
          workspaceId,
          originalTotalCents,
          newTotalCents,
        },
        "[Stripe] Invoice total changed after cleaning Metronome line items, leaving as draft for manual review"
      );
      return new Ok({ outcome: "totals_mismatch" });
    }

    if (!autoInvoiceFinalizationEnabled) {
      logger.info(
        { stripeInvoiceId: invoiceId, workspaceId },
        "[Stripe] Cleaned Metronome draft invoice (finalization disabled for workspace)"
      );
      return new Ok({ outcome: "cleaned" });
    }

    const finalizeResult = await finalizeInvoice(invoice);
    if (finalizeResult.isErr()) {
      return finalizeResult;
    }

    logger.info(
      { stripeInvoiceId: invoiceId, workspaceId },
      "[Stripe] Cleaned and finalized Metronome draft invoice"
    );
    return new Ok({ outcome: "cleaned" });
  } catch (error) {
    if (
      error instanceof Stripe.errors.StripeInvalidRequestError &&
      error.code === "resource_missing"
    ) {
      logger.info(
        { stripeInvoiceId: invoiceId, workspaceId },
        "[Stripe] Skipping invoice clean: invoice no longer exists"
      );
      return new Ok({ outcome: "skipped" });
    }

    logger.error(
      {
        stripeInvoiceId: invoiceId,
        workspaceId,
        stripeError: true,
        error: normalizeError(error).message,
      },
      "[Stripe] Failed to clean and finalize Metronome draft invoice"
    );
    return new Err({
      error_message: `Failed to clean and finalize invoice: ${normalizeError(error).message}`,
    });
  }
}

export async function payInvoice(
  invoice: Stripe.Invoice
): Promise<Result<{ paymentUrl: string | null }, { error_message: string }>> {
  const stripe = getStripeClient();

  try {
    const paidInvoice = await stripe.invoices.pay(invoice.id);

    if (paidInvoice.status === "paid") {
      return new Ok({ paymentUrl: null });
    }
  } catch (payError) {
    logger.info(
      {
        stripeInvoiceId: invoice.id,
        error: normalizeError(payError).message,
      },
      "[Stripe] Payment requires additional action or failed"
    );
  }

  const invoiceWithUrl = await stripe.invoices.retrieve(invoice.id);
  if (invoiceWithUrl.hosted_invoice_url) {
    return new Ok({ paymentUrl: invoiceWithUrl.hosted_invoice_url });
  }

  return new Err({
    error_message:
      "Invoice created but payment could not be processed. Please contact support.",
  });
}

export async function getInvoicePaymentUrl(
  invoiceId: string
): Promise<string | null> {
  const stripe = getStripeClient();
  const invoice = await stripe.invoices.retrieve(invoiceId);
  return invoice.hosted_invoice_url ?? null;
}

export function getAnnualizedSubscriptionValueMicroUsd(
  stripeSubscription: Stripe.Subscription
): number {
  let totalMicroUsd = 0;
  for (const item of stripeSubscription.items.data) {
    if (item.deleted) {
      continue;
    }
    const unitAmountCents = Number(
      item.price.unit_amount ?? item.price.unit_amount_decimal ?? 0
    );
    const quantity = item.quantity ?? 1;
    const interval = item.price.recurring?.interval;

    const annualMultiplier = interval === "year" ? 1 : 12;
    // Convert cents to micro USD: cents * 10_000
    totalMicroUsd += unitAmountCents * quantity * 10_000 * annualMultiplier;
  }
  return totalMicroUsd;
}

export async function makeAndFinalizeCreditsPAYGInvoice({
  stripeSubscription,
  amountMicroUsd,
  periodStartSeconds,
  periodEndSeconds,
  idempotencyKey,
  daysUntilDue,
}: {
  stripeSubscription: Stripe.Subscription;
  amountMicroUsd: number;
  periodStartSeconds: number;
  periodEndSeconds: number;
  idempotencyKey: string;
  daysUntilDue: number;
}): Promise<
  Result<
    Stripe.Invoice,
    { error_type: "idempotency" | "other"; error_message: string }
  >
> {
  const stripe = getStripeClient();

  const periodStartDate = new Date(periodStartSeconds * 1000);
  const periodEndDate = new Date(periodEndSeconds * 1000);
  const amountCents = Math.ceil(amountMicroUsd / 10_000);
  const amountDollars = amountCents / 100;

  const invoiceResult = await makeInvoice({
    target: { kind: "subscription", stripeSubscription },
    metadata: {
      credits_payg: "true",
      arrears_invoice: "true",
      credits_amount_cents: amountCents.toString(),
      credits_period_start: periodStartSeconds.toString(),
      credits_period_end: periodEndSeconds.toString(),
    },
    lineItem: {
      priceId: getPAYGCreditPriceId(),
      quantity: amountCents,
      description: `Pay-as-you-go programmatic usage from ${periodStartDate.toISOString().split("T")[0]} to ${periodEndDate.toISOString().split("T")[0]}: $${amountDollars.toFixed(2)}`,
    },
    idempotencyKey,
    collectionMethod: "send_invoice",
    daysUntilDue,
  });

  if (invoiceResult.isErr()) {
    if (invoiceResult.error.isIdempotencyError) {
      return new Err({
        error_type: "idempotency",
        error_message: invoiceResult.error.error_message,
      });
    }

    logger.error(
      {
        panic: true,
        stripeSubscriptionId: stripeSubscription.id,
        stripeError: true,
      },
      "[Credit PAYG] Failed to create Stripe invoice"
    );
    return new Err({
      error_type: "other",
      error_message: `Failed to create PAYG invoice: ${invoiceResult.error.error_message}`,
    });
  }

  const invoice = invoiceResult.value;

  try {
    await stripe.invoices.finalizeInvoice(invoice.id);
  } catch (error) {
    logger.error(
      {
        panic: true,
        stripeSubscriptionId: stripeSubscription.id,
        stripeError: true,
      },
      "[Credit PAYG] Failed to finalize Stripe invoice"
    );
    return new Err({
      error_type: "other",
      error_message: `Failed to finalize PAYG invoice: ${normalizeError(error).message}`,
    });
  }

  return new Ok(invoice);
}
