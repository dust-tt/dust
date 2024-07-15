import type { BillingPeriod, Result, WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import { Err, isDevelopment, Ok } from "@dust-tt/types";
import { Stripe } from "stripe";

import type { Authenticator } from "@app/lib/auth";
import { Plan, Subscription } from "@app/lib/models/plan";
import { PRO_PLAN_SEAT_29_CODE } from "@app/lib/plans/plan_codes";
import { countActiveSeatsInWorkspace } from "@app/lib/plans/usage/seats";
import {
  isEnterpriseReportUsage,
  isMauReportUsage,
  isSupportedReportUsage,
  SUPPORTED_REPORT_USAGE,
} from "@app/lib/plans/usage/types";

import config from "../api/config";

export function getProPlanStripeProductId() {
  return isDevelopment() ? "prod_OwKvN4XrUwFw5a" : "prod_OwALjyfxfi2mln";
}

const stripe = new Stripe(config.getStripeSecretKey(), {
  apiVersion: "2023-10-16",
  typescript: true,
});

/**
 * Calls the Stripe API to get the price ID for a given product ID.
 * We use prices metata to find the default price for a given product.
 * For the Pro plan, the metadata are "IS_DEFAULT_YEARLY_PRICE" and "IS_DEFAULT_MONHTLY_PRICE" and are set to "true".
 */
async function getDefautPriceFromMetadata(
  productId: string,
  key: string
): Promise<string | null> {
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

/**
 * Calls the Stripe API to create a pro plan checkout session for a given workspace.
 * We return the URL of the checkout session.
 * Once the users has completed the checkout, we will receive an event on our Stripe webhook
 * The `auth` role is not checked, because we allow anyone (even if not logged in or not part of the WS)
 * to go through the checkout process.
 */
export const createProPlanCheckoutSession = async ({
  auth,
  billingPeriod,
}: {
  auth: Authenticator;
  billingPeriod: BillingPeriod;
}): Promise<string | null> => {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("No workspace found");
  }
  const user = auth.user();
  if (!user) {
    throw new Error("No user found");
  }

  const plan = await Plan.findOne({ where: { code: PRO_PLAN_SEAT_29_CODE } });
  if (!plan) {
    throw new Error(
      `Cannot create checkout session for plan ${PRO_PLAN_SEAT_29_CODE}: plan not found.`
    );
  }

  const stripeProductId = getProPlanStripeProductId();
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
      `Cannot subscribe to plan ${PRO_PLAN_SEAT_29_CODE}: price not found for product ${stripeProductId}.`
    );
  }

  // Only allow a subscription to have a trial if the workspace never had a
  // subscription before.
  // User under the grandfathered free plan are not allowed to have a trial.
  let trialAllowed = true;
  const existingSubscription = await Subscription.findOne({
    where: {
      workspaceId: owner.id,
    },
  });
  if (existingSubscription) {
    trialAllowed = false;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    client_reference_id: owner.sId,
    customer_email: user.email,
    payment_method_types: ["card"],
    subscription_data: {
      metadata: {
        planCode: PRO_PLAN_SEAT_29_CODE,
        workspaceId: owner.sId,
      },
      // If trialPeriodDays is 0, we send "undefined" to Stripe.
      trial_period_days:
        trialAllowed && plan.trialPeriodDays ? plan.trialPeriodDays : undefined,
    },
    metadata: {
      planCode: PRO_PLAN_SEAT_29_CODE,
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
    success_url: `${config.getClientFacingUrl()}/w/${owner.sId}/subscription/payment_processing?type=succeeded&session_id={CHECKOUT_SESSION_ID}&plan_code=${PRO_PLAN_SEAT_29_CODE}`,
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
  const product = await stripe.products.retrieve(productId);
  return product;
};

/**
 * Calls the Stripe API to retrieve a subscription by its ID.
 */
export const getStripeSubscription = async (
  stripeSubscriptionId: string
): Promise<Stripe.Subscription | null> => {
  try {
    return await stripe.subscriptions.retrieve(stripeSubscriptionId);
  } catch (error) {
    return null;
  }
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
  await stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: false,
  });
  await stripe.subscriptions.cancel(stripeSubscriptionId, { prorate: true });

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
