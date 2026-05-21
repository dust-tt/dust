import apiConfig from "@app/lib/api/config";
import {
  dispatchCreditsAdded,
  dispatchPaygCapReached,
  dispatchPerUserCapReached,
  dispatchPerUserCapResolved,
  dispatchPoolExhausted,
} from "@app/lib/api/metronome/credit_state_dispatcher";
import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import { Authenticator } from "@app/lib/auth";
import {
  markAwuPurchaseAttemptFailed,
  markAwuPurchaseAttemptSucceeded,
} from "@app/lib/credits/awu_purchase_status";
import {
  calculateFreeCreditAmountMicroUsd,
  countEligibleUsersForFreeCredits,
  grantFreeCreditFromMetronomeSegment,
  YEARLY_MULTIPLIER,
} from "@app/lib/credits/free";
import {
  getMetronomeClient,
  getMetronomeContractById,
  listMetronomeContracts,
  updateMetronomeCreditSegmentAmount,
} from "@app/lib/metronome/client";
import { PLAN_CODE_CUSTOM_FIELD_KEY } from "@app/lib/metronome/constants";
import { invalidateContractCache } from "@app/lib/metronome/plan_type";
import { isMetronomeFreeCredit } from "@app/lib/metronome/types";
import {
  getCustomerIdFromEvent,
  MetronomeWebhookEventSchema,
} from "@app/lib/metronome/webhook_events";
import { PlanModel } from "@app/lib/models/plan";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { launchScheduleWorkspaceScrubWorkflow } from "@app/temporal/scrub_workspace/client";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";
import { z } from "zod";

type ResponseBody = {
  success: boolean;
  message?: string;
};

// Mounted at /api/metronome/webhook.
const app = new Hono();

app.get(
  "/",
  async (ctx): HandlerResult<ResponseBody> => ctx.json({ success: true })
);

