import { buffer } from "micro";
import { XP1User } from "../../../lib/models";
import { new_id } from "../../../lib/utils";
import { sendActivationKey } from "../../../lib/sendgrid";

const { XP1_STRIPE_ENDPOINT_SECRET, XP1_STRIPE_API_KEY } = process.env;

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  const stripe = require("stripe")(XP1_STRIPE_API_KEY);

  const signature = req.headers["stripe-signature"];
  const buf = await buffer(req);

  let event = null;
  try {
    event = stripe.webhooks.constructEvent(
      buf,
      signature,
      XP1_STRIPE_ENDPOINT_SECRET
    );
  } catch (err) {
    return res.status(400).json({ error: { message: err.message } });
  }

  let subscription = null;

  switch (event.type) {
    case "customer.subscription.deleted":
      console.log(`Handling event: ${event.type}`);
      subscription = event.data.object;
      break;
    case "customer.subscription.created":
      console.log(`Handling event: ${event.type}`);
      subscription = event.data.object;
      break;
    case "customer.subscription.updated":
      console.log(`Handling event: ${event.type}`);
      subscription = event.data.object;
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  if (subscription) {
    let customer = await stripe.customers.retrieve(subscription.customer);

    console.log(`SUBSCRIPTION_UPDATE`, {
      subscription: subscription.id,
      item: subscription.items.data[0].id,
      status: subscription.status,
      email: customer.email,
      name: customer.name,
    });

    let user = await XP1User.findOne({
      where: {
        stripeSubscription: subscription.id,
      },
    });
    if (!user) {
      let secret = `sk-${new_id().slice(0, 32)}`;
      user = await XP1User.create({
        secret,
        email: customer.email || "",
        name: customer.name || "",
        stripeSubscription: subscription.id,
        stripeSubscriptionStatus: subscription.status,
        stripeSubscriptionItem: subscription.items.data[0].id,
      });
      await sendActivationKey(user);
    } else {
      await user.update({
        stripeSubscriptionStatus: subscription.status,
        stripeSubscriptionItem: subscription.items.data[0].id,
      });
    }
  }

  res.status(200).json({ received: true });
}
