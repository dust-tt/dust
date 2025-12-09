import assert from "assert";
import type { NextApiRequest, NextApiResponse } from "next";
import { pipeline, Writable } from "stream";
import type Stripe from "stripe";
import { promisify } from "util";
import { z } from "zod";

import apiConfig from "@app/lib/api/config";
import {
  sendAdminSubscriptionPaymentFailedEmail,
  sendCancelSubscriptionEmail,
  sendReactivateSubscriptionEmail,
} from "@app/lib/api/email";
import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import {
  startCreditFromProOneOffInvoice,
  voidFailedProCreditPurchaseInvoice,
} from "@app/lib/credits/committed";
import { grantFreeCreditsFromSubscriptionStateChange } from "@app/lib/credits/free";
import {
  allocatePAYGCreditsOnCycleRenewal,
  invoiceEnterprisePAYGCredits,
  isPAYGEnabled,
} from "@app/lib/credits/payg";
import { PlanModel, SubscriptionModel } from "@app/lib/models/plan";
import {
  assertStripeSubscriptionIsValid,
  createCustomerPortalSession,
  getStripeClient,
  getStripeSubscription,
  isCreditPurchaseInvoice,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { countActiveSeatsInWorkspace } from "@app/lib/plans/usage/seats";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import { apiError, withLogging } from "@app/logger/withlogging";
import { launchScheduleWorkspaceScrubWorkflow } from "@app/temporal/scrub_workspace/client";
import { launchWorkOSWorkspaceSubscriptionCreatedWorkflow } from "@app/temporal/workos_events_queue/client";
import type { WithAPIErrorResponse } from "@app/types";
import { assertNever, isString } from "@app/types";

export type GetResponseBody = {
  success: boolean;
  message?: string;
};

export const config = {
  api: {
    bodyParser: false, // Disable the default body parser
  },
};

export const StripeBillingPeriodSchema = z.object({
  current_period_start: z.number(),
  current_period_end: z.number(),
});

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
      let rawBody = Buffer.from("");
      const collector = new Writable({
        write(chunk, _encoding, callback) {
          rawBody = Buffer.concat([rawBody, chunk]);
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
        logger.error({ error }, "Error constructing Stripe event in Webhook.");
      }

      if (!event) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "internal_server_error",
            message:
              "Invalid Stripe Webhook event, the signature may not be valid.",
          },
        });
      }

      logger.info(
        { sig, stripeError: false, event },
        "Processing Stripe event."
      );

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
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          const planCode = session?.metadata?.planCode || null;
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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

            const workspace = await WorkspaceResource.fetchById(workspaceId);
            if (!workspace) {
              logger.warn(
                {
                  event,
                  workspaceId,
                  subscriptionId: stripeSubscriptionId,
                },
                "[Stripe Webhook] Cannot find workspace."
              );
              // We return a 200 here to handle multiple regions, DD will watch
              // the warnings and create an alert if this log appears in all regions
              return res.status(200).json({ success: true });
            }
            const plan = await PlanModel.findOne({
              where: { code: planCode },
            });
            if (!plan) {
              throw new Error(
                `Cannot subscribe to plan ${planCode}: not found.`
              );
            }

            await withTransaction(async (t) => {
              const activeSubscription = await SubscriptionModel.findOne({
                where: { workspaceId: workspace.id, status: "active" },
                include: [
                  {
                    model: PlanModel,
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

              await SubscriptionModel.create(
                {
                  sId: generateRandomModelSId(),
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
            await restoreWorkspaceAfterSubscription(
              await Authenticator.internalAdminForWorkspace(workspace.sId)
            );

            await launchWorkOSWorkspaceSubscriptionCreatedWorkflow({
              workspaceId,
            });

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
        case "invoice.paid": {
          // This is what confirms the subscription is active and payments are being made.
          logger.info(
            { event },
            "[Stripe Webhook] Received customer.invoice.paid event."
          );
          const invoice = event.data.object as Stripe.Invoice;
          if (typeof invoice.subscription !== "string") {
            return _returnStripeApiError(
              req,
              res,
              "invoice.paid",
              "Subscription in event is not a string."
            );
          }
          // Setting subscription payment status to succeeded
          const subscription = await SubscriptionModel.findOne({
            where: { stripeSubscriptionId: invoice.subscription },
            include: [WorkspaceModel],
          });

          if (!subscription || !subscription.stripeSubscriptionId) {
            logger.warn(
              {
                event,
                stripeSubscriptionId: invoice.subscription,
              },
              "[Stripe Webhook] Subscription not found."
            );
            // We return a 200 here to handle multiple regions, DD will watch
            // the warnings and create an alert if this log appears in all regions
            return res.status(200).json({ success: true });
          }

          const stripeSubscription = await getStripeSubscription(
            subscription.stripeSubscriptionId
          );

          if (!stripeSubscription) {
            logger.warn(
              {
                event,
                stripeSubscriptionId: invoice.subscription,
              },
              "[Stripe Webhook] Stripe subscription not found."
            );
            // We return a 200 here to handle multiple regions, DD will watch
            // the warnings and create an alert if this log appears in all regions
            return res.status(200).json({ success: true });
          }

          const isProCreditPurchaseInvoice =
            isCreditPurchaseInvoice(invoice) &&
            !isEnterpriseSubscription(stripeSubscription);

          const auth = await Authenticator.internalAdminForWorkspace(
            subscription.workspace.sId
          );

          if (isProCreditPurchaseInvoice) {
            const creditPurchaseResult = await startCreditFromProOneOffInvoice({
              auth,
              invoice,
              stripeSubscription,
            });

            if (creditPurchaseResult.isErr()) {
              logger.error(
                {
                  error: creditPurchaseResult.error,
                  invoiceId: invoice.id,
                  stripeSubscriptionId: invoice.subscription,
                },
                "[Stripe Webhook] Error processing credit purchase"
              );
            }
          } else if (!isCreditPurchaseInvoice(invoice)) {
            await subscription.update({ paymentFailingSince: null });
          }
          break;
        }
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
          subscription = await SubscriptionModel.findOne({
            where: { stripeSubscriptionId: invoice.subscription },
            include: [WorkspaceModel],
          });
          if (!subscription) {
            logger.warn(
              {
                event,
                stripeSubscriptionId: invoice.subscription,
              },
              "[Stripe Webhook] Subscription not found."
            );
            // We return a 200 here to handle multiple regions, DD will watch
            // the warnings and create an alert if this log appears in all regions
            return res.status(200).json({ success: true });
          }

          // If the invoice is for a credit purchase, we don't mark the
          // subscription as payment failing.
          if (isCreditPurchaseInvoice(invoice)) {
            return res.status(200).json({ success: true });
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

          // Handle Pro credit purchase invoice failures
          stripeSubscription = await getStripeSubscription(
            invoice.subscription
          );

          if (!stripeSubscription) {
            logger.warn(
              {
                event,
                stripeSubscriptionId: invoice.subscription,
              },
              "[Stripe Webhook] Stripe Subscription not found."
            );
          }
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
          const { members } = await getMembers(auth, {
            roles: ["admin"],
            activeOnly: true,
          });
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

          if (stripeSubscription) {
            const isProCreditPurchaseInvoice =
              isCreditPurchaseInvoice(invoice) &&
              !isEnterpriseSubscription(stripeSubscription);

            if (isProCreditPurchaseInvoice) {
              const result = await voidFailedProCreditPurchaseInvoice({
                auth,
                invoice,
              });
              if (result.isErr()) {
                // For eng-oncall
                // This case is supposed to be extremely rare, as there are not a lot of things that can fail
                // during an invoice void, you will need to inspect the invoice directly in stripe to see what
                // happened, and invoice it by hand, with the added metadata put in `voidFailedProCreditPurchase`
                // contact Stripe owners in case of doubt
                logger.error(
                  {
                    error: result.error,
                    panic: true,
                    stripeError: true,
                    invoiceId: invoice.id,
                  },
                  "[Stripe Webhook] Error handling failed credit purchase"
                );
              } else if (result.value.voided) {
                logger.warn(
                  { invoiceId: invoice.id },
                  "[Stripe Webhook] Voided Pro credit purchase invoice after 3 failures"
                );
                return res.status(200).json({ success: true });
              }
            }
          }

          break;
        case "charge.dispute.created": {
          const dispute = event.data.object as Stripe.Dispute;
          const charge = isString(dispute.charge)
            ? await stripe.charges.retrieve(dispute.charge)
            : dispute.charge;

          if (!charge.invoice) {
            logger.warn(
              { disputeId: dispute.id, chargeId: charge.id, stripeError: true },
              "[Stripe Webhook] Dispute charge has no associated invoice."
            );
            break;
          }

          const disputeInvoice = isString(charge.invoice)
            ? await stripe.invoices.retrieve(charge.invoice)
            : charge.invoice;

          if (!isCreditPurchaseInvoice(disputeInvoice)) {
            logger.warn(
              { dispute, stripeError: true },
              "[Stripe Webhook] Received charge.dispute.created event. Please make sure the subscription is now marked as 'ended' in our database and canceled on Stripe."
            );
            break;
          }

          if (!isString(disputeInvoice.subscription)) {
            logger.error(
              {
                disputeId: dispute.id,
                invoiceId: disputeInvoice.id,
                stripeError: true,
              },
              "[Stripe Webhook] Credit purchase invoice has no subscription."
            );
            break;
          }

          const disputeSubscription = await SubscriptionModel.findOne({
            where: { stripeSubscriptionId: disputeInvoice.subscription },
            include: [WorkspaceModel],
          });

          if (!disputeSubscription) {
            logger.warn(
              {
                disputeId: dispute.id,
                invoiceId: disputeInvoice.id,
                stripeSubscriptionId: disputeInvoice.subscription,
              },
              "[Stripe Webhook] Subscription not found for disputed credit purchase."
            );
            break;
          }

          const disputeAuth = await Authenticator.internalAdminForWorkspace(
            disputeSubscription.workspace.sId
          );

          const credit = await CreditResource.fetchByInvoiceOrLineItemId(
            disputeAuth,
            disputeInvoice.id
          );

          if (!credit) {
            logger.error(
              {
                disputeId: dispute.id,
                invoiceId: disputeInvoice.id,
                workspaceId: disputeSubscription.workspace.sId,
                stripeError: true,
              },
              "[Stripe Webhook] Credit not found for disputed credit purchase invoice."
            );
            break;
          }

          const freezeResult = await credit.freeze(disputeAuth);
          if (freezeResult.isErr()) {
            logger.error(
              {
                disputeId: dispute.id,
                invoiceId: disputeInvoice.id,
                creditId: credit.id,
                workspaceId: disputeSubscription.workspace.sId,
                error: freezeResult.error,
                stripeError: true,
              },
              "[Stripe Webhook] Failed to freeze credit for disputed payment."
            );
          } else {
            logger.info(
              {
                disputeId: dispute.id,
                invoiceId: disputeInvoice.id,
                creditId: credit.id,
                workspaceId: disputeSubscription.workspace.sId,
              },
              "[Stripe Webhook] Successfully froze credit due to payment dispute."
            );
          }

          break;
        }

        case "customer.subscription.created": {
          const stripeSubscription = event.data.object as Stripe.Subscription;
          const priceId =
            stripeSubscription.items.data.length > 0
              ? stripeSubscription.items.data[0].price?.id
              : null;
          // on the odd chance the change is not compatible with our logic, we panic
          const validStatus =
            assertStripeSubscriptionIsValid(stripeSubscription);

          if (validStatus.isErr()) {
            statsDClient.increment("stripe.subscription.invalid", 1, [
              "event_type:customer.subscription.created",
            ]);

            logger.error(
              {
                invalidStripeSubscriptionError: true,
                workspaceId: event.data.object.metadata?.workspaceId,
                stripeSubscriptionId: stripeSubscription.id,
                priceId,
                invalidity_message: validStatus.error.invalidity_message,
                event,
              },
              "[Stripe Webhook] Received customer.subscription.created event with invalid subscription."
            );
          }

          const subscription = await SubscriptionModel.findOne({
            where: { stripeSubscriptionId: stripeSubscription.id },
            include: [WorkspaceModel],
          });

          if (subscription) {
            const auth = await Authenticator.internalAdminForWorkspace(
              subscription.workspace.sId
            );

            const freeCreditsResult =
              await grantFreeCreditsFromSubscriptionStateChange({
                auth,
                stripeSubscription,
              });

            if (freeCreditsResult.isErr()) {
              logger.error(
                {
                  panic: true,
                  stripeError: true,
                  error: freeCreditsResult.error,
                  subscriptionId: stripeSubscription.id,
                  workspaceId: subscription.workspace.sId,
                },
                "[Stripe Webhook] Error granting free credits on subscription created"
              );
            }
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

          // Billing cycle changed
          if ("current_period_start" in previousAttributes) {
            const subscription = await SubscriptionModel.findOne({
              where: { stripeSubscriptionId: stripeSubscription.id },
              include: [WorkspaceModel],
            });

            if (subscription) {
              const auth = await Authenticator.internalAdminForWorkspace(
                subscription.workspace.sId
              );

              const freeCreditsResult =
                await grantFreeCreditsFromSubscriptionStateChange({
                  auth,
                  stripeSubscription,
                });

              if (freeCreditsResult.isErr()) {
                logger.error(
                  {
                    panic: true,
                    stripeError: true,
                    error: freeCreditsResult.error,
                    subscriptionId: stripeSubscription.id,
                    workspaceId: subscription.workspace.sId,
                  },
                  "[Stripe Webhook] Error granting free credits on renewal"
                );
              }

              // TODO(PPUL): should we enforce that enterprise always has PAYG enabled?
              const paygEnabled = await isPAYGEnabled(auth);

              if (isEnterpriseSubscription(stripeSubscription) && paygEnabled) {
                // Allocate PAYG credits for the new billing cycle
                const currentPeriod = StripeBillingPeriodSchema.safeParse({
                  current_period_start: stripeSubscription.current_period_start,
                  current_period_end: stripeSubscription.current_period_end,
                });

                assert(
                  currentPeriod.success,
                  "Unexpected current period missing or malformed"
                );
                await allocatePAYGCreditsOnCycleRenewal({
                  auth,
                  nextPeriodStartSeconds:
                    currentPeriod.data.current_period_start,
                  nextPeriodEndSeconds: currentPeriod.data.current_period_end,
                });

                const previousPeriod =
                  StripeBillingPeriodSchema.safeParse(previousAttributes);
                assert(
                  previousPeriod.success,
                  "Unexpected previous period missing or malformed"
                );
                const previousPeriodStartSeconds =
                  previousPeriod.data.current_period_start;
                const previousPeriodEndSeconds =
                  previousPeriod.data.current_period_end;
                const paygResult = await invoiceEnterprisePAYGCredits({
                  auth,
                  stripeSubscription,
                  previousPeriodStartSeconds,
                  previousPeriodEndSeconds,
                });

                if (paygResult.isErr()) {
                  logger.error(
                    {
                      panic: true,
                      stripeError: true,
                      error: paygResult.error,
                      subscriptionId: stripeSubscription.id,
                      workspaceId: subscription.workspace.sId,
                    },
                    "[Stripe Webhook] Error invoicing PAYG credits"
                  );
                }
              }
            } else {
              logger.warn(
                {
                  stripeEventId: event.id,
                  stripeEventType: event.type,
                  stripeSubscriptionId: stripeSubscription.id,
                },
                "[Stripe Webhook] Subscription not found for billing cycle change."
              );
            }
          }

          if (stripeSubscription.status === "trialing") {
            // We check if the trialing subscription is being canceled.
            if (
              stripeSubscription.cancel_at_period_end &&
              stripeSubscription.cancel_at
            ) {
              const endDate = new Date(stripeSubscription.cancel_at * 1000);
              const subscription = await SubscriptionModel.findOne({
                where: { stripeSubscriptionId: stripeSubscription.id },
                include: [WorkspaceModel],
              });
              if (!subscription) {
                logger.warn(
                  {
                    event,
                    stripeSubscriptionId: stripeSubscription.id,
                  },
                  "[Stripe Webhook] Subscription not found."
                );
                // We return a 200 here to handle multiple regions, DD will watch
                // the warnings and create an alert if this log appears in all regions.
                return res.status(200).json({ success: true });
              }
              await subscription.update({
                endDate,
                // If the subscription is canceled, we set the requestCancelAt date to now.
                // If the subscription is reactivated, we unset the requestCancelAt date.
                requestCancelAt: endDate ? now : null,
              });
            }
          }

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
            const subscription = await SubscriptionModel.findOne({
              where: { stripeSubscriptionId: stripeSubscription.id },
              include: [WorkspaceModel],
            });
            if (!subscription) {
              logger.warn(
                {
                  event,
                  stripeSubscriptionId: stripeSubscription.id,
                },
                "[Stripe Webhook] Subscription not found."
              );
              // We return a 200 here to handle multiple regions, DD will watch
              // the warnings and create an alert if this log appears in all regions
              return res.status(200).json({ success: true });
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
              // Subscription is re-activated, so we need to unpause the connectors and re-enable triggers.
              await restoreWorkspaceAfterSubscription(auth);

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
            const { members } = await getMembers(auth, {
              roles: ["admin"],
              activeOnly: true,
            });
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
            const subscription = await SubscriptionModel.findOne({
              where: { stripeSubscriptionId: stripeSubscription.id },
            });
            if (!subscription) {
              logger.warn(
                {
                  event,
                  stripeSubscriptionId: stripeSubscription.id,
                },
                "[Stripe Webhook] Subscription not found."
              );
              // We return a 200 here to handle multiple regions, DD will watch
              // the warnings and create an alert if this log appears in all regions
              return res.status(200).json({ success: true });
            }
            if (subscription.trialing) {
              await subscription.update({ status: "active", trialing: false });
            }
          }

          // on the odd chance the change is not compatible with our logic, we panic
          const validStatus =
            assertStripeSubscriptionIsValid(stripeSubscription);
          if (validStatus.isErr()) {
            statsDClient.increment("stripe.subscription.invalid", 1, [
              "event_type:customer.subscription.updated",
            ]);

            const priceId =
              stripeSubscription.items.data.length > 0
                ? stripeSubscription.items.data[0].price?.id
                : null;
            logger.error(
              {
                invalidStripeSubscriptionError: true,
                workspaceId: event.data.object.metadata?.workspaceId,
                stripeSubscriptionId: stripeSubscription.id,
                priceId,
                invalidity_message: validStatus.error.invalidity_message,
                event,
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

          const matchingSubscription = await SubscriptionModel.findOne({
            where: { stripeSubscriptionId: stripeSubscription.id },
            include: [WorkspaceModel],
          });

          if (!matchingSubscription) {
            logger.warn(
              {
                event,
                stripeSubscriptionId: stripeSubscription.id,
              },
              "Stripe Webhook: Error handling customer.subscription.deleted. Matching subscription not found on db."
            );
            // We return a 200 here to handle multiple regions, DD will watch
            // the warnings and create an alert if this log appears in all regions
            return res.status(200).json({ success: true });
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
                  {
                    stripeError: true,
                    workspaceId: matchingSubscription.workspace.sId,
                    stripeSubscriptionId: stripeSubscription.id,
                    error: scheduleScrubRes.error,
                  },
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

          const trialingSubscription = await SubscriptionModel.findOne({
            where: { stripeSubscriptionId: stripeSubscription.id },
            include: [WorkspaceModel],
          });

          if (!trialingSubscription) {
            logger.warn(
              {
                event,
                stripeSubscriptionId: stripeSubscription.id,
              },
              "[Stripe Webhook] Subscription not found."
            );
            // We return a 200 here to handle multiple regions, DD will watch
            // the warnings and create an alert if this log appears in all regions
            return res.status(200).json({ success: true });
          }

          await SubscriptionResource.maybeCancelInactiveTrials(
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

export default withLogging(handler);