app.post("/", async (ctx): HandlerResult<ResponseBody> => {
  // Read the raw body bytes once. Metronome's SDK signature verification
  // works on the exact string representation of the JSON body.
  const bodyString = await ctx.req.text();

  // Verify signature using the Metronome SDK.
  const webhookSecret = apiConfig.getMetronomeWebhookSecret();
  if (!webhookSecret) {
    logger.error(
      "[Metronome Webhook] METRONOME_WEBHOOK_SECRET is not configured"
    );
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Webhook secret not configured.",
      },
    });
  }

  // SDK expects Node-style headers (an object of name -> string).
  const headers: Record<string, string> = {};
  ctx.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let rawEvent: unknown;
  try {
    const client = getMetronomeClient();
    rawEvent = client.webhooks.unwrap(bodyString, headers, webhookSecret);
  } catch (err) {
    logger.error(
      { error: normalizeError(err) },
      "[Metronome Webhook] Signature verification failed"
    );
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "internal_server_error",
        message: "Invalid webhook signature.",
      },
    });
  }

  const parsedEvent = MetronomeWebhookEventSchema.safeParse(rawEvent);
  if (!parsedEvent.success) {
    // Metronome may add new event types or backward-compatible fields
    // without notice. Log and ack so we don't retry-storm.
    const rawType = z.object({ type: z.string() }).safeParse(rawEvent);
    logger.warn(
      {
        eventType: rawType.success ? rawType.data.type : "unknown",
        rawEvent,
        error: parsedEvent.error.message,
      },
      "[Metronome Webhook] Unknown or malformed event"
    );
    return ctx.json({ success: true });
  }

  const event = parsedEvent.data;

  logger.info({ event, rawEvent }, "[Metronome Webhook] Event received");

  // Resolve the workspace once for any event that carries a customer_id
  // (every type except `integration.issue`). If the customer can't be
  // mapped to a workspace, ack and stop — Metronome would otherwise
  // retry-storm a payload we have nothing to do with.
  const customerId = getCustomerIdFromEvent(event);
  const workspace = customerId
    ? await WorkspaceResource.fetchByMetronomeCustomerId(customerId)
    : null;

  if (!workspace) {
    logger.info(
      { customerId, eventType: event.type },
      "[Metronome Webhook] Workspace not found for customer, skipping"
    );
    return ctx.json({ success: true });
  }

  switch (event.type) {
    case "alerts.spend_threshold_reached": {
      const userIdGroup = event.properties.group_values?.find(
        (g) => g.key === "user_id"
      );
      const isPerUser = userIdGroup !== undefined;
      const userId = userIdGroup?.value;

      if (isPerUser) {
        if (!userId) {
          logger.warn(
            { eventId: event.id, workspaceId: workspace.sId },
            "[Metronome Webhook] spend_threshold_reached: per-user alert with no user_id value, skipping"
          );
          break;
        }
        const dispatchResult = await dispatchPerUserCapReached({
          workspace,
          userId,
        });
        if (dispatchResult.isErr()) {
          logger.error(
            {
              eventId: event.id,
              workspaceId: workspace.sId,
              userId,
              err: dispatchResult.error,
            },
            "[Metronome Webhook] spend_threshold_reached: per_user dispatch failed"
          );
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: `Error dispatching per-user cap reached: ${dispatchResult.error.message}`,
            },
          });
        }
        logger.info(
          {
            eventId: event.id,
            workspaceId: workspace.sId,
            userId,
            currentSpend: event.properties.current_spend,
          },
          "[Metronome Webhook] spend_threshold_reached: per_user dispatched"
        );
      } else {
        await dispatchPaygCapReached({ workspace });
        logger.info(
          {
            eventId: event.id,
            workspaceId: workspace.sId,
            currentSpend: event.properties.current_spend,
          },
          "[Metronome Webhook] spend_threshold_reached: payg cap dispatched"
        );
      }
      break;
    }
    case "alerts.spend_threshold_resolved": {
      const userIdGroup = event.properties.group_values?.find(
        (g) => g.key === "user_id"
      );
      const isPerUser = userIdGroup !== undefined;
      const userId = userIdGroup?.value;

      if (isPerUser) {
        if (!userId) {
          logger.warn(
            { eventId: event.id, workspaceId: workspace.sId },
            "[Metronome Webhook] spend_threshold_resolved: per-user alert with no user_id value, skipping"
          );
          break;
        }

        const dispatchResult = await dispatchPerUserCapResolved({
          workspace,
          userId,
        });
        if (dispatchResult.isErr()) {
          logger.error(
            {
              eventId: event.id,
              workspaceId: workspace.sId,
              userId,
              err: dispatchResult.error,
            },
            "[Metronome Webhook] spend_threshold_resolved: per-user dispatch failed"
          );
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: `Error dispatching per-user cap resolved: ${dispatchResult.error.message}`,
            },
          });
        }
        logger.info(
          {
            eventId: event.id,
            workspaceId: workspace.sId,
            userId,
          },
          "[Metronome Webhook] spend_threshold_resolved: per-user dispatched"
        );
      } else {
        logger.info(
          { eventId: event.id, workspaceId: workspace.sId },
          "[Metronome Webhook] spend_threshold_resolved: workspace-level, no transition"
        );
      }
      break;
    }
    case "alerts.low_remaining_contract_credit_and_commit_balance_reached": {
      const remaining = event.properties.remaining_balance;
      if (remaining == null || remaining <= 0) {
        await dispatchPoolExhausted({ workspace });
        logger.info(
          {
            eventId: event.id,
            workspaceId: workspace.sId,
            remaining,
          },
          "[Metronome Webhook] low_remaining_contract_credit_and_commit_balance_reached: pool exhausted dispatched"
        );
      }
      break;
    }
    case "alerts.low_remaining_contract_credit_and_commit_balance_resolved": {
      await dispatchCreditsAdded({ workspace });
      logger.info(
        {
          eventId: event.id,
          workspaceId: workspace.sId,
          remaining: event.properties.remaining_balance,
        },
        "[Metronome Webhook] low_remaining_contract_credit_and_commit_balance_resolved: credits added dispatched"
      );
      break;
    }
    case "alerts.invoice_total_reached":
    case "alerts.invoice_total_resolved":
    case "alerts.low_remaining_commit_balance_reached":
    case "alerts.low_remaining_commit_balance_resolved":
    case "alerts.low_remaining_contract_credit_balance_reached":
    case "alerts.low_remaining_contract_credit_balance_resolved":
    case "alerts.low_remaining_credit_balance_reached":
    case "alerts.low_remaining_credit_balance_resolved":
    case "alerts.low_remaining_seat_balance_reached":
    case "alerts.low_remaining_seat_balance_resolved":
    case "alerts.usage_threshold_reached":
    case "alerts.usage_threshold_resolved":
    case "commit.archive":
    case "commit.create":
    case "commit.edit":
    case "commit.segment.end":
    case "commit.segment.start":
    case "contract.archive":
    case "contract.create":
    case "contract.edit":
    case "credit.archive":
    case "credit.create":
    case "credit.edit":
    case "credit.segment.end":
    case "invoice.billing_provider_error":
    case "invoice.finalized":
      break;

    case "payment_gate.payment_status": {
      const {
        customer_id: customerId,
        contract_id: contractId,
        invoice_id: invoiceId,
        payment_status: paymentStatus,
        error_message: errorMessage,
      } = event.properties;
      if (paymentStatus === "succeeded") {
        logger.info(
          { customerId, contractId, invoiceId, paymentStatus },
          "[Metronome Webhook] Payment-gated commit paid"
        );
        // Resolve the AWU purchase attempt the UI is polling for. The
        // store ignores the call if no attempt is pending on this
        // contract (e.g. a non-AWU payment-gated commit).
        await markAwuPurchaseAttemptSucceeded({
          workspaceId: workspace.sId,
          contractId,
          invoiceId,
        });
      } else {
        logger.warn(
          {
            customerId,
            contractId,
            invoiceId,
            paymentStatus,
            errorMessage,
          },
          "[Metronome Webhook] Payment-gated commit payment failed"
        );
        await markAwuPurchaseAttemptFailed({
          workspaceId: workspace.sId,
          contractId,
          errorMessage: errorMessage ?? "Payment failed",
          invoiceId: invoiceId || undefined,
        });
      }
      break;
    }

    case "payment_gate.payment_pending_action_required":
    case "payment_gate.threshold_reached":
    case "payment_gate.external_initiate":
      break;

    case "credit.segment.start": {
      const {
        customer_id: customerId,
        contract_id: contractId,
        credit_id: creditId,
        segment_id: segmentId,
      } = event;

      if (!contractId) {
        logger.info(
          { customerId, creditId, workspaceId: workspace.sId },
          "[Metronome Webhook] credit.segment.start: no contract_id on credit, ignoring"
        );
        break;
      }

      const contractResult = await getMetronomeContractById({
        metronomeCustomerId: customerId,
        metronomeContractId: contractId,
      });
      if (contractResult.isErr()) {
        logger.error(
          {
            customerId,
            contractId,
            creditId,
            error: contractResult.error,
          },
          "[Metronome Webhook] credit.segment.start: failed to fetch contract"
        );
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Error fetching contract: ${contractResult.error.message}`,
          },
        });
      }

      const credit = contractResult.value.credits?.find(
        (c) => c.id === creditId
      );
      if (!credit) {
        logger.info(
          { customerId, contractId, creditId },
          "[Metronome Webhook] credit.segment.start: credit not found on contract, ignoring"
        );
        break;
      }

      if (!isMetronomeFreeCredit(credit)) {
        logger.info(
          {
            customerId,
            creditId,
            productId: credit.product.id,
            creditTypeId: credit.access_schedule?.credit_type?.id,
          },
          "[Metronome Webhook] credit.segment.start: ignoring non-free-credit segment"
        );
        break;
      }

      const recurringCredit = credit.recurring_credit_id
        ? contractResult.value.recurring_credits?.find(
            (rc) => rc.id === credit.recurring_credit_id
          )
        : undefined;
      const isAnnual = recurringCredit?.recurrence_frequency === "ANNUAL";

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      const programmaticConfig =
        await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);

      let amountMicroUsd: number;
      let userCount: number | undefined;
      if (
        programmaticConfig &&
        programmaticConfig.freeCreditMicroUsd !== null
      ) {
        amountMicroUsd = programmaticConfig.freeCreditMicroUsd;
      } else {
        userCount = await countEligibleUsersForFreeCredits(workspace);
        const monthlyAmountMicroUsd =
          calculateFreeCreditAmountMicroUsd(userCount);
        amountMicroUsd = isAnnual
          ? monthlyAmountMicroUsd * YEARLY_MULTIPLIER
          : monthlyAmountMicroUsd;
      }
      const amount = amountMicroUsd / 1_000_000;

      const updateResult = await updateMetronomeCreditSegmentAmount({
        metronomeCustomerId: customerId,
        contractId,
        creditId,
        segmentId,
        amount,
      });

      if (updateResult.isErr()) {
        logger.error(
          {
            customerId,
            contractId,
            creditId,
            segmentId,
            error: updateResult.error,
            workspaceId: workspace.sId,
          },
          "[Metronome Webhook] credit.segment.start: failed to update free credit amount"
        );
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Error updating free credit amount: ${updateResult.error.message}`,
          },
        });
      }

      const segment = credit.access_schedule?.schedule_items.find(
        (s) => s.id === segmentId
      );
      if (!segment) {
        logger.warn(
          {
            customerId,
            contractId,
            creditId,
            segmentId,
            workspaceId: workspace.sId,
          },
          "[Metronome Webhook] credit.segment.start: segment not found in access_schedule, skipping DB credit creation"
        );
        break;
      }
      const periodStart = new Date(segment.starting_at);
      const periodEnd = new Date(segment.ending_before);

      const grantResult = await grantFreeCreditFromMetronomeSegment({
        auth,
        metronomeCreditId: creditId,
        contractId,
        segmentId,
        isAnnual,
        amountMicroUsd,
        periodStart,
        periodEnd,
      });

      if (grantResult.isErr()) {
        logger.error(
          {
            customerId,
            contractId,
            creditId,
            segmentId,
            error: grantResult.error,
            workspaceId: workspace.sId,
          },
          "[Metronome Webhook] credit.segment.start: failed to ensure DB credit"
        );
        break;
      }

      logger.info(
        {
          customerId,
          contractId,
          creditId,
          segmentId,
          amountMicroUsd,
          userCount,
          isAnnual,
          usedProgrammaticOverride:
            programmaticConfig?.freeCreditMicroUsd != null,
          dbCreditId: grantResult.value.credit.id,
          dbCreditCreated: grantResult.value.created,
          dbCreditAlreadyExisted: grantResult.value.alreadyExisted,
          periodStart,
          periodEnd,
          workspaceId: workspace.sId,
        },
        "[Metronome Webhook] credit.segment.start: free credit amount updated and DB credit ensured"
      );
      break;
    }

    case "contract.start": {
      const { contract_id: contractId, customer_id: customerId } = event;

      const contractResult = await getMetronomeContractById({
        metronomeCustomerId: customerId,
        metronomeContractId: contractId,
      });
      if (contractResult.isErr()) {
        logger.error(
          {
            contractId,
            customerId,
            error: contractResult.error,
            workspaceId: workspace.sId,
          },
          "[Metronome Webhook] contract.start: failed to fetch contract"
        );
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Error fetching contract: ${contractResult.error.message}`,
          },
        });
      }

      const targetPlanCode =
        contractResult.value.custom_fields?.[PLAN_CODE_CUSTOM_FIELD_KEY];
      if (!targetPlanCode) {
        logger.info(
          { contractId, workspaceId: workspace.sId },
          `[Metronome Webhook] contract.start: no ${PLAN_CODE_CUSTOM_FIELD_KEY} custom field, leaving subscription alone`
        );
        break;
      }

      const targetPlan = await PlanModel.findOne({
        where: { code: targetPlanCode },
      });
      if (!targetPlan) {
        logger.info(
          { contractId, targetPlanCode, workspaceId: workspace.sId },
          `[Metronome Webhook] contract.start: ${PLAN_CODE_CUSTOM_FIELD_KEY} not found, leaving subscription alone`
        );
        break;
      }

      const activeSubscription =
        await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
      if (!activeSubscription) {
        logger.warn(
          { contractId, customerId, workspaceId: workspace.sId },
          "[Metronome Webhook] contract.start: no active subscription"
        );
        break;
      }

      if (activeSubscription.metronomeContractId === contractId) {
        logger.info(
          { contractId, workspaceId: workspace.sId },
          "[Metronome Webhook] contract.start: subscription already swapped, skipping"
        );
        break;
      }

      const pendingSubscription =
        await SubscriptionResource.fetchByMetronomeContractId(
          workspace,
          contractId
        );
      if (
        pendingSubscription &&
        pendingSubscription.status === "created_backend_only"
      ) {
        await pendingSubscription.activatePending();
        await invalidateContractCache(workspace.sId);
        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );
        await restoreWorkspaceAfterSubscription(auth);
        logger.info(
          {
            contractId,
            planCode: targetPlan.code,
            workspaceId: workspace.sId,
          },
          "[Metronome Webhook] contract.start: pending subscription activated"
        );
        break;
      }

      if (
        !activeSubscription.isMetronomeOnlyBilled &&
        activeSubscription.isBilled
      ) {
        logger.info(
          {
            contractId,
            targetPlanCode,
            workspaceId: workspace.sId,
          },
          "[Metronome Webhook] contract.start: subscription is not Metronome-only billed, leaving subscription alone"
        );
        break;
      }

      await activeSubscription.swapMetronomeContract({
        metronomeContractId: contractId,
        planCode: targetPlan.code,
      });

      await invalidateContractCache(workspace.sId);

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      await restoreWorkspaceAfterSubscription(auth);

      logger.info(
        {
          contractId,
          planCode: targetPlan.code,
          workspaceId: workspace.sId,
        },
        "[Metronome Webhook] contract.start: subscription upgraded"
      );
      break;
    }

    case "contract.end": {
      const { contract_id: contractId, customer_id: customerId } = event;

      if (!workspace) {
        break;
      }

      await invalidateContractCache(workspace.sId);

      const subscription =
        await SubscriptionResource.fetchByMetronomeContractId(
          workspace,
          contractId
        );
      if (!subscription) {
        logger.warn(
          { contractId, customerId, workspaceId: workspace.sId },
          "[Metronome Webhook] contract.end: subscription not found"
        );
        break;
      }

      if (subscription.isMetronomeShadowBilled) {
        logger.info(
          { contractId, workspaceId: workspace.sId },
          "[Metronome Webhook] contract.end: shadow contract ended, Stripe handles subscription"
        );
        break;
      }

      switch (subscription.status) {
        case "ended":
          logger.info(
            { contractId, workspaceId: workspace.sId },
            "[Metronome Webhook] contract.end: subscription already ended"
          );
          break;

        case "ended_backend_only":
          logger.info(
            { contractId, workspaceId: workspace.sId },
            "[Metronome Webhook] contract.end: marking as ended (backend-initiated)"
          );
          await subscription.markAsEnded("ended");
          break;

        case "created_backend_only":
          logger.info(
            { contractId, workspaceId: workspace.sId },
            "[Metronome Webhook] contract.end: pending subscription never activated, marking as ended"
          );
          await subscription.markAsEnded("ended");
          break;

        case "active": {
          const successorsResult = await listMetronomeContracts(customerId, {
            coveringDate: new Date(),
          });
          if (successorsResult.isErr()) {
            logger.error(
              {
                contractId,
                error: successorsResult.error,
                workspaceId: workspace.sId,
              },
              "[Metronome Webhook] contract.end: failed to list contracts for successor check"
            );
            return apiError(ctx, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: "Error listing contracts for successor check.",
              },
            });
          }

          const hasActiveSuccessor = successorsResult.value.some(
            (c) => c.id !== contractId
          );
          if (hasActiveSuccessor) {
            logger.info(
              { contractId, workspaceId: workspace.sId },
              "[Metronome Webhook] contract.end: successor contract active, skipping scrub (contract.start will swap subscription)"
            );
            break;
          }

          await subscription.markAsEnded("ended");
          logger.info(
            { contractId, workspaceId: workspace.sId },
            "[Metronome Webhook] contract.end: ending subscription and scrubbing workspace"
          );
          const scrubRes = await launchScheduleWorkspaceScrubWorkflow({
            workspaceId: workspace.sId,
          });
          if (scrubRes.isErr()) {
            logger.error(
              {
                workspaceId: workspace.sId,
                contractId,
                error: scrubRes.error,
              },
              "[Metronome Webhook] Error launching scrub workspace workflow"
            );
            return apiError(ctx, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: `Error launching scrub workspace workflow: ${scrubRes.error.message}`,
              },
            });
          }
          break;
        }

        default:
          assertNever(subscription.status);
      }
      break;
    }

    default:
      logger.info(
        { eventType: event.type },
        "[Metronome Webhook] Unhandled event type"
      );
      break;
  }

  return ctx.json({ success: true });
});

export default app;
