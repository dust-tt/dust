import apiConfig from "@app/lib/api/config";
import {
  sendAdminSubscriptionPaymentFailedEmail,
  sendCancelSubscriptionEmail,
  sendReactivateSubscriptionEmail,
} from "@app/lib/api/email";
import { storeStripeCheckoutSessionStatus } from "@app/lib/api/stripe/checkout_status";
import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import {
  deleteCreditFromVoidedInvoice,
  startCreditFromEnterpriseOneOffInvoice,
  startCreditFromProOneOffInvoice,
  voidFailedProCreditPurchaseInvoice,
} from "@app/lib/credits/committed";
import {
  allocatePAYGCreditsOnCycleRenewal,
  invoiceEnterprisePAYGCredits,
  isPAYGEnabled,
} from "@app/lib/credits/payg";
import {
  floorToHourISO,
  reactivateMetronomeContract,
  scheduleMetronomeContractEnd,
} from "@app/lib/metronome/client";
import {
  ensureMetronomeCustomerForWorkspace,
  provisionMetronomeContract,
} from "@app/lib/metronome/contracts";
import { PlanModel } from "@app/lib/models/plan";
import {
  resolveCurrencyFromStripe,
  resolvePackageAliasForCurrency,
} from "@app/lib/plans/billing_currency";
import { isEntreprisePlanPrefix } from "@app/lib/plans/plan_codes";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import {
  assertStripeSubscriptionIsValid,
  createCustomerPortalSession,
  getStripeClient,
  getStripeSubscription,
  isAwuPurchaseInvoice,
  isCreditPurchaseInvoice,
  isEnterpriseSubscription,
  isFirstPeriodInvoice,
} from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { getStatsDClient } from "@app/lib/utils/statsd";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { launchScheduleWorkspaceScrubWorkflow } from "@app/temporal/scrub_workspace/client";
import { launchWorkOSWorkspaceSubscriptionCreatedWorkflow } from "@app/temporal/workos_events_queue/client";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import { apiError } from "@front-api/middleware/utils";
import assert from "assert";
import { Hono } from "hono";
import type Stripe from "stripe";
import { z } from "zod";

const StripeBillingPeriodSchema = z.object({
  current_period_start: z.number(),
  current_period_end: z.number(),
});

/**
 * Shadow-provision Metronome customer + contract for a workspace.
 * Uses shadow packages (no billing provider) so Metronome generates invoices
 * but does NOT deliver them to Stripe. Fire-and-forget: logs errors but does not throw.
 */
async function provisionShadowMetronome({
  workspace,
  stripeCustomerId,
  metronomePackageAlias,
  sessionId,
  subscriptionModelId,
  periodStart,
  planCode,
}: {
  workspace: WorkspaceResource;
  stripeCustomerId: string;
  metronomePackageAlias: string;
  sessionId: string;
  subscriptionModelId: ModelId;
  periodStart: Date;
  planCode: string;
}): Promise<void> {
  try {
    const lightWorkspace = renderLightWorkspaceType({ workspace });

    const customerResult = await ensureMetronomeCustomerForWorkspace({
      workspace: lightWorkspace,
      stripeCustomerId,
    });
    if (customerResult.isErr()) {
      logger.error(
        { workspaceId: workspace.sId, error: customerResult.error.message },
        "[Stripe Webhook] Failed to ensure Metronome customer for shadow provisioning"
      );
      return;
    }
    const { metronomeCustomerId } = customerResult.value;

    const contractResult = await provisionMetronomeContract({
      metronomeCustomerId,
      workspace: lightWorkspace,
      packageAlias: metronomePackageAlias,
      uniquenessKey: sessionId,
      startingAt: periodStart,
      enableStripeBilling: false,
      planCode,
    });
    if (contractResult.isErr()) {
      logger.error(
        { workspaceId: workspace.sId, error: contractResult.error.message },
        "[Stripe Webhook] Failed to shadow-provision Metronome contract"
      );
      return;
    }
    const { metronomeContractId } = contractResult.value;

    await SubscriptionResource.updateMetronomeContractId(
      subscriptionModelId,
      metronomeContractId
    );

    logger.info(
      {
        workspaceId: workspace.sId,
        metronomeCustomerId,
        metronomeContractId,
      },
      "[Stripe Webhook] Metronome shadow provisioned"
    );
  } catch (err) {
    logger.error(
      { workspaceId: workspace.sId, error: normalizeError(err) },
      "[Stripe Webhook] Failed to shadow-provision Metronome"
    );
  }
}

