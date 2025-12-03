import { getCustomerStatus } from "@app/lib/credits/free";
import {
  getStripeClient,
  getStripeSubscription,
  getSubscriptionInvoices,
} from "@app/lib/plans/stripe";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  isStripeInvoiceEvent,
  isStripeSubscriptionEvent,
} from "@app/lib/types/stripe/events";
import { makeScript } from "@app/scripts/helpers";

async function inspectFromEvent(eventId: string, logger: any) {
  const stripe = getStripeClient();

  const event = await stripe.events.retrieve(eventId);
  logger.info(`Event type: ${event.type}`);

  let stripeSubscriptionId: string;

  if (isStripeSubscriptionEvent(event)) {
    stripeSubscriptionId = event.data.object.id;
  } else if (isStripeInvoiceEvent(event)) {
    const subscription = event.data.object.subscription;
    if (!subscription) {
      logger.error("Invoice event has no subscription");
      return;
    }
    stripeSubscriptionId =
      typeof subscription === "string" ? subscription : subscription.id;
  } else {
    logger.error(
      `Unsupported event type: ${event.type}. Expected subscription or invoice event.`
    );
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

  const dustSubscription =
    await SubscriptionResource.fetchByStripeId(stripeSubscriptionId);
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
