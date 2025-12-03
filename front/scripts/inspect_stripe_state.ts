import type Stripe from "stripe";

import { getCustomerStatus } from "@app/lib/credits/free";
import { Subscription } from "@app/lib/models/plan";
import {
  getStripeClient,
  getStripeSubscription,
  getSubscriptionInvoices,
} from "@app/lib/plans/stripe";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";

async function inspectFromEvent(eventId: string, logger: any) {
  const stripe = getStripeClient();

  const event = await stripe.events.retrieve(eventId);
  logger.info(`Event type: ${event.type}`);

  const eventData = event.data.object as Stripe.Subscription | Stripe.Invoice;
  let stripeSubscriptionId: string;

  if ("subscription" in eventData && eventData.subscription) {
    stripeSubscriptionId =
      typeof eventData.subscription === "string"
        ? eventData.subscription
        : eventData.subscription.id;
  } else if (
    "id" in eventData &&
    event.type.startsWith("customer.subscription")
  ) {
    stripeSubscriptionId = eventData.id;
  } else {
    logger.error("Could not extract subscription ID from event");
    return;
  }

  logger.info(`Stripe Subscription ID: ${stripeSubscriptionId}`);

  const stripeSubscription = await getStripeSubscription(stripeSubscriptionId);
  if (!stripeSubscription) {
    logger.warn("Stripe Subscription not found");
    return;
  }

  const workspaceId = stripeSubscription.metadata?.workspaceId;
  logger.info(`Workspace ID from Stripe metadata: ${workspaceId}`);

  const dustSubscription = await Subscription.findOne({
    where: { stripeSubscriptionId },
  });
  if (!dustSubscription) {
    logger.warn("Dust Subscription not found");
    return;
  }

  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    logger.warn("Workspace not found");
    return;
  }

  logger.info(`Workspace sId: ${workspace.sId}, name: ${workspace.name}`);
  logger.info(`Dust Subscription status: ${dustSubscription.status}`);
  logger.info(
    `Customer status: ${await getCustomerStatus(stripeSubscription)}`
  );

  const paidInvoices = await getSubscriptionInvoices(stripeSubscription.id, {
    status: "paid",
    limit: 1,
  });
  if (paidInvoices && paidInvoices.length > 0) {
    const mostRecentInvoice = paidInvoices[0];
    const currentPeriodStartSec = stripeSubscription.current_period_start;
    const invoicePeriodEndSec = mostRecentInvoice.period_end;
    const ageSec = currentPeriodStartSec - invoicePeriodEndSec;
    logger.info(
      { mostRecentInvoice, currentPeriodStartSec, invoicePeriodEndSec, ageSec },
      "Most recent paid invoice"
    );
  }
}

makeScript(
  {
    eventId: {
      type: "string",
      demandOption: true,
    },
  },
  async ({ eventId }, logger) => {
    await inspectFromEvent(eventId, logger);
  }
);
