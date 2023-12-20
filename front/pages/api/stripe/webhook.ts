import {
  CoreAPI,
  isRetrievalConfiguration,
  ReturnedAPIErrorType,
} from "@dust-tt/types";
import { NextApiRequest, NextApiResponse } from "next";
import { pipeline, Writable } from "stream";
import Stripe from "stripe";
import { promisify } from "util";

import {
  archiveAgentConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration";
import { getDataSources } from "@app/lib/api/data_sources";
import { deleteDataSource } from "@app/lib/api/data_sources";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { front_sequelize } from "@app/lib/databases";
import {
  sendAdminDowngradeTooMuchDataEmail,
  sendCancelSubscriptionEmail,
  sendOpsDowngradeTooMuchDataEmail,
  sendReactivateSubscriptionEmail,
} from "@app/lib/email";
import {
  Membership,
  MembershipInvitation,
  Plan,
  Subscription,
  Workspace,
} from "@app/lib/models";
import { PlanInvitation } from "@app/lib/models/plan";
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
            type: "internal_server_error",
            message: "Error constructing Stripe Webhook event.",
          },
        });
      }
      let stripeSubscription;
      switch (event.type) {
        case "checkout.session.completed":
          // Payment is successful and the stripe subscription is created.
          // We can create the new subscription and end the active one if any.
          const session = event.data.object as Stripe.Checkout.Session;
          const workspaceId = session.client_reference_id;
          const stripeCustomerId = session.customer;
          const stripeSubscriptionId = session.subscription;
          const planCode = session?.metadata?.planCode || null;

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

          try {
            if (
              workspaceId === null ||
              stripeCustomerId === null ||
              planCode === null ||
              typeof stripeCustomerId !== "string" ||
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
                `Cannot subscribe to plan ${planCode}:  not found.`
              );
            }

            await front_sequelize.transaction(async (t) => {
              const now = new Date();
              const activeSubscription = await Subscription.findOne({
                where: { workspaceId: workspace.id, status: "active" },
                transaction: t,
              });

              if (
                activeSubscription &&
                activeSubscription.stripeSubscriptionId === stripeSubscriptionId
              ) {
                // We already have a subscription for this workspace and this stripe subscription.
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

              // mark existing plan invite as consumed
              const planInvitations = await PlanInvitation.findAll({
                where: {
                  workspaceId: workspace.id,
                  consumedAt: null,
                },
                transaction: t,
              });

              if (planInvitations.length > 1) {
                logger.error(
                  {
                    workspaceId,
                    stripeCustomerId,
                    stripeSubscriptionId,
                    planCode,
                  },
                  `[Stripe Webhook] Received checkout.session.completed when we have more than one plan invitation for this workspace.`
                );
              }

              if (
                planInvitations.length === 1 &&
                planInvitations[0].planId !== plan.id
              ) {
                logger.error(
                  {
                    workspaceId,
                    stripeCustomerId,
                    stripeSubscriptionId,
                    planCode,
                  },
                  `[Stripe Webhook] Received checkout.session.completed when we have a plan invitation for this workspace but not for this plan.`
                );
              }

              await PlanInvitation.update(
                {
                  consumedAt: now,
                },
                {
                  where: {
                    workspaceId: workspace.id,
                    consumedAt: null,
                  },
                  transaction: t,
                }
              );

              if (activeSubscription) {
                await activeSubscription.update(
                  {
                    status: "ended",
                    endDate: now,
                  },
                  { transaction: t }
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
                type: "internal_server_error",
                message:
                  "Stripe Webhook: error handling checkout.session.completed.",
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
          stripeSubscription = event.data.object as Stripe.Subscription;
          const previousAttributes = event.data.previous_attributes;
          if (!previousAttributes) break; // should not happen by definition of the subscription.updated event

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
            await subscription.update({ endDate });
            const auth = await Authenticator.internalBuilderForWorkspace(
              subscription.workspace.sId
            );

            // then email admins
            const adminEmails = (await getMembers(auth, "admin")).map(
              (u) => u.email
            );
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
              if (endDate)
                await sendCancelSubscriptionEmail(
                  adminEmail,
                  subscription.workspace.sId,
                  endDate
                );
              else await sendReactivateSubscriptionEmail(adminEmail);
            }
          }
          break;
        case "customer.subscription.deleted":
          stripeSubscription = event.data.object as Stripe.Subscription;
          // Occurs when the subscription is canceled by the user or by us.
          if (stripeSubscription.status === "canceled") {
            // We can end the subscription in our database.
            const activeSubscription = await Subscription.findOne({
              where: { stripeSubscriptionId: stripeSubscription.id },
              include: [Workspace],
            });
            if (!activeSubscription) {
              return apiError(req, res, {
                status_code: 500,
                api_error: {
                  type: "internal_server_error",
                  message:
                    "Stripe Webhook: Error handling customer.subscription.deleted. Subscription not found.",
                },
              });
            }
            await activeSubscription.update({
              status: "ended",
              endDate: new Date(),
            });
            const workspaceId = activeSubscription.workspace.sId;
            const auth = await Authenticator.internalAdminForWorkspace(
              workspaceId
            );
            await revokeUsersForDowngrade(auth);
            await archiveConnectedAgents(auth);
            await deleteConnectedDatasources(auth);
            await checkStaticDatasourcesSize(auth);
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

/**
 * Remove everybody except the most tenured admin
 * @param workspaceId
 */
async function revokeUsersForDowngrade(auth: Authenticator) {
  const memberships = await Membership.findAll({
    where: { workspaceId: auth.workspace()?.id },
    order: [["createdAt", "ASC"]],
  });
  const adminMemberships = memberships.filter((m) => m.role === "admin");
  // the first membership with role admin will not be revoked
  adminMemberships.shift();
  const nonAdminMemberships = memberships.filter((m) => m.role !== "admin");
  for (const membership of [...adminMemberships, ...nonAdminMemberships]) {
    await membership.update({ role: "revoked" });
  }

  // revoke invitations
  const workspaceId = auth.workspace()?.id;
  if (!workspaceId) {
    throw new Error("Cannot get workspace.");
  }
  await MembershipInvitation.update(
    { status: "revoked" },
    { where: { workspaceId } }
  );
}

async function archiveConnectedAgents(auth: Authenticator) {
  const agentConfigurations = await getAgentConfigurations(
    auth,
    "admin_internal"
  );
  // agentconfigurations with a retrieval action with at least a managed
  // data source
  const agentConfigurationsToArchive = agentConfigurations.filter(
    (ac) =>
      ac.action &&
      isRetrievalConfiguration(ac.action) &&
      ac.action.dataSources.length > 0 &&
      ac.action.dataSources.some((ds) => ds.dataSourceId.startsWith("managed-"))
  );
  for (const agentConfiguration of agentConfigurationsToArchive) {
    await archiveAgentConfiguration(auth, agentConfiguration.sId);
  }
}

async function deleteConnectedDatasources(auth: Authenticator) {
  const dataSources = await getDataSources(auth);
  const managedDataSources = dataSources.filter((ds) => !!ds.connectorProvider);
  for (const dataSource of managedDataSources) {
    // call the poke delete datasource endpoint
    const r = await deleteDataSource(auth, dataSource.name);
    if (r.isErr()) {
      throw new Error(`Failed to delete data source: ${r.error.message}`);
    }
  }
}

/**
 * Check the size of the static datasources and send an email to the user and us if it is too big.
 */
async function checkStaticDatasourcesSize(auth: Authenticator) {
  const dataSources = await getDataSources(auth);
  const staticDataSources = dataSources.filter((ds) => !ds.connectorProvider);
  const coreAPI = new CoreAPI(logger);
  const datasourcesTooBig = [];
  logger.info(
    `Checking static datasources sizes for downgrade of ${
      auth.workspace()?.sId
    }`
  );
  for (const ds of staticDataSources) {
    // count total size of all documents of the datasource
    let totalSize = 0;
    for (let i = 0; ; i++) {
      const res = await coreAPI.getDataSourceDocuments({
        projectId: ds.dustAPIProjectId,
        dataSourceName: ds.name,
        limit: 1000,
        offset: 1000 * i,
      });
      if (res.isErr()) {
        throw new Error("Error getting data source documents.");
      }
      totalSize += res.value.documents.reduce(
        (acc, doc) => acc + doc.text_size,
        0
      );
      if (res.value.documents.length < 1000) {
        break;
      }
      i++;
    }

    if (totalSize > 50 * 1024 * 1024) {
      datasourcesTooBig.push(ds.name);
    }
  }

  // send email
  if (datasourcesTooBig.length > 0) {
    logger.info(
      `Downgrade of ${
        auth.workspace()?.sId
      }: datasources too big: ${datasourcesTooBig.join(", ")}.`
    );
    const workspace = auth.workspace();
    if (!workspace) {
      throw new Error("Cannot get workspace.");
    }
    await sendOpsDowngradeTooMuchDataEmail(workspace.sId, datasourcesTooBig);
    // for all admins
    const adminEmails = (await getMembers(auth, "admin")).map((u) => u.email);
    for (const adminEmail of adminEmails)
      await sendAdminDowngradeTooMuchDataEmail(adminEmail, datasourcesTooBig);
  }
}

export default withLogging(handler);
