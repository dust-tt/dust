import type { Result, WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import { assertNever, Err, Ok } from "@dust-tt/types";
import { Stripe } from "stripe";

import type { Authenticator } from "@app/lib/auth";
import { Plan, Subscription } from "@app/lib/models";
import { countActiveSeatsInWorkspace } from "@app/lib/plans/usage/seats";

const { STRIPE_SECRET_KEY = "", URL = "" } = process.env;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
  typescript: true,
});

/**
 * Calls the Stripe API to get the price ID for a given product ID.
 */
async function getPriceId(productId: string): Promise<string | null> {
  const prices = await stripe.prices.list({ product: productId, active: true });
  if (prices.data.length > 0) {
    const [firstActivePrice] = prices.data;
    return firstActivePrice.id;
  }
  return null;
}

/**
 * Calls the Stripe API to create a checkout session for a given workspace/plan.
 * We return the URL of the checkout session.
 * Once the users has completed the checkout, we will receive an event on our Stripe webhook
 * The `auth` role is not checked, because we allow anyone (even if not logged in or not part of the WS)
 * to go through the checkout process.
 */
export const createCheckoutSession = async ({
  auth,
  planCode,
}: {
  auth: Authenticator;
  planCode: string;
}): Promise<string | null> => {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("No workspace found");
  }
  const user = auth.user();
  if (!user) {
    throw new Error("No user found");
  }

  const plan = await Plan.findOne({ where: { code: planCode } });
  if (!plan) {
    throw new Error(
      `Cannot create checkout session for plan ${planCode}: plan not found.`
    );
  }
  if (!plan.stripeProductId) {
    throw new Error(
      `Cannot create checkout session for plan ${planCode}: no Stripe product ID found.`
    );
  }

  if (plan.billingType === "free") {
    throw new Error(`Cannot subscribe to plan ${planCode}: plan is free.`);
  }

  const priceId = await getPriceId(plan.stripeProductId);
  if (!priceId) {
    throw new Error(
      `Cannot subscribe to plan ${planCode}: price not found for product ${plan.stripeProductId}.`
    );
  }

  let item: { price: string; quantity?: number } | null = null;

  switch (plan.billingType) {
    case "fixed":
      // For a fixed price, quantity is 1 and will not change.
      item = {
        price: priceId,
        quantity: 1,
      };
      break;
    case "per_seat":
      // For a metered billing based on the number of seats, we create a line item with quantity = number of users in the workspace.
      // We will update the quantity of the line item when the number of users changes.
      item = {
        price: priceId,
        quantity: await countActiveSeatsInWorkspace(owner.sId),
      };
      break;
    case "monthly_active_users":
      // For a metered billing based on the usage, we create a line item with no quantity.
      // We will notify Stripe of the usage when users are active in the workspace: when they post a message.
      item = {
        price: priceId,
      };
      break;
    default:
      assertNever(plan.billingType);
  }

  // Only allow a subscription to have a trial if the workspace never had a
  // subscription before.
  // User under the grandfathered free plan are not allowed to have a trial.
  let trialAllowed = true;
  if (
    await Subscription.findOne({
      where: {
        workspaceId: owner.id,
      },
    })
  ) {
    trialAllowed = false;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    client_reference_id: owner.sId,
    customer_email: user.email,
    customer: auth.subscription()?.stripeCustomerId || undefined,
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
    line_items: [item],
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    automatic_tax: {
      enabled: true,
    },
    tax_id_collection: {
      enabled: true,
    },
    success_url: `${URL}/w/${owner.sId}/subscription?type=succeeded&session_id={CHECKOUT_SESSION_ID}&plan_code=${planCode}`,
    cancel_url: `${URL}/w/${owner.sId}/subscription?type=cancelled`,
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
  if (!subscription.stripeCustomerId) {
    throw new Error(
      `No customer ID found for the workspace with id: ${owner.id}`
    );
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${URL}/w/${owner.sId}/subscription`,
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
 * Calls the Stripe API to update the quantity of a subscription.
 * Used for our "per seat" billing.
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

const REPORT_USAGE_VALUES = ["MAU_1", "MAU_5", "MAU_10", "PER_SEAT"];

/**
 * Checks that a subscription created in Stripe is usable by Dust, returns an
 * error otherwise.
 */
export function assertStripeSubscriptionValid(
  stripeSubscription: Stripe.Subscription
): Result<true, { invalidity_message: string }> {
  if (stripeSubscription.items.data.length === 0) {
    return new Err({ invalidity_message: "Subscription has no items." });
  }

  // very unlikely, so handling is overkill at time of writing
  if (stripeSubscription.items.has_more) {
    return new Err({
      invalidity_message: "Subscription has too many items.",
    });
  }

  // All the business logic checks below are validating that the stripe
  // subscription doesn't have a configuration that we don't support
  for (const item of stripeSubscription.items.data) {
    if (item.deleted) {
      continue;
    }

    if (item.price.recurring) {
      if (item.price.recurring.usage_type !== "metered") {
        return new Err({
          invalidity_message: `Subscription recurring price has invalid usage_type '${item.price.recurring.usage_type}'. Only 'metered' usage_type is allowed.`,
        });
      }

      if (!REPORT_USAGE_VALUES.includes(item.price.metadata?.REPORT_USAGE)) {
        return new Err({
          invalidity_message:
            "Subscription recurring price should have a REPORT_USAGE metadata with values in " +
            JSON.stringify(REPORT_USAGE_VALUES),
        });
      }

      if (item.price.recurring.aggregate_usage !== "last_during_period") {
        return new Err({
          invalidity_message:
            "Subscription recurring price has invalid aggregate_usage, should be last duing period",
        });
      }

      if (
        item.price.recurring.interval !== "month" ||
        item.price.recurring.interval_count !== 1
      ) {
        return new Err({
          invalidity_message:
            "Subscription recurring price has invalid interval, only 1-month intervals are allowed.",
        });
      }
    }
  }

  // the subscription is not active
  if (stripeSubscription.status !== "active") {
    return new Err({
      invalidity_message: "Subscription is not active.",
    });
  }
  return new Ok(true);
} // TODO(2024-04-05,pr): immediately after flav's merge, use the global constant