interface SubscriptionInvoiceCtx {
  workspace: WorkspaceResource;
  subscription: SubscriptionResource;
  auth: Authenticator;
  isEnterprise: boolean;
}

function isAuthOnEnterprisePlan(auth: Authenticator): boolean {
  const subscription = auth.subscription();
  return (
    subscription !== null && isEntreprisePlanPrefix(subscription.plan.code)
  );
}

async function resolveStripeSubscriptionInvoiceCtx(
  invoice: Stripe.Invoice
): Promise<SubscriptionInvoiceCtx | null> {
  if (typeof invoice.subscription !== "string") {
    return null;
  }
  const subscription = await SubscriptionResource.fetchByStripeId(
    invoice.subscription
  );
  if (!subscription || !subscription.stripeSubscriptionId) {
    logger.warn(
      { invoiceId: invoice.id, stripeSubscriptionId: invoice.subscription },
      "[Stripe Webhook] Subscription not found."
    );
    return null;
  }
  const stripeSubscription = await getStripeSubscription(
    subscription.stripeSubscriptionId
  );
  if (!stripeSubscription) {
    logger.error(
      {
        invoiceId: invoice.id,
        stripeSubscriptionId: invoice.subscription,
        stripeError: true,
      },
      "[Stripe Webhook] Stripe subscription not found."
    );
  }
  const workspace = await WorkspaceResource.fetchByModelId(
    subscription.workspaceId
  );
  assert(workspace !== null, "Workspace not found for subscription.");
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const isEnterprise = stripeSubscription
    ? isEnterpriseSubscription(stripeSubscription)
    : isAuthOnEnterprisePlan(auth);
  return { workspace, subscription, auth, isEnterprise };
}

async function resolveMetronomeSubscriptionInvoiceCtx(
  invoice: Stripe.Invoice
): Promise<SubscriptionInvoiceCtx | null> {
  const metronomeCustomerId = invoice.metadata?.metronome_customer_id;
  if (!metronomeCustomerId) {
    logger.error(
      {
        invoiceId: invoice.id,
        customer: invoice.customer,
        stripeError: true,
      },
      "[Stripe Webhook] Metronome subscription invoice missing metronome_customer_id metadata"
    );
    return null;
  }
  const workspace =
    await WorkspaceResource.fetchByMetronomeCustomerId(metronomeCustomerId);
  if (!workspace) {
    logger.warn(
      { invoiceId: invoice.id, metronomeCustomerId },
      "[Stripe Webhook] Metronome subscription invoice: workspace not found"
    );
    return null;
  }
  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );
  if (!subscription) {
    return null;
  }
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  return {
    workspace,
    subscription,
    auth,
    isEnterprise: isAuthOnEnterprisePlan(auth),
  };
}

async function resolveCreditPurchaseInvoiceCtx(
  invoice: Stripe.Invoice
): Promise<SubscriptionInvoiceCtx | null> {
  const workspaceId = invoice.metadata?.workspace_id;
  if (!workspaceId) {
    logger.error(
      { invoiceId: invoice.id, customer: invoice.customer },
      "[Stripe Webhook] Credit purchase invoice missing workspace_id metadata"
    );
    return null;
  }
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    return null;
  }
  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );
  if (!subscription) {
    return null;
  }
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  return {
    workspace,
    subscription,
    auth,
    isEnterprise: isAuthOnEnterprisePlan(auth),
  };
}

async function resolveInvoiceCtx(
  invoice: Stripe.Invoice
): Promise<SubscriptionInvoiceCtx | null> {
  if (typeof invoice.subscription === "string") {
    return resolveStripeSubscriptionInvoiceCtx(invoice);
  }
  if (invoice.metadata?.workspace_id) {
    return resolveCreditPurchaseInvoiceCtx(invoice);
  }
  if (invoice.metadata?.metronome_customer_id) {
    return resolveMetronomeSubscriptionInvoiceCtx(invoice);
  }
  return null;
}

