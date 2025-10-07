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
import type {
  BillingPeriod,
  LightWorkspaceType,
  Result,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { Err, isDevelopment, Ok } from "@app/types";

export function getProPlanStripeProductId(owner: WorkspaceType) {
  const isBusiness = owner.metadata?.isBusiness;

  const devProPlanProductId = "prod_OwKvN4XrUwFw5a";
  const devBusinessProPlanProductId = "prod_RkNr4qbHJD3oUp";

  const prodProPlanProductId = "prod_OwALjyfxfi2mln";
  const prodBusinessProPlanProductId = "prod_RkPFpfBzLo79gd";

  return isDevelopment()
    ? isBusiness
      ? devBusinessProPlanProductId
      : devProPlanProductId
    : isBusiness
      ? prodBusinessProPlanProductId
      : prodProPlanProductId;
}

export const getStripeClient = () => {
  return new Stripe(config.getStripeSecretKey(), {
    apiVersion: "2025-09-30.clover",
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

const SUPPORTED_PAYMENT_METHODS = ["card", "sepa_debit"] as const;

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

  const stripeProductId = getProPlanStripeProductId(owner);
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
  } catch (error) {
    return null;
  }
};

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
