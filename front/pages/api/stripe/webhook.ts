import { NextApiRequest, NextApiResponse } from "next";
import { pipeline, Writable } from "stream";
import Stripe from "stripe";
import { promisify } from "util";

import { front_sequelize } from "@app/lib/databases";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { Plan, Subscription, Workspace } from "@app/lib/models";
import { getProductIdFromStripeSubscriptionId } from "@app/lib/plans/stripe";
import { generateModelSId } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

const { STRIPE_SECRET_KEY = "", STRIPE_SECRET_WEBHOOK_KEY = "" } = process.env;

export type GetResponseBody = {
  success: true;
};

export const config = {
  api: {
    bodyParser: false, // Disable the default body parser
  },
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  if (!STRIPE_SECRET_WEBHOOK_KEY || !STRIPE_SECRET_KEY) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "stripe_webhook_error",
        message: "Stripe keys are not defined.",
      },
    });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16",
    typescript: true,
  });

  switch (req.method) {
    case "GET":
      return res.status(200).json({ success: true });

    case "POST":
      const sig = req.headers["stripe-signature"] as string;
      let event: Stripe.Event | null = null;

      // Collect raw body using stream pipeline
      let rawBody = "";
      const collector = new Writable({
        write(chunk, encoding, callback) {
          rawBody += chunk.toString();
          callback();
        },
      });
      await promisify(pipeline)(req, collector);

      try {
        event = stripe.webhooks.constructEvent(
          rawBody,
          sig,
          STRIPE_SECRET_WEBHOOK_KEY
        );
      } catch (error) {
        logger.error({ error }, "Error constructing Stripe event in Webhook.");
      }

      if (!event) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "stripe_webhook_error",
            message: "Error constructing event.",
          },
        });
      }

      switch (event.type) {
        case "checkout.session.completed":
          // Payment is successful and the stripe subscription is created.
          // We can create the new subscription and end the active one if any.
          const session = event.data.object as Stripe.Checkout.Session;
          const workspaceId = session.client_reference_id;
          const stripeCustomerId = session.customer;
          const stripeSubscriptionId = session.subscription;
          const planCode = session?.metadata?.planCode || null;
          const now = new Date();

          if (session.status === "open" || session.status === "expired") {
            // Open: The checkout session is still in progress. Payment processing has not started.
            // Expired: The checkout session has expired (e.g., because of lack of payment).
            logger.info(
              {
                workspaceId,
                stripeCustomerId,
                stripeSubscriptionId,
                planCode,
              },
              `[Stripe Webhook] Received checkout.session.completed with status "${session.status}". Ignoring event.`
            );
            return res.status(200).json({ success: true });
          }
          if (session.status !== "complete") {
            logger.error(
              {
                workspaceId,
                stripeCustomerId,
                stripeSubscriptionId,
                planCode,
              },
              `[Stripe Webhook] Received checkout.session.completed with unkown status "${session.status}". Ignoring event.`
            );
            return res.status(200).json({ success: true });
          }

          if (
            stripeCustomerId === null ||
            typeof stripeCustomerId !== "string"
          ) {
            logger.error(
              {
                stripeCustomerId,
              },
              `[Stripe Webhook] Received checkout.session.completed with missing stripe customer id. Ignoring event.`
            );
            return res.status(200).json({ success: true });
          }
          if (
            stripeSubscriptionId === null ||
            typeof stripeSubscriptionId !== "string"
          ) {
            logger.error(
              {
                stripeCustomerId,
              },
              `[Stripe Webhook] Received checkout.session.completed with missing stripe subscription id. Ignoring event.`
            );
            return res.status(200).json({ success: true });
          }

          // If we already have a subscription for this workspace and this stripe subscription we can ignore the event.
          const activeSubscriptionForCustomer = await Subscription.findOne({
            where: {
              stripeCustomerId: stripeCustomerId,
              status: "active",
            },
          });
          if (
            activeSubscriptionForCustomer &&
            activeSubscriptionForCustomer.stripeSubscriptionId ===
              stripeSubscriptionId
          ) {
            logger.info(
              {
                workspaceId,
                stripeCustomerId,
                stripeSubscriptionId,
                planCode,
              },
              "[Stripe Webhook] Received checkout.session.completed when we already have a subscription for this workspace and this stripe subscription. Ignoring event"
            );
            return res.status(200).json({ success: true });
          }

          // We should have the workspace id in the session.client_reference_id field, but it seems that it is not always the case.
          // If we don't have it, we can try to find it from the active subscription of the customer.
          const workspace = workspaceId
            ? await Workspace.findOne({
                where: {
                  sId: workspaceId,
                },
              })
            : activeSubscriptionForCustomer
            ? await Workspace.findOne({
                where: {
                  id: activeSubscriptionForCustomer.workspaceId,
                },
              })
            : null;
          if (!workspace) {
            logger.error(
              {
                workspaceId,
                stripeCustomerId,
                stripeSubscriptionId,
                planCode,
              },
              "[Stripe Webhook] Received checkout.session.completed with missing workspace id. Ignoring event."
            );
            return res.status(200).json({ success: true });
          }

          try {
            await front_sequelize.transaction(async (t) => {
              // If we already have a subscription for this workspace but with a different stripe subscription, we can end the active one and create a new one.
              const activeSubscription = await Subscription.findOne({
                where: {
                  workspaceId: workspace.id,
                  status: "active",
                },
              });
              if (activeSubscription) {
                await activeSubscription.update(
                  {
                    status: "ended",
                    endDate: now,
                  },
                  { transaction: t }
                );
              }

              // We should have the plan code in the session.metadata field, but it seems that it is not always the case.
              // If we don't have it, we can try to find it from fetching the product id from the stripe subscription.
              let plan: Plan | null = null;
              if (planCode) {
                plan = await Plan.findOne({
                  where: {
                    code: planCode,
                  },
                });
              } else {
                const productId = await getProductIdFromStripeSubscriptionId(
                  stripeSubscriptionId
                );
                if (productId) {
                  plan = await Plan.findOne({
                    where: {
                      stripeProductId: productId,
                    },
                  });
                }
              }

              if (!plan) {
                throw new Error(
                  `[Stripe Webhook] Received checkout.session.completed with missing planCode in metadata. Cannot find the plan for the subscription ${stripeSubscriptionId}.`
                );
              }

              await Subscription.create(
                {
                  sId: generateModelSId(),
                  workspaceId: workspace.id,
                  planId: plan.id,
                  status: "active",
                  startDate: now,
                  stripeSubscriptionId: stripeSubscriptionId,
                  stripeCustomerId: stripeCustomerId,
                },
                { transaction: t }
              );
            });

            return res.status(200).json({ success: true });
          } catch (error) {
            logger.error(
              {
                error,
                workspaceId,
                stripeCustomerId,
                stripeSubscriptionId,
                planCode,
              },
              "Error creating subscription."
            );

            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "stripe_webhook_error",
                message: "Error handling checkout.session.completed.",
              },
            });
          }
        case "invoice.paid":
          // This is what confirms the subscription is active and payments are being made.
          // Should we store the last invoice date in the subscription?
          logger.info(
            { event },
            "[Stripe Webhook] Received customer.invoice.paid event."
          );
          break;
        case "invoice.payment_failed":
          // Occurs when payment failed or the user does not have a valid payment method.
          // The stripe subscription becomes "past_due".
          // We keep active and email the user and us to manually manage those cases first?
          logger.warn(
            { event },
            "[Stripe Webhook] Received invoice.payment_failed event."
          );
          break;
        case "customer.subscription.updated":
          // Occurs when the subscription is updated:
          // - when the number of seats changes for a metered billing.
          // - when the subscription is canceled by the user: it is ended at the of the billing period, and we will receive a "customer.subscription.deleted" event.
          // - when the subscription is activated again after being canceled but before the end of the billing period.
          logger.info(
            { event },
            "[Stripe Webhook] Received customer.subscription.updated event."
          );
          break;
        case "customer.subscription.deleted":
          // Occurs when the subscription is canceled by the user or by us.
          const stripeSubscription = event.data.object as Stripe.Subscription;
          if (stripeSubscription.status === "canceled") {
            // We can end the subscription in our database.
            const activeSubscription = await Subscription.findOne({
              where: { stripeSubscriptionId: stripeSubscription.id },
            });
            if (!activeSubscription) {
              return apiError(req, res, {
                status_code: 500,
                api_error: {
                  type: "stripe_webhook_error",
                  message:
                    "Error handling customer.subscription.deleted. Subscription not found.",
                },
              });
            }
            await activeSubscription.update({
              status: "ended",
              endDate: new Date(),
            });
          } else {
            logger.warn(
              { event },
              "[Stripe Webhook] Received customer.subscription.deleted event but the subscription is not canceled."
            );
          }
          break;
        default:
        // Unhandled event type
      }

      return res.status(200).json({ success: true });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