async function startCreditFromPaidInvoice({
  invoice,
  auth,
  isEnterprise,
}: {
  invoice: Stripe.Invoice;
  auth: Authenticator;
  isEnterprise: boolean;
}): Promise<void> {
  const result = isEnterprise
    ? await startCreditFromEnterpriseOneOffInvoice({ auth, invoice })
    : await startCreditFromProOneOffInvoice({ auth, invoice });

  if (result.isErr()) {
    logger.error(
      { error: result.error, invoiceId: invoice.id, isEnterprise },
      "[Stripe Webhook] Error processing credit purchase"
    );
  }
}

async function voidProCreditPurchaseInvoiceOnFailure({
  auth,
  invoice,
  workspaceId,
}: {
  auth: Authenticator;
  invoice: Stripe.Invoice;
  workspaceId: string;
}): Promise<void> {
  const result = await voidFailedProCreditPurchaseInvoice({ auth, invoice });
  if (result.isErr()) {
    logger.error(
      {
        error: result.error,
        panic: true,
        stripeError: true,
        invoiceId: invoice.id,
        workspaceId,
      },
      "[Stripe Webhook] Error handling failed credit purchase"
    );
    return;
  }
  if (result.value.voided) {
    logger.warn(
      { invoiceId: invoice.id, workspaceId },
      "[Stripe Webhook] Voided Pro credit purchase invoice after 3 failures"
    );
  }
}

async function forceChargeMetronomeFinalizedInvoice(
  invoice: Stripe.Invoice
): Promise<void> {
  if (
    invoice.status !== "open" ||
    invoice.amount_due <= 0 ||
    invoice.collection_method !== "charge_automatically" ||
    !invoice.id
  ) {
    return;
  }
  try {
    await getStripeClient().invoices.pay(invoice.id);
    logger.info(
      { invoiceId: invoice.id, customer: invoice.customer },
      "[Stripe Webhook] Charged Metronome subscription invoice on finalize"
    );
  } catch (err) {
    logger.warn(
      {
        error: normalizeError(err),
        invoiceId: invoice.id,
        customer: invoice.customer,
      },
      "[Stripe Webhook] Failed to charge Metronome subscription invoice on finalize; Stripe dunning will retry"
    );
  }
}

async function notifyAdminsOfPaymentFailure({
  auth,
  subscription,
  invoice,
  now,
}: {
  auth: Authenticator;
  subscription: SubscriptionResource;
  invoice: Stripe.Invoice;
  now: Date;
}): Promise<void> {
  const owner = auth.workspace();
  const subscriptionType = auth.subscription();
  if (!owner || !subscriptionType) {
    throw new Error(
      "notifyAdminsOfPaymentFailure: missing owner or subscription on auth"
    );
  }
  if (isEntreprisePlanPrefix(subscriptionType.plan.code)) {
    logger.info(
      {
        workspaceId: owner.sId,
        invoiceId: invoice.id,
        planCode: subscriptionType.plan.code,
      },
      "[Stripe Webhook] Skipping payment_failed handling for enterprise workspace."
    );
    return;
  }
  if (subscription.paymentFailingSince === null) {
    await subscription.setPaymentFailingStatus({
      paymentFailingSince: now,
    });
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
    await sendAdminSubscriptionPaymentFailedEmail(adminEmail, portalUrl);
  }
}

/**
 * Handles a completed Stripe Checkout session in `subscription` mode (the
 * legacy Stripe-billed path). Creates the local Subscription row, ends any
 * prior active subscription, restores the workspace, and shadow-provisions a
 * Metronome contract when the session carries a `metronomePackageAlias`.
 */
