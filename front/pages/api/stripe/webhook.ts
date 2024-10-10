import type { WithAPIErrorResponse } from "@dust-tt/types";
import { assertNever, ConnectorsAPI, removeNulls } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";
import { pipeline, Writable } from "stream";
import type Stripe from "stripe";
import { promisify } from "util";

import apiConfig from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import {
  sendAdminSubscriptionPaymentFailedEmail,
  sendCancelSubscriptionEmail,
  sendReactivateSubscriptionEmail,
} from "@app/lib/api/email";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { Plan, Subscription } from "@app/lib/models/plan";
import { Workspace } from "@app/lib/models/workspace";
import {
  assertStripeSubscriptionIsValid,
  createCustomerPortalSession,
  getStripeClient,
} from "@app/lib/plans/stripe";
import { maybeCancelInactiveTrials } from "@app/lib/plans/subscription";
import { countActiveSeatsInWorkspace } from "@app/lib/plans/usage/seats";
import { frontSequelize } from "@app/lib/resources/storage";
import { generateLegacyModelSId } from "@app/lib/resources/string_ids";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import {
  launchScheduleWorkspaceScrubWorkflow,
  terminateScheduleWorkspaceScrubWorkflow,
} from "@app/temporal/scrub_workspace/client";

export type GetResponseBody = {
  success: boolean;
  message?: string;
};

