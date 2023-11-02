import Stripe from "stripe";

import { PlanType, WorkspaceType } from "@app/types/user";

const { STRIPE_SECRET_KEY = "", URL = "" } = process.env;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
  typescript: true,
});

/**
 * Calls the Stripe API to get the price ID for a given product ID.
 */
async function getPriceId(productId: string): Promise<string | null> {
  const prices = await stripe.prices.list({ product: productId });
  if (prices.data.length > 0) {
    const priceId = prices.data[0].id;
    return priceId;
  }
  return null;
}

/**
 * Calls the Stripe API to create a checkout session for a given workspace/plan.
 * We return the URL of the checkout session.
 * Once the users has completed the checkout, we will receive an event on our Stripe webhook
 */
export const createCheckoutSession = async ({
  owner,
  planCode,
  productId,
  isFixedPriceBilling,
  stripeCustomerId,
}: {
  owner: WorkspaceType;
  planCode: string;
  productId: string;
  isFixedPriceBilling: boolean;
  stripeCustomerId: string | null;
}): Promise<string | null> => {
  const priceId = await getPriceId(productId);
  if (!priceId) {
    throw new Error(
      `Cannot subscribe to plan ${planCode}:  price not found for product ${productId}.`
    );
  }

  const item = isFixedPriceBilling
    ? {
        price: priceId,
        quantity: 1, // Fix the quantity to 1 for fixed price billing
      }
    : {
        price: priceId,
      };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    client_reference_id: owner.sId,
    customer: stripeCustomerId ? stripeCustomerId : undefined,
    metadata: {
      planCode: planCode,
    },
    line_items: [item],
    billing_address_collection: "auto",
    success_url: `${URL}/w/${owner.sId}/subscription?type=succeeded&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${URL}/w/${owner.sId}/subscription?type=cancelled`,
  });

  return session.url;
};

/**
 * Calls the Stripe API to create a customer portal session for a given workspace/plan.
 * This allows the user to access her Stripe dashbaord without having to log in on Stripe.
 */
export const createCustomerPortalSession = async ({
  owner,
  plan,
}: {
  owner: WorkspaceType;
  plan: PlanType;
}): Promise<string | null> => {
  if (!plan.stripeCustomerId) {
    throw new Error("No customer ID found for the workspace");
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: plan.stripeCustomerId,
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