async function handleStripeCheckoutCompleted({
  session,
  workspaceId,
  planCode,
  stripeSubscriptionId,
  metronomePackageAlias,
  stripe,
  now,
}: {
  session: Stripe.Checkout.Session;
  workspaceId: string | null;
  planCode: string | null;
  stripeSubscriptionId: string | Stripe.Subscription | null;
  metronomePackageAlias: string | null;
  stripe: Stripe;
  now: Date;
}): Promise<void> {
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
        { workspaceId, subscriptionId: stripeSubscriptionId },
        "[Stripe Webhook] Cannot find workspace."
      );
      return;
    }
    const plan = await PlanModel.findOne({ where: { code: planCode } });
    if (!plan) {
      throw new Error(`Cannot subscribe to plan ${planCode}: not found.`);
    }
    const checkoutStripeSubscription =
      await stripe.subscriptions.retrieve(stripeSubscriptionId);

    const newSubscription = await withTransaction(async (t) => {
      const activeSubscription =
        await SubscriptionResource.fetchActiveByWorkspaceModelId(
          workspace.id,
          t
        );

      if (activeSubscription && activeSubscription.planId === plan.id) {
        logger.error(
          {
            workspaceId: workspace.sId,
            stripeSubscriptionId,
            planCode,
            stripeError: true,
          },
          "[Stripe Webhook] Received checkout.session.completed when we already have a subscription for this plan on the workspace. Check on Stripe dashboard."
        );
        return null;
      }

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
        return null;
      }

      if (activeSubscription) {
        await activeSubscription.markAsEnded("ended", t);
      }

      return SubscriptionResource.makeNew(
        {
          sId: generateRandomModelSId(),
          workspaceId: workspace.id,
          planId: plan.id,
          status: "active",
          trialing: checkoutStripeSubscription.status === "trialing",
          startDate: now,
          stripeSubscriptionId,
        },
        renderPlanFromModel({ plan }),
        t
      );
    });

    if (!newSubscription) {
      return;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const workspaceSeats = await MembershipResource.countActiveSeatsInWorkspace(
      workspace.sId
    );
    await ServerSideTracking.trackSubscriptionCreated({
      workspace: renderLightWorkspaceType({ workspace }),
      planCode,
      workspaceSeats,
      subscriptionStartAt: now,
    });
    await restoreWorkspaceAfterSubscription(auth);

    if (
      metronomePackageAlias &&
      isString(checkoutStripeSubscription.customer)
    ) {
      const currentPeriodStart = new Date(
        checkoutStripeSubscription.current_period_start * 1000
      );

      const billingCurrency = resolveCurrencyFromStripe({
        stripeSubscription: checkoutStripeSubscription,
      });
      const resolvedAlias = resolvePackageAliasForCurrency(
        metronomePackageAlias,
        billingCurrency
      );
      void provisionShadowMetronome({
        workspace,
        stripeCustomerId: checkoutStripeSubscription.customer,
        metronomePackageAlias: resolvedAlias,
        sessionId: session.id,
        subscriptionModelId: newSubscription.id,
        periodStart: new Date(floorToHourISO(currentPeriodStart)),
        planCode,
      });
    }

    await launchWorkOSWorkspaceSubscriptionCreatedWorkflow({ workspaceId });
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
  }
}

// Mounted at /api/stripe/webhook.
const app = new Hono();

app.get("/", (ctx) => ctx.json({ success: true }));