export const config = {
  api: {
    bodyParser: false, // Disable the default body parser
  },
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetResponseBody>>
): Promise<void> {
  const stripe = getStripeClient();

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
          apiConfig.getStripeSecretWebhookKey()
        );
      } catch (error) {
        logger.error(
          { error, stripeError: true },
          "Error constructing Stripe event in Webhook."
        );
      }

      if (!event) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Error constructing Stripe Webhook event.",
          },
        });
      }
      let subscription;
      let stripeSubscription;
      let invoice;
      const now = new Date();

      switch (event.type) {
        case "checkout.session.completed":
          // Payment is successful and the stripe subscription is created.
          // We can create the new subscription and end the active one if any.
          const session = event.data.object as Stripe.Checkout.Session;
          const workspaceId = session.client_reference_id;
          const stripeSubscriptionId = session.subscription;
          const planCode = session?.metadata?.planCode || null;
          const userId = session?.metadata?.userId || null;

          if (session.status === "open" || session.status === "expired") {
            // Open: The checkout session is still in progress. Payment processing has not started.
            // Expired: The checkout session has expired (e.g., because of lack of payment).
            logger.info(
              {
                workspaceId,
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
                stripeSubscriptionId,
                planCode,
                stripeError: true,
              },
              `[Stripe Webhook] Received checkout.session.completed with unkown status "${session.status}". Ignoring event.`
            );
            return res.status(200).json({ success: true });
          }

          try {
            if (
              workspaceId === null ||
              planCode === null ||
              typeof stripeSubscriptionId !== "string"
            ) {
              throw new Error("Missing required data in event.");
            }

            const workspace = await Workspace.findOne({
              where: { sId: workspaceId },
            });
            if (!workspace) {
              throw new Error(`Cannot find workspace ${workspaceId}`);
            }
            const plan = await Plan.findOne({
              where: { code: planCode },
            });
            if (!plan) {
              throw new Error(
                `Cannot subscribe to plan ${planCode}: not found.`
              );
            }

            await frontSequelize.transaction(async (t) => {
              const activeSubscription = await Subscription.findOne({
                where: { workspaceId: workspace.id, status: "active" },
                include: [
                  {
                    model: Plan,
                    as: "plan",
                  },
                ],
                transaction: t,
              });

              // We block a double subscription for a workspace on the same plan
              if (activeSubscription && activeSubscription.planId === plan.id) {
                logger.error(
                  {
                    workspaceId,
                    stripeSubscriptionId,
                    planCode,
                    stripeError: true,
                  },
                  "[Stripe Webhook] Received checkout.session.completed when we already have a subscription for this plan on the workspace. Check on Stripe dashboard."
                );

                return res.status(200).json({
                  success: false,
                  message:
                    "Conflict: Active subscription already exists for this workspace/plan.",
                });
              }

              // We block a new subscription if the active one is with payment
              if (
                activeSubscription &&
                activeSubscription.stripeSubscriptionId !== null
              ) {
                logger.error(
                  {
                    workspaceId,
                    stripeSubscriptionId,
                    planCode,
                    stripeError: true,
                  },
                  "[Stripe Webhook] Received checkout.session.completed when we already have a paid subscription on the workspace. Check on Stripe dashboard."
                );

                return res.status(200).json({
                  success: false,
                  message:
                    "Conflict: Active subscription with payment already exists for this workspace.",
                });
              }

              if (activeSubscription) {
                await activeSubscription.update(
                  {
                    status: "ended",
                    endDate: now,
                  },
                  { transaction: t }
                );
              }
              const stripeSubscription =
                await stripe.subscriptions.retrieve(stripeSubscriptionId);

              await Subscription.create(
                {
                  sId: generateLegacyModelSId(),
                  workspaceId: workspace.id,
                  planId: plan.id,
                  status: "active",
                  trialing: stripeSubscription.status === "trialing",
                  startDate: now,
                  stripeSubscriptionId: stripeSubscriptionId,
                },
                { transaction: t }
              );
            });
            if (userId) {
              const workspaceSeats = await countActiveSeatsInWorkspace(
                workspace.sId
              );
              await ServerSideTracking.trackSubscriptionCreated({
                userId,
                workspace: renderLightWorkspaceType({ workspace }),
                planCode,
                workspaceSeats,
                subscriptionStartAt: now,
              });
            }
            await unpauseAllConnectorsAndCancelScrub(
              await Authenticator.internalAdminForWorkspace(workspace.sId)
            );
            return res.status(200).json({ success: true });
          } catch (error) {
            logger.error(
              {
                error,
                workspaceId,
                stripeSubscriptionId,
                planCode,
                stripeError: true,
              },
              "Error creating subscription."
            );

            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message:
                  "Stripe Webhook: error handling checkout.session.completed.",
              },
            });
          }
        case "invoice.paid":
          // This is what confirms the subscription is active and payments are being made.
          logger.info(
            { event },
            "[Stripe Webhook] Received customer.invoice.paid event."
          );
          invoice = event.data.object as Stripe.Invoice;
          if (typeof invoice.subscription !== "string") {
            return _returnStripeApiError(
              req,
              res,
              "invoice.paid",
              "Subscription in event is not a string."
            );
          }
          // Setting subscription payment status to succeeded
          subscription = await Subscription.findOne({
            where: { stripeSubscriptionId: invoice.subscription },
            include: [Workspace],
          });
          if (!subscription) {
            return _returnStripeApiError(
              req,
              res,
              "invoice.paid",
              "Subscription not found."
            );
          }
          await subscription.update({ paymentFailingSince: null });
          break;
        case "invoice.payment_failed":
          // Occurs when payment failed or the user does not have a valid payment method.
          // The stripe subscription becomes "past_due".
          // We log it on the Subscription to display a banner and email the admins.
          logger.warn(
            { event },
            "[Stripe Webhook] Received invoice.payment_failed event."
          );
          invoice = event.data.object as Stripe.Invoice;

          // If the invoice is for a subscription creation, we don't need to do anything
          if (invoice.billing_reason === "subscription_create") {
            return res.status(200).json({ success: true });
          }

          if (typeof invoice.subscription !== "string") {
            return _returnStripeApiError(
              req,
              res,
              "invoice.payment_failed",
              "Subscription in event is not a string."
            );
          }

          // Logging that we have a failed payment
          subscription = await Subscription.findOne({
            where: { stripeSubscriptionId: invoice.subscription },
            include: [Workspace],
          });
          if (!subscription) {
            return _returnStripeApiError(
              req,
              res,
              "invoice.payment_failed",
              "Subscription not found."
            );
          }

          // TODO(2024-01-16 by flav) This line should be removed after all Stripe webhooks have been retried.
          // Previously, there was an error in how we handled the cancellation of subscriptions.
          // This change ensures that we return a success status if the subscription is already marked as "ended".
          if (subscription.status === "ended") {
            return res.status(200).json({ success: true });
          }

          if (subscription.paymentFailingSince === null) {
            await subscription.update({ paymentFailingSince: now });
          }

          // Send email to admins + customer email who subscribed in Stripe
          const auth = await Authenticator.internalAdminForWorkspace(
            subscription.workspace.sId
          );
          const owner = auth.workspace();
          const subscriptionType = auth.subscription();
          if (!owner || !subscriptionType) {
            return _returnStripeApiError(
              req,
              res,
              "invoice.payment_failed",
              "Couldn't get owner or subscription from `auth`."
            );
          }
          const { members } = await getMembers(auth, { roles: ["admin"] });
          const adminEmails = members.map((u) => u.email);
          const customerEmail = invoice.customer_email;
          if (customerEmail && !adminEmails.includes(customerEmail)) {
            adminEmails.push(customerEmail);
          }
          const portalUrl = await createCustomerPortalSession({
            owner,
            subscription: subscriptionType,
          });
          for (const adminEmail of adminEmails) {
            await sendAdminSubscriptionPaymentFailedEmail(
              adminEmail,
              portalUrl
            );
          }
          break;
        case "charge.dispute.created":
          const dispute = event.data.object as Stripe.Dispute;
          logger.error(
            { dispute, stripeError: true },
            "[Stripe Webhook] Received charge.dispute.created event. Please make sure the subscription is now marked as 'ended' in our database and canceled on Stripe."
          );
          break;

        case "customer.subscription.created": {
          const stripeSubscription = event.data.object as Stripe.Subscription;
          // on the odd chance the change is not compatible with our logic, we panic
          const validStatus =
            assertStripeSubscriptionIsValid(stripeSubscription);
          if (validStatus.isErr()) {
            logger.error(
              {
                stripeError: true,
                event,
                stripeSubscriptionId: stripeSubscription.id,
                invalidity_message: validStatus.error.invalidity_message,
              },
              "[Stripe Webhook] Received customer.subscription.created event with invalid subscription."
            );
          }
          break;
        }

        case "customer.subscription.updated":
          // Occurs when the subscription is updated:
          // - when the number of seats changes for a metered billing.
          // - when the subscription is canceled by the user: it is ended at the of the billing period, and we will receive a "customer.subscription.deleted" event.
          // - when the subscription is activated again after being canceled but before the end of the billing period.
          // - when trial expires, and the subscription transitions to a paid plan.
          logger.info(
            { event },
            "[Stripe Webhook] Received customer.subscription.updated event."
          );
          stripeSubscription = event.data.object as Stripe.Subscription;
          const previousAttributes = event.data.previous_attributes;
          if (!previousAttributes) {
            break;
          } // should not happen by definition of the subscription.updated event
          if (
            // The subscription is canceled (but not yet ended) or reactivated
            stripeSubscription.status === "active" &&
            "cancel_at_period_end" in previousAttributes
          ) {
            // first update subscription endDate in our database
            // cancel_at set means the user just canceled, unset means the user just reactivated
            const endDate = stripeSubscription.cancel_at
              ? new Date(stripeSubscription.cancel_at * 1000)
              : null;

            // get subscription
            const subscription = await Subscription.findOne({
              where: { stripeSubscriptionId: stripeSubscription.id },
              include: [Workspace],
            });
            if (!subscription) {
              return apiError(req, res, {
                status_code: 500,
                api_error: {
                  type: "internal_server_error",
                  message:
                    "[Stripe Webhook] canceling subscription: Subscription not found.",
                },
              });
            }
            await subscription.update({
              endDate,
              // If the subscription is canceled, we set the requestCancelAt date to now.
              // If the subscription is reactivated, we unset the requestCancelAt date.
              requestCancelAt: endDate ? now : null,
            });
            const auth = await Authenticator.internalAdminForWorkspace(
              subscription.workspace.sId
            );
            if (!endDate) {
              // Subscription is re-activated, so we need to unpause the connectors in case they were paused.
              await unpauseAllConnectorsAndCancelScrub(auth);

              ServerSideTracking.trackSubscriptionReactivated({
                workspace: renderLightWorkspaceType({
                  workspace: subscription.workspace,
                }),
              }).catch((e) => {
                logger.error(
                  {
                    error: e,
                    workspaceId: subscription.workspace.sId,
                    stripeError: true,
                  },
                  "Error tracking subscription reactivated."
                );
              });
            } else {
              ServerSideTracking.trackSubscriptionRequestCancel({
                workspace: renderLightWorkspaceType({
                  workspace: subscription.workspace,
                }),
                requestCancelAt: now,
              }).catch((e) => {
                logger.error(
                  {
                    error: e,
                    workspaceId: subscription.workspace.sId,
                    stripeError: true,
                  },
                  "Error tracking subscription request cancel."
                );
              });
            }

            // then email admins
            const { members } = await getMembers(auth, { roles: ["admin"] });
            const adminEmails = members.map((u) => u.email);
            if (adminEmails.length === 0) {
              return apiError(req, res, {
                status_code: 500,
                api_error: {
                  type: "internal_server_error",
                  message:
                    "[Stripe Webhook] canceling subscription: Error getting admin emails.",
                },
              });
            }
            // send email to admins
            for (const adminEmail of adminEmails) {
              if (endDate) {
                await sendCancelSubscriptionEmail(
                  adminEmail,
                  subscription.workspace.sId,
                  endDate
                );
              } else {
                await sendReactivateSubscriptionEmail(adminEmail);
              }
            }
          } else if (stripeSubscription.status === "active") {
            const subscription = await Subscription.findOne({
              where: { stripeSubscriptionId: stripeSubscription.id },
            });
            if (!subscription) {
              return apiError(req, res, {
                status_code: 500,
                api_error: {
                  type: "internal_server_error",
                  message:
                    "[Stripe Webhook] Failed to update subscription after trial ended: Subscription not found.",
                },
              });
            }
            if (subscription.trialing) {
              await subscription.update({ status: "active", trialing: false });
            }
          }

          // on the odd chance the change is not compatible with our logic, we panic
          const validStatus =
            assertStripeSubscriptionIsValid(stripeSubscription);
          if (validStatus.isErr()) {
            logger.error(
              {
                stripeError: true,
                event,
                stripeSubscriptionId: stripeSubscription.id,
                invalidity_message: validStatus.error.invalidity_message,
              },
              "[Stripe Webhook] Received customer.subscription.updated event with invalid subscription."
            );
          }
          break;

        // Occurs when the subscription is canceled by the user or by us.
        case "customer.subscription.deleted":
          logger.info(
            { event },
            "[Stripe Webhook] Received customer.subscription.deleted event."
          );
          stripeSubscription = event.data.object as Stripe.Subscription;

          if (stripeSubscription.status !== "canceled") {
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: `[Stripe Webhook] Received customer.subscription.deleted with unknown status = ${stripeSubscription.status}. Expected status = canceled.`,
              },
            });
          }

          const matchingSubscription = await Subscription.findOne({
            where: { stripeSubscriptionId: stripeSubscription.id },
            include: [Workspace],
          });

          if (!matchingSubscription) {
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message:
                  "Stripe Webhook: Error handling customer.subscription.deleted. Matching subscription not found on db.",
              },
            });
          }

          switch (matchingSubscription.status) {
            case "ended":
              // That means the webhook was already received and processed as only Stripe should set the status to ended on a subscription with a stripeSubscriptionId.
              logger.info(
                { event },
                "[Stripe Webhook] Received customer.subscription.deleted event but the subscription was already with status = ended. Doing nothing."
              );
              break;
            case "ended_backend_only":
              // This status is set by the backend after a Poké workspace migration from one plan to another.
              // We don't want to delete any data in this case as the workspace is still active.
              // We just want to mark the subscription as ended (so that we know it's been processed by Stripe).
              logger.info(
                { event },
                "[Stripe Webhook] Received customer.subscription.deleted event with the subscription status = ended_backend_only. Ending the subscription without deleting any data"
              );
              await matchingSubscription.update({
                status: "ended",
                endDate: new Date(),
              });
              break;
            case "active":
              logger.info(
                { event },
                "[Stripe Webhook] Received customer.subscription.deleted event with the subscription status = active. Ending the subscription and deleting some workspace data"
              );
              await matchingSubscription.update({
                status: "ended",
                endDate: new Date(),
              });

              const scheduleScrubRes =
                await launchScheduleWorkspaceScrubWorkflow({
                  workspaceId: matchingSubscription.workspace.sId,
                });
              if (scheduleScrubRes.isErr()) {
                logger.error(
                  { stripeError: true, error: scheduleScrubRes.error },
                  "Error launching scrub workspace workflow"
                );
                return apiError(req, res, {
                  status_code: 500,
                  api_error: {
                    type: "internal_server_error",
                    message: `Error launching scrub workspace workflow: ${scheduleScrubRes.error.message}`,
                  },
                });
              }
              break;
            default:
              assertNever(matchingSubscription.status);
          }

          break;

        case "customer.subscription.trial_will_end":
          logger.info(
            { event },
            "[Stripe Webhook] Received customer.subscription.trial_will_end."
          );
          stripeSubscription = event.data.object as Stripe.Subscription;

          const trialingSubscription = await Subscription.findOne({
            where: { stripeSubscriptionId: stripeSubscription.id },
            include: [Workspace],
          });

          if (!trialingSubscription) {
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message:
                  "Stripe Webhook: Error handling customer.subscription.trial_will_end. Matching subscription not found on db.",
              },
            });
          }

          await maybeCancelInactiveTrials(
            await Authenticator.internalAdminForWorkspace(
              trialingSubscription.workspace.sId
            ),
            stripeSubscription
          );

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

function _returnStripeApiError(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetResponseBody>>,
  event: string,
  message: string
) {
  return apiError(req, res, {
    status_code: 500,
    api_error: {
      type: "internal_server_error",
      message: `[Stripe Webhook][${event}] ${message}`,
    },
  });
}

async function unpauseAllConnectorsAndCancelScrub(auth: Authenticator) {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Missing workspace on auth.");
  }
  const scrubCancelRes = await terminateScheduleWorkspaceScrubWorkflow({
    workspaceId: owner.sId,
  });
  if (scrubCancelRes.isErr()) {
    logger.error(
      { stripeError: true, error: scrubCancelRes.error },
      "Error terminating scrub workspace workflow."
    );
  }
  const dataSources = await getDataSources(auth);
  const connectorIds = removeNulls(dataSources.map((ds) => ds.connectorId));
  const connectorsApi = new ConnectorsAPI(
    apiConfig.getConnectorsAPIConfig(),
    logger
  );
  for (const connectorId of connectorIds) {
    const r = await connectorsApi.unpauseConnector(connectorId);
    if (r.isErr()) {
      logger.error(
        { stripeError: true, error: r.error },
        "Error unpausing connector after subscription reactivation."
      );
    }
  }
}

export default withLogging(handler);
