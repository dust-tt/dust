import { Stripe } from "stripe";

import config from "@app/lib/api/config";
import { Plan, Subscription } from "@app/lib/models/plan";
import { isOldFreePlan } from "@app/lib/plans/plan_codes";
import { countActiveSeatsInWorkspace } from "@app/lib/plans/usage/seats";
import {
  isEnterpriseReportUsage,
  isMauReportUsage,
  isSupportedReportUsage,
  SUPPORTED_REPORT_USAGE,
} from "@app/lib/plans/usage/types";
import logger from "@app/logger/logger";
import type {
  BillingPeriod,
  LightWorkspaceType,
  Result,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { Err, isDevelopment, normalizeError, Ok } from "@app/types";

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

export function getStripeCheckoutSessionProductId(owner: WorkspaceType) {
  const isBusiness = owner.metadata?.isBusiness;
  return isBusiness ? getBusinessProPlanProductId() : getProPlanProductId();
}

export function getCreditPurchasePriceId() {
  const devCreditPurchasePriceId = "price_1SUoyQDKd2JRwZF6FBHIGbwC";
  const prodCreditPurchasePriceId = "price_1SVYsjDKd2JRwZF6zdIW29mC";

  return isDevelopment() ? devCreditPurchasePriceId : prodCreditPurchasePriceId;
}

export function getPAYGCreditPriceId() {
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

type SupportedPaymentMethod = (typeof SUPPORTED_PAYMENT_METHODS)[number];

/**
 * Calls the Stripe API to create a pro plan checkout session for a given workspace.
 * We return the URL of the checkout session.
 * Once the users has completed the checkout, we will receive an event on our Stripe webhook
 * The `auth` role is not checked, because we allow anyone (even if not logged in or not part of the WS)
 * to go through the checkout process.
 */
export const createProPlanCheckoutSession = async ({
  allowedPaymentMethods = ["card"],
  billingPeriod,
  owner,
  planCode,
  user,
}: {
  allowedPaymentMethods?: SupportedPaymentMethod[];
  billingPeriod: BillingPeriod;
  owner: WorkspaceType;
  planCode: string;
  user: UserType;
}): Promise<string | null> => {
  const stripe = getStripeClient();

  const plan = await Plan.findOne({ where: { code: planCode } });
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

  // Only allow a subscription to have a trial if the workspace never had a
  // subscription before.
  // User under the grandfathered free plan are not allowed to have a trial.
  let trialAllowed = true;
  const existingSubscription = await Subscription.findOne({
    where: { workspaceId: owner.id },
    include: [Plan],
  });
  if (existingSubscription && !isOldFreePlan(existingSubscription.plan.code)) {
    trialAllowed = false;
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
      // If trialPeriodDays is 0, we send "undefined" to Stripe.
      trial_period_days:
        trialAllowed && plan.trialPeriodDays ? plan.trialPeriodDays : undefined,
    },
    metadata: {
      planCode: planCode,
      userId: `${user.id}`,
    },
    line_items: [
      {
        price: priceId,
        quantity: await countActiveSeatsInWorkspace(owner.sId),
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
    success_url: `${config.getClientFacingUrl()}/w/${owner.sId}/subscription/payment_processing?type=succeeded&session_id={CHECKOUT_SESSION_ID}&plan_code=${planCode}`,
    cancel_url: `${config.getClientFacingUrl()}/w/${owner.sId}/subscription?type=cancelled`,
    consent_collection: {
      terms_of_service: "required",
    },
    custom_text: {
      terms_of_service_acceptance: {
        message:
          "I have read and accept the [Master Services Agreement](https://dust-tt.notion.site/Master-Services-Agreement-2bdcf30156db4a40bcb20d27b0b1bd4e?pvs=4) and [Data Processing Addendum](https://www.notion.so/dust-tt/Data-Processing-Addendum-466528e861e34f08949428e06eecd5f4?pvs=4).",
      },
    },
  });

  return session.url;
};

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

  if (!subscription.stripeSubscriptionId) {
    throw new Error(
      `No stripeSubscriptionId ID found for the workspace: ${owner.sId}`
    );
  }

  const stripeSubscription = await getStripeSubscription(
    subscription.stripeSubscriptionId
  );

  if (!stripeSubscription) {
    throw new Error(
      `No stripeSubscription found for the workspace: ${owner.sId}`
    );
  }

  const stripeCustomerId = stripeSubscription.customer;

  if (!stripeCustomerId || typeof stripeCustomerId !== "string") {
    throw new Error(
      `No stripeCustomerId found for the workspace: ${owner.sId}`
    );
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${config.getClientFacingUrl()}/w/${owner.sId}/subscription`,
  });

  return portalSession.url;
};

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
  } catch (error) {
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
export const updateStripeQuantityForSubscriptionItem = async (
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
 * Upgrades a Pro subscription to Business by swapping the Stripe product/price.
 * Always uses monthly billing for Business plan regardless of the original billing period.
 * Also updates the subscription metadata to reflect the new plan code.
 */
export async function upgradeProSubscriptionToBusiness({
  stripeSubscriptionId,
  owner,
  planCode,
}: {
  stripeSubscriptionId: string;
  owner: WorkspaceType;
  planCode: string;
}): Promise<Result<Stripe.Subscription, Error>> {
  const stripe = getStripeClient();

  const subscription = await getStripeSubscription(stripeSubscriptionId);
  if (!subscription) {
    return new Err(new Error("Subscription not found"));
  }

  const businessProductId = getBusinessProPlanProductId();
  const newPriceId = await getDefautPriceFromMetadata(
    businessProductId,
    "IS_DEFAULT_MONHTLY_PRICE"
  );

  if (!newPriceId) {
    return new Err(new Error("Business monthly price not found"));
  }

  const currentItem = subscription.items.data[0];
  if (!currentItem) {
    return new Err(new Error("Subscription has no items"));
  }

  // Update the subscription with the new price and metadata.
  // Proration will handle billing adjustment.
  const updatedSubscription = await stripe.subscriptions.update(
    stripeSubscriptionId,
    {
      items: [
        {
          id: currentItem.id,
          price: newPriceId,
        },
      ],
      proration_behavior: "create_prorations",
      metadata: {
        planCode,
        workspaceId: owner.sId,
      },
    }
  );

  return new Ok(updatedSubscription);
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

/**
 * Checks if a Stripe invoice is for a credit purchase.
 */
export function isCreditPurchaseInvoice(invoice: Stripe.Invoice): boolean {
  return invoice.metadata?.credit_purchase === "true";
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
  | { collectionMethod: "charge_automatically"; daysUntilDue?: never }
  | { collectionMethod: "send_invoice"; daysUntilDue: number };

type InvoiceLineItem = {
  priceId: string;
  quantity: number;
  description: string;
  couponId?: string;
};

async function makeInvoice({
  stripeSubscription,
  metadata,
  lineItem,
  idempotencyKey,
  ...collectionParams
}: {
  stripeSubscription: Stripe.Subscription;
  metadata: Record<string, string>;
  lineItem: InvoiceLineItem;
  idempotencyKey?: string;
} & InvoiceCollectionParams): Promise<
  Result<
    Stripe.Invoice,
    { error_message: string; isIdempotencyError?: boolean }
  >
> {
  const stripe = getStripeClient();
  const customerId = getCustomerId(stripeSubscription);

  const invoiceParams: Stripe.InvoiceCreateParams = {
    customer: customerId,
    subscription: stripeSubscription.id,
    collection_method: collectionParams.collectionMethod,
    metadata,
    auto_advance: true,
  };

  if (collectionParams.collectionMethod === "send_invoice") {
    invoiceParams.days_until_due = collectionParams.daysUntilDue;
  }

  try {
    const invoice = await stripe.invoices.create(
      invoiceParams,
      idempotencyKey ? { idempotencyKey } : undefined
    );

    await stripe.invoiceItems.create({
      customer: customerId,
      price: lineItem.priceId,
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
        stripeSubscriptionId: stripeSubscription.id,
        stripeError: true,
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

      if (item.price.recurring.aggregate_usage !== "last_during_period") {
        return new Err({
          invalidity_message:
            "Subscription recurring price with usage_type 'metered' has invalid aggregate_usage, should be last during period",
        });
      }
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
  const activeSeats = await countActiveSeatsInWorkspace(workspace.sId);

  await updateStripeQuantityForSubscriptionItem(
    stripeSubscriptionItem,
    activeSeats
  );
}

export async function makeCreditPurchaseOneOffInvoice({
  stripeSubscriptionId,
  amountMicroUsd,
  couponId,
  ...collectionParams
}: {
  stripeSubscriptionId: string;
  amountMicroUsd: number;
  couponId?: string;
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
    stripeSubscription: subscription,
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
    ...collectionParams,
  });
}

export async function finalizeInvoice(
  invoice: Stripe.Invoice
): Promise<Result<Stripe.Invoice, { error_message: string }>> {
  const stripe = getStripeClient();

  try {
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
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
    stripeSubscription,
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