app.post("/", async (ctx) => {
  const stripe = getStripeClient();
  const sig = ctx.req.header("stripe-signature") ?? "";
  let event: Stripe.Event | null = null;

  // Read raw body bytes for Stripe signature verification.
  const rawBody = Buffer.from(await ctx.req.arrayBuffer());

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
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "internal_server_error",
        message:
          "Invalid Stripe Webhook event, the signature may not be valid.",
      },
    });
  }

  logger.info({ sig, stripeError: false, event }, "Processing Stripe event.");

  let stripeSubscription;
  const now = new Date();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.client_reference_id;
      const stripeSubscriptionId = session.subscription;
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const planCode = session?.metadata?.planCode || null;
      const metronomePackageAlias =
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        session?.metadata?.metronomePackageAlias || null;

      if (session.status === "open" || session.status === "expired") {
        logger.info(
          { workspaceId, stripeSubscriptionId, planCode },
          `[Stripe Webhook] Received checkout.session.completed with status "${session.status}". Ignoring event.`
        );
        break;
      }
      if (session.status !== "complete") {
        logger.error(
          {
            workspaceId,
            stripeSubscriptionId,
            planCode,
            stripeError: true,
          },
          `[Stripe Webhook] Received checkout.session.completed with unknown status "${session.status}". Ignoring event.`
        );
        break;
      }

      if (session.mode === "setup") {
        await storeStripeCheckoutSessionStatus({
          sessionId: session.id,
          status: session.status,
        });
      } else {
        await handleStripeCheckoutCompleted({
          session,
          workspaceId,
          planCode,
          stripeSubscriptionId,
          metronomePackageAlias,
          stripe,
          now,
        });
      }
      break;
    }

    case "invoice.paid": {
      logger.info(
        { event },
        "[Stripe Webhook] Received customer.invoice.paid event."
      );
      const invoice = event.data.object as Stripe.Invoice;
      const stripeCtx = await resolveInvoiceCtx(invoice);
      if (!stripeCtx) {
        break;
      }
      if (isCreditPurchaseInvoice(invoice)) {
        await startCreditFromPaidInvoice({
          invoice,
          auth: stripeCtx.auth,
          isEnterprise: stripeCtx.isEnterprise,
        });
      } else if (isAwuPurchaseInvoice(invoice)) {
        // AWU credit purchases handled by Metronome.
      } else {
        await stripeCtx.subscription.clearPaymentFailingStatus();
      }
      break;
    }

    case "invoice.finalized": {
      logger.info(
        { event },
        "[Stripe Webhook] Received invoice.finalized event."
      );

      const invoice = event.data.object as Stripe.Invoice;
      const isMetronomeInvoice = typeof invoice.subscription !== "string";
      const isCreditPurchase = isCreditPurchaseInvoice(invoice);
      const isFirstPeriod = isFirstPeriodInvoice(invoice);
      const isAwuPurchase = isAwuPurchaseInvoice(invoice);

      if (
        isMetronomeInvoice &&
        !isCreditPurchase &&
        !isFirstPeriod &&
        !isAwuPurchase
      ) {
        await forceChargeMetronomeFinalizedInvoice(invoice);
      }
      break;
    }

    case "invoice.payment_failed": {
      logger.warn(
        { event },
        "[Stripe Webhook] Received invoice.payment_failed event."
      );
      const invoice = event.data.object as Stripe.Invoice;

      if (invoice.billing_reason === "subscription_create") {
        break;
      }

      if (isFirstPeriodInvoice(invoice)) {
        break;
      }

      const stripeCtx = await resolveInvoiceCtx(invoice);
      if (!stripeCtx) {
        break;
      }
      if (isCreditPurchaseInvoice(invoice)) {
        if (!stripeCtx.isEnterprise) {
          await voidProCreditPurchaseInvoiceOnFailure({
            auth: stripeCtx.auth,
            invoice,
            workspaceId: stripeCtx.workspace.sId,
          });
        }
      } else {
        await notifyAdminsOfPaymentFailure({
          auth: stripeCtx.auth,
          subscription: stripeCtx.subscription,
          invoice,
          now,
        });
      }
      break;
    }

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

      const stripeCtx = await resolveInvoiceCtx(disputeInvoice);
      if (!stripeCtx) {
        break;
      }
      const credit = await CreditResource.fetchByInvoiceOrLineItemId(
        stripeCtx.auth,
        disputeInvoice.id
      );
      if (!credit) {
        logger.error(
          {
            disputeId: dispute.id,
            invoiceId: disputeInvoice.id,
            workspaceId: stripeCtx.workspace.sId,
            stripeError: true,
          },
          "[Stripe Webhook] Credit not found for disputed credit purchase invoice."
        );
        break;
      }
      const freezeResult = await credit.freeze(stripeCtx.auth);
      if (freezeResult.isErr()) {
        logger.error(
          {
            disputeId: dispute.id,
            invoiceId: disputeInvoice.id,
            creditId: credit.id,
            workspaceId: stripeCtx.workspace.sId,
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
            workspaceId: stripeCtx.workspace.sId,
          },
          "[Stripe Webhook] Successfully froze credit due to payment dispute."
        );
      }
      break;
    }

    case "invoice.voided": {
      const voidedInvoice = event.data.object as Stripe.Invoice;

      if (!isCreditPurchaseInvoice(voidedInvoice)) {
        break;
      }

      const stripeCtx = await resolveInvoiceCtx(voidedInvoice);
      if (!stripeCtx) {
        break;
      }
      if (stripeCtx.isEnterprise) {
        break;
      }

      const deleteResult = await deleteCreditFromVoidedInvoice({
        auth: stripeCtx.auth,
        invoice: voidedInvoice,
      });
      if (deleteResult.isOk()) {
        logger.info(
          {
            invoiceId: voidedInvoice.id,
            workspaceId: stripeCtx.workspace.sId,
          },
          "[Stripe Webhook] Successfully deleted credit for voided credit purchase invoice."
        );
        break;
      }

      const error = deleteResult.error;
      switch (error.type) {
        case "credit_already_started": {
          const freezeResult = await error.credit.freeze(stripeCtx.auth);
          if (freezeResult.isErr()) {
            logger.warn(
              {
                invoiceId: voidedInvoice.id,
                creditId: error.credit.id,
                workspaceId: stripeCtx.workspace.sId,
                error: freezeResult.error.message,
              },
              "[Stripe Webhook] Failed to freeze started credit for voided invoice. Possible race condition."
            );
          } else {
            logger.warn(
              {
                invoiceId: voidedInvoice.id,
                creditId: error.credit.id,
                workspaceId: stripeCtx.workspace.sId,
              },
              "[Stripe Webhook] Froze started credit for voided invoice"
            );
          }
          break;
        }
        case "credit_not_found":
          logger.warn(
            {
              invoiceId: voidedInvoice.id,
              workspaceId: stripeCtx.workspace.sId,
              error: error.type,
            },
            "[Stripe Webhook] Failed to delete credit for voided invoice, credit_not_found. Possible race condition."
          );
          break;
        default:
          assertNever(error);
      }
      break;
    }

    case "customer.subscription.created": {
      const stripeSubscriptionCreated = event.data
        .object as Stripe.Subscription;
      const priceId =
        stripeSubscriptionCreated.items.data.length > 0
          ? stripeSubscriptionCreated.items.data[0].price?.id
          : null;
      const validStatus = assertStripeSubscriptionIsValid(
        stripeSubscriptionCreated
      );

      if (validStatus.isErr()) {
        getStatsDClient().increment("stripe.subscription.invalid", 1, [
          "event_type:customer.subscription.created",
        ]);

        logger.error(
          {
            invalidStripeSubscriptionError: true,
            workspaceId: event.data.object.metadata?.workspaceId,
            stripeSubscriptionId: stripeSubscriptionCreated.id,
            priceId,
            invalidity_message: validStatus.error.invalidity_message,
            event,
          },
          "[Stripe Webhook] Received customer.subscription.created event with invalid subscription."
        );
      }

      break;
    }

    case "customer.subscription.updated": {
      logger.info(
        { event },
        "[Stripe Webhook] Received customer.subscription.updated event."
      );
      stripeSubscription = event.data.object as Stripe.Subscription;
      const previousAttributes = event.data.previous_attributes;
      if (!previousAttributes) {
        break;
      }

      const subscriptionBecameActive =
        previousAttributes.status === "incomplete" &&
        stripeSubscription.status === "active";
      const subscriptionCycleChanged =
        "current_period_start" in previousAttributes;

      if (subscriptionBecameActive || subscriptionCycleChanged) {
        const subscription = await SubscriptionResource.fetchByStripeId(
          stripeSubscription.id
        );
        if (!subscription) {
          logger.warn(
            {
              stripeEventId: event.id,
              stripeEventType: event.type,
              stripeSubscriptionId: stripeSubscription.id,
            },
            "[Stripe Webhook] Subscription not found."
          );
          return ctx.json({ success: true });
        }

        const workspace = await WorkspaceResource.fetchByModelId(
          subscription.workspaceId
        );
        assert(
          workspace !== null,
          "Workspace not found for subscription in customer.subscription.updated."
        );

        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );

        if (subscriptionCycleChanged) {
          const paygEnabled = await isPAYGEnabled(auth);

          if (isEnterpriseSubscription(stripeSubscription) && paygEnabled) {
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
              nextPeriodStartSeconds: currentPeriod.data.current_period_start,
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
                  workspaceId: workspace.sId,
                },
                "[Stripe Webhook] Error invoicing PAYG credits"
              );
            }
          }
        }
      }

      if (stripeSubscription.status === "trialing") {
        if (
          stripeSubscription.cancel_at_period_end &&
          stripeSubscription.cancel_at
        ) {
          const endDate = new Date(stripeSubscription.cancel_at * 1000);
          const subscription = await SubscriptionResource.fetchByStripeId(
            stripeSubscription.id
          );
          if (!subscription) {
            logger.warn(
              {
                event,
                stripeSubscriptionId: stripeSubscription.id,
              },
              "[Stripe Webhook] Subscription not found."
            );
            return ctx.json({ success: true });
          }
          await subscription.markAsCanceled({ endDate });

          if (subscription.metronomeContractId) {
            const trialingWorkspace = await WorkspaceResource.fetchByModelId(
              subscription.workspaceId
            );
            if (trialingWorkspace?.metronomeCustomerId) {
              void scheduleMetronomeContractEnd({
                metronomeCustomerId: trialingWorkspace.metronomeCustomerId,
                contractId: subscription.metronomeContractId,
                endingBefore: endDate,
              });
            }
          }
        }
      }

      if (
        stripeSubscription.status === "active" &&
        "cancel_at_period_end" in previousAttributes
      ) {
        const endDate = stripeSubscription.cancel_at
          ? new Date(stripeSubscription.cancel_at * 1000)
          : null;

        const subscription = await SubscriptionResource.fetchByStripeId(
          stripeSubscription.id
        );
        if (!subscription) {
          logger.warn(
            {
              event,
              stripeSubscriptionId: stripeSubscription.id,
            },
            "[Stripe Webhook] Subscription not found."
          );
          return ctx.json({ success: true });
        }
        await subscription.markAsCanceled({ endDate });
        const workspace = await WorkspaceResource.fetchByModelId(
          subscription.workspaceId
        );
        assert(
          workspace !== null,
          "Workspace not found for subscription in customer.subscription.updated."
        );

        if (
          endDate &&
          subscription.metronomeContractId &&
          workspace.metronomeCustomerId &&
          subscription.status !== "ended_backend_only"
        ) {
          void scheduleMetronomeContractEnd({
            metronomeCustomerId: workspace.metronomeCustomerId,
            contractId: subscription.metronomeContractId,
            endingBefore: endDate,
          });
        }

        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );
        if (!endDate) {
          if (
            subscription.metronomeContractId &&
            workspace.metronomeCustomerId
          ) {
            void reactivateMetronomeContract({
              metronomeCustomerId: workspace.metronomeCustomerId,
              contractId: subscription.metronomeContractId,
            });
          }

          await restoreWorkspaceAfterSubscription(auth);

          ServerSideTracking.trackSubscriptionReactivated({
            workspace: renderLightWorkspaceType({ workspace }),
          }).catch((e) => {
            logger.error(
              {
                error: e,
                workspaceId: workspace.sId,
                stripeError: true,
              },
              "Error tracking subscription reactivated."
            );
          });
        } else {
          ServerSideTracking.trackSubscriptionRequestCancel({
            workspace: renderLightWorkspaceType({ workspace }),
            requestCancelAt: now,
          }).catch((e) => {
            logger.error(
              {
                error: e,
                workspaceId: workspace.sId,
                stripeError: true,
              },
              "Error tracking subscription request cancel."
            );
          });
        }

        const { members } = await getMembers(auth, {
          roles: ["admin"],
          activeOnly: true,
        });
        const adminEmails = members.map((u) => u.email);
        if (adminEmails.length === 0) {
          logger.warn(
            { workspaceId: workspace.sId, stripeError: true },
            "[Stripe Webhook] No active admins found, skipping cancel/reactivate email."
          );
        }
        for (const adminEmail of adminEmails) {
          if (endDate) {
            await sendCancelSubscriptionEmail(
              adminEmail,
              workspace.sId,
              endDate
            );
          } else {
            await sendReactivateSubscriptionEmail(adminEmail);
          }
        }
      } else if (stripeSubscription.status === "active") {
        const subscription = await SubscriptionResource.fetchByStripeId(
          stripeSubscription.id
        );
        if (!subscription) {
          logger.warn(
            {
              event,
              stripeSubscriptionId: stripeSubscription.id,
            },
            "[Stripe Webhook] Subscription not found."
          );
          return ctx.json({ success: true });
        }
        if (subscription.trialing) {
          await subscription.markAsActive({ trialing: false });
        }
      }

      const validStatus = assertStripeSubscriptionIsValid(stripeSubscription);
      if (validStatus.isErr()) {
        getStatsDClient().increment("stripe.subscription.invalid", 1, [
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
    }

    case "customer.subscription.deleted": {
      logger.info(
        { event },
        "[Stripe Webhook] Received customer.subscription.deleted event."
      );
      stripeSubscription = event.data.object as Stripe.Subscription;

      if (stripeSubscription.status !== "canceled") {
        logger.error(
          {
            event,
            stripeSubscriptionId: stripeSubscription.id,
            status: stripeSubscription.status,
            stripeError: true,
          },
          `[Stripe Webhook] Received customer.subscription.deleted with unknown status = ${stripeSubscription.status}. Expected status = canceled.`
        );
        return ctx.json({ success: true });
      }

      const matchingSubscription = await SubscriptionResource.fetchByStripeId(
        stripeSubscription.id
      );
      if (!matchingSubscription) {
        logger.warn(
          {
            event,
            stripeSubscriptionId: stripeSubscription.id,
          },
          "Stripe Webhook: Error handling customer.subscription.deleted. Matching subscription not found on db."
        );
        return ctx.json({ success: true });
      }

      switch (matchingSubscription.status) {
        case "ended":
          logger.info(
            { event },
            "[Stripe Webhook] Received customer.subscription.deleted event but the subscription was already with status = ended. Doing nothing."
          );
          break;
        case "created_backend_only":
          logger.warn(
            { event },
            "[Stripe Webhook] Unexpected: customer.subscription.deleted matched a created_backend_only subscription. Marking it as ended."
          );
          await matchingSubscription.markAsEnded("ended");
          break;
        case "ended_backend_only":
          logger.info(
            { event },
            "[Stripe Webhook] Received customer.subscription.deleted event with the subscription status = ended_backend_only. Ending the subscription without deleting any data"
          );
          await matchingSubscription.markAsEnded("ended");
          break;
        case "active": {
          logger.info(
            { event },
            "[Stripe Webhook] Received customer.subscription.deleted event with the subscription status = active. Ending the subscription and deleting some workspace data"
          );
          await matchingSubscription.markAsEnded("ended");

          const workspace = await WorkspaceResource.fetchByModelId(
            matchingSubscription.workspaceId
          );
          assert(workspace, "Workspace not found for trialing subscription.");

          const scheduleScrubRes = await launchScheduleWorkspaceScrubWorkflow({
            workspaceId: workspace.sId,
          });
          if (scheduleScrubRes.isErr()) {
            logger.error(
              {
                stripeError: true,
                workspaceId: workspace.sId,
                stripeSubscriptionId: stripeSubscription.id,
                error: scheduleScrubRes.error,
              },
              "Error launching scrub workspace workflow"
            );
            return apiError(ctx, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: `Error launching scrub workspace workflow: ${scheduleScrubRes.error.message}`,
              },
            });
          }
          break;
        }
        default:
          assertNever(matchingSubscription.status);
      }
      break;
    }

    case "customer.subscription.trial_will_end": {
      logger.info(
        { event },
        "[Stripe Webhook] Received customer.subscription.trial_will_end."
      );
      stripeSubscription = event.data.object as Stripe.Subscription;

      const trialingSubscription = await SubscriptionResource.fetchByStripeId(
        stripeSubscription.id
      );
      if (!trialingSubscription) {
        logger.warn(
          {
            event,
            stripeSubscriptionId: stripeSubscription.id,
          },
          "[Stripe Webhook] Subscription not found."
        );
        return ctx.json({ success: true });
      }

      const w = await WorkspaceResource.fetchByModelId(
        trialingSubscription.workspaceId
      );
      assert(w, "Workspace not found for ending trial subscription.");

      await SubscriptionResource.maybeCancelInactiveTrials(
        await Authenticator.internalAdminForWorkspace(w.sId),
        stripeSubscription
      );

      break;
    }

    default:
    // Unhandled event type.
  }

  return ctx.json({ success: true });
});

export default app;
