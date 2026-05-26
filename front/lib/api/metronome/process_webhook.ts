import {
  dispatchCreditsAdded,
  dispatchPaygCapReached,
  dispatchPerUserCapReached,
  dispatchPerUserCapResolved,
  dispatchPoolExhausted,
  syncPoolCreditStateFromBalance,
} from "@app/lib/api/metronome/credit_state_dispatcher";
import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
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
  getMetronomeContractById,
  listMetronomeContracts,
  setMetronomeContractCreditCustomFields,
  updateMetronomeCreditSegmentAmount,
} from "@app/lib/metronome/client";
import {
  CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY,
  CONTRACT_CREDIT_TYPE_EXCESS,
  CONTRACT_CREDIT_TYPE_POOL,
  getCreditTypeAwuId,
  getProductExcessCreditsId,
  PLAN_CODE_CUSTOM_FIELD_KEY,
} from "@app/lib/metronome/constants";
import { invalidateContractCache } from "@app/lib/metronome/plan_type";
import { isMetronomeFreeCredit } from "@app/lib/metronome/types";
import type { MetronomeWebhookEvent } from "@app/lib/metronome/webhook_events";
import { PlanModel } from "@app/lib/models/plan";
import { isFreePlan } from "@app/lib/plans/plan_codes";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { launchScheduleWorkspaceScrubWorkflow } from "@app/temporal/scrub_workspace/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export class ProcessMetronomeWebhookError extends Error {
  constructor(
    readonly type: "processing_failed",
    message: string
  ) {
    super(message);
  }
}

/**
 * Stamp `DUST_CONTRACT_CREDIT_TYPE` on a contract_credit. Idempotent — bails
 * out if the field is already set on the credit. Used by both `credit.create`
 * and `credit.segment.start` handlers so every newly visible credit gets
 * tagged regardless of which event Metronome fires first.
 *
 *   - excess product → "excess" (filtered out of default alerts)
 *   - per-seat (INDIVIDUAL allocation) → unstamped (workspace pool alerts
 *     don't track per-seat balances)
 *   - everything else (incl. customer-level credits) → "pool" (counted)
 */
async function stampContractCreditType({
  customerId,
  contractId,
  creditId,
  creditCustomFields,
  eventType,
}: {
  customerId: string;
  contractId: string | null | undefined;
  creditId: string;
  creditCustomFields?: Record<string, string> | null;
  eventType: string;
}): Promise<Result<void, ProcessMetronomeWebhookError>> {
  if (creditCustomFields?.[CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY]) {
    return new Ok(undefined);
  }

  let value:
    | typeof CONTRACT_CREDIT_TYPE_POOL
    | typeof CONTRACT_CREDIT_TYPE_EXCESS = CONTRACT_CREDIT_TYPE_POOL;

  if (contractId) {
    const contractResult = await getMetronomeContractById({
      metronomeCustomerId: customerId,
      metronomeContractId: contractId,
    });
    if (contractResult.isErr()) {
      logger.error(
        { customerId, contractId, creditId, error: contractResult.error },
        `[Metronome Webhook] ${eventType}: failed to fetch contract for stamping`
      );
      return new Err(
        new ProcessMetronomeWebhookError(
          "processing_failed",
          `Error fetching contract: ${contractResult.error.message}`
        )
      );
    }

    const credit = contractResult.value.credits?.find((c) => c.id === creditId);
    if (!credit) {
      logger.info(
        { customerId, contractId, creditId },
        `[Metronome Webhook] ${eventType}: credit not found on contract, skipping stamp`
      );
      return new Ok(undefined);
    }

    // Re-check after the fresh fetch — Metronome may have stamped it between
    // event emission and our processing (e.g. if both credit.create and
    // credit.segment.start fire).
    if (credit.custom_fields?.[CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY]) {
      return new Ok(undefined);
    }

    if (credit.subscription_config?.allocation === "INDIVIDUAL") {
      return new Ok(undefined);
    }

    if (credit.product.id === getProductExcessCreditsId()) {
      value = CONTRACT_CREDIT_TYPE_EXCESS;
    }
  }

  const setResult = await setMetronomeContractCreditCustomFields({
    creditId,
    customFields: {
      [CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY]: value,
    },
  });
  if (setResult.isErr()) {
    return new Err(
      new ProcessMetronomeWebhookError(
        "processing_failed",
        `Error stamping contract credit custom field: ${setResult.error.message}`
      )
    );
  }
  logger.info(
    { customerId, contractId, creditId, value, eventType },
    `[Metronome Webhook] ${eventType}: stamped DUST_CONTRACT_CREDIT_TYPE`
  );
  return new Ok(undefined);
}

// Ensure the workspace has a WorkOS organization once it lands on a paid plan
// via `contract.start`. Idempotent — `switch_contract` already runs this on
// the synchronous path, but the webhook covers contracts created outside that
// flow (manual provisioning, legacy migrations). Failures are logged but do
// not fail the webhook: the contract is already active and the org can be
// created later by the `/w/[wId]/domains` endpoint or a re-trigger.
async function ensureWorkOSOrganizationForPaidPlan({
  workspace,
  planCode,
  contractId,
}: {
  workspace: WorkspaceResource;
  planCode: string;
  contractId: string;
}): Promise<void> {
  if (isFreePlan(planCode)) {
    return;
  }
  const workosResult = await getOrCreateWorkOSOrganization(
    renderLightWorkspaceType({ workspace })
  );
  if (workosResult.isErr()) {
    logger.error(
      {
        contractId,
        planCode,
        workspaceId: workspace.sId,
        err: workosResult.error,
      },
      "[Metronome Webhook] contract.start: failed to provision WorkOS organization"
    );
  }
}

export async function processMetronomeWebhook({
  event,
  workspace,
}: {
  event: MetronomeWebhookEvent;
  workspace: WorkspaceResource;
}): Promise<Result<undefined, ProcessMetronomeWebhookError>> {
  switch (event.type) {
    case "alerts.spend_threshold_reached": {
      // Two flavours land on this event type:
      //   - Per-user cap: scoped via `presentation_group_key = user_id`,
      //   so `group_values` includes a `{ key: "user_id" }` entry
      //   (with or without a populated `value`).
      //   - Workspace-level PAYG cap: no `user_id` key in group_values.
      // The presence of the user_id key, not its value, decides the routing.
      // A missing value still means "this is a per-user alert",
      // it's just one we cannot act on.
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
          return new Err(
            new ProcessMetronomeWebhookError(
              "processing_failed",
              `Error dispatching per-user cap reached: ${dispatchResult.error.message}`
            )
          );
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
      // Per-user: at billing-cycle renewal current_spend resets to 0, so
      // Metronome fires this for every previously-capped user, we uncap them.
      //
      // Workspace-level: a `payg_cap_resolved` event means
      // spend dropped back below the PAYG threshold. We do not transition
      // on this signal: once the workspace is `depleted`, only a real
      // pool replenishment (commit.segment.start) brings it back.
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
          return new Err(
            new ProcessMetronomeWebhookError(
              "processing_failed",
              `Error dispatching per-user cap resolved: ${dispatchResult.error.message}`
            )
          );
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
      // Pool-exhaustion signal: total remaining (contract credits + commit balance)
      // hit zero. The commit-only and contract-credit-only alerts fire too early
      // when only one side is exhausted, so we listen to this combined alert
      // exclusively.
      //
      // Gate on `remaining_balance` defensively in case a non-zero warning threshold
      // is added under the same alert type later (e.g. early warning notification).
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
    case "commit.segment.end":
    case "contract.archive":
    case "contract.create":
    case "contract.edit":
    case "credit.archive":
    case "credit.segment.end":
    case "invoice.billing_provider_error":
    case "invoice.finalized":
      break;

    case "credit.create": {
      logger.info(
        {
          customerId: event.customer_id,
          contractId: event.contract_id,
          creditId: event.credit_id,
          workspaceId: workspace.sId,
        },
        "[Metronome Webhook] credit.create: handler entered"
      );
      const stampResult = await stampContractCreditType({
        customerId: event.customer_id,
        contractId: event.contract_id ?? null,
        creditId: event.credit_id,
        creditCustomFields: event.credit_custom_fields,
        eventType: "credit.create",
      });
      if (stampResult.isErr()) {
        return stampResult;
      }
      break;
    }

    // Payment-gated commit lifecycle. Metronome activates the commit
    // itself on success, so we don't grant credits here — just log the
    // outcome for observability (and surface failures with their
    // Stripe error message). AWU credit top-ups go through this flow
    // via `addPaymentGatedCommitToContract`.
    case "payment_gate.payment_status": {
      const {
        customer_id: customerId,
        contract_id: contractId,
        invoice_id: invoiceId,
        payment_status: paymentStatus,
        error_message: errorMessage,
      } = event.properties;
      if (paymentStatus === "paid") {
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
      } else if (paymentStatus === "failed") {
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
      } else {
        // Non-terminal `payment_status` values — log and leave the attempt
        // pending; the terminal "paid" / "failed" event will follow.
        logger.info(
          {
            customerId,
            contractId,
            invoiceId,
            paymentStatus,
            errorMessage,
          },
          "[Metronome Webhook] Payment-gated commit intermediate status, leaving attempt pending"
        );
      }
      break;
    }

    case "payment_gate.payment_pending_action_required":
    case "payment_gate.threshold_reached":
    case "payment_gate.external_initiate":
      break;

    // Fresh AWU credits / commits arriving (new period, contract switch,
    // manual grant) or being mutated (manual expiration, amount edit):
    // reconcile the workspace pool credit state with the live AWU balance.
    // Without this, a workspace stuck in `depleted` would never transition
    // out — `low_remaining..._resolved` doesn't fire if no
    // `low_remaining..._reached` was ever fired against the previous
    // balance. Likewise, a manual expiration that empties the pool wouldn't
    // transition to `depleted` because no alert was ever fired. Non-AWU
    // segments (programmatic USD, EUR seat credits, etc.) are out of scope
    // for the pool state machine and are skipped.
    case "commit.segment.start":
    case "commit.edit": {
      const eventType = event.type;
      const customerId = event.customer_id;
      const contractId = event.contract_id;
      const commitId = event.commit_id;

      if (!contractId) {
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
            commitId,
            error: contractResult.error,
          },
          `[Metronome Webhook] ${eventType}: failed to fetch contract`
        );
        return new Err(
          new ProcessMetronomeWebhookError(
            "processing_failed",
            `Error fetching contract: ${contractResult.error.message}`
          )
        );
      }

      const commit = contractResult.value.commits?.find(
        (c) => c.id === commitId
      );
      if (!commit) {
        break;
      }

      if (commit.access_schedule?.credit_type?.id !== getCreditTypeAwuId()) {
        break;
      }

      await syncPoolCreditStateFromBalance({
        workspace,
        metronomeCustomerId: customerId,
      });
      break;
    }

    case "credit.edit": {
      const {
        customer_id: customerId,
        contract_id: contractId,
        credit_id: creditId,
      } = event;

      if (!contractId) {
        break;
      }

      const contractResult = await getMetronomeContractById({
        metronomeCustomerId: customerId,
        metronomeContractId: contractId,
      });
      if (contractResult.isErr()) {
        logger.error(
          { customerId, contractId, creditId, error: contractResult.error },
          "[Metronome Webhook] credit.edit: failed to fetch contract"
        );
        return new Err(
          new ProcessMetronomeWebhookError(
            "processing_failed",
            `Error fetching contract: ${contractResult.error.message}`
          )
        );
      }

      const credit = contractResult.value.credits?.find(
        (c) => c.id === creditId
      );
      if (!credit) {
        break;
      }

      if (credit.access_schedule?.credit_type?.id === getCreditTypeAwuId()) {
        await syncPoolCreditStateFromBalance({
          workspace,
          metronomeCustomerId: customerId,
        });
      }
      break;
    }

    case "credit.segment.start": {
      const {
        customer_id: customerId,
        contract_id: contractId,
        credit_id: creditId,
        segment_id: segmentId,
      } = event;

      // Customer-level credits with no parent contract can't be the
      // managed free monthly credit (which is provisioned on a contract).
      if (!contractId) {
        logger.info(
          { customerId, creditId, workspaceId: workspace.sId },
          "[Metronome Webhook] credit.segment.start: no contract_id on credit, ignoring"
        );
        break;
      }

      // The webhook payload does not include the credit's product or
      // credit type, so fetch the contract to identify whether this
      // segment belongs to the free monthly credit we manage.
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
        return new Err(
          new ProcessMetronomeWebhookError(
            "processing_failed",
            `Error fetching contract: ${contractResult.error.message}`
          )
        );
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

      // Reconcile pool state only for AWU credits — non-AWU segments
      // (programmatic USD free credits, EUR seat credits, etc.) are out of
      // scope for the workspace pool state machine.
      if (credit.access_schedule?.credit_type?.id === getCreditTypeAwuId()) {
        await syncPoolCreditStateFromBalance({
          workspace,
          metronomeCustomerId: customerId,
        });
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

      // Detect whether this credit comes from an annual recurring credit
      // (annual contracts) so we grant a yearly amount instead of monthly.
      const recurringCredit = credit.recurring_credit_id
        ? contractResult.value.recurring_credits?.find(
            (rc) => rc.id === credit.recurring_credit_id
          )
        : undefined;
      const isAnnual = recurringCredit?.recurrence_frequency === "ANNUAL";

      // ProgrammaticUsageConfiguration.freeCreditMicroUsd, if set,
      // overrides the brackets-based calculation. Same convention as
      // grantFreeCreditsFromSubscriptionStateChange{,Yearly}: the
      // configured amount is the full-period amount (monthly or yearly
      // matching the recurring credit cadence) and is used as-is.
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
        return new Err(
          new ProcessMetronomeWebhookError(
            "processing_failed",
            `Error updating free credit amount: ${updateResult.error.message}`
          )
        );
      }

      // Metronome is the source of truth for the recurring free credit:
      // create + start the matching DB credit linked by metronomeCreditId.
      // The Stripe webhook will dedup against this when it fires.
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
        // The grant helper has already logged the failure with `panic`;
        // ack the webhook so Metronome doesn't retry-storm — operators
        // will reconcile from logs / the sync script.
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

      // Reconcile the workspace pool credit state against the new contract's
      // live AWU balance. Replaces the in-process call we previously made
      // from `provisionMetronomeContract` (removed to break a dependency
      // cycle through auth → subscription_resource → contracts). Without
      // this, a workspace whose previous contract ended `depleted` would
      // stay stuck after the new contract spins up with a fresh commit.
      await syncPoolCreditStateFromBalance({
        workspace,
        metronomeCustomerId: customerId,
      });

      // Read the PLAN_CODE custom field to know which plan to swap the
      // workspace subscription onto. The actual swap is gated below on
      // `isMetronomeOnlyBilled` — other billing paths (shadow, pure
      // Stripe) handle their own state transitions, and contracts whose
      // start aligns with a synchronous DB flip get caught by the
      // idempotency check.
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
        return new Err(
          new ProcessMetronomeWebhookError(
            "processing_failed",
            `Error fetching contract: ${contractResult.error.message}`
          )
        );
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

      // Idempotency: re-deliveries land here with the active subscription
      // already pointing at the new contract.
      if (activeSubscription.metronomeContractId === contractId) {
        logger.info(
          { contractId, workspaceId: workspace.sId },
          "[Metronome Webhook] contract.start: subscription already swapped, skipping"
        );
        break;
      }

      // Preferred path: a pending (created_backend_only) subscription was
      // staged when the contract was provisioned. Flip it to active and
      // end whatever active sub the workspace currently holds.
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
        await ensureWorkOSOrganizationForPaidPlan({
          workspace,
          planCode: targetPlan.code,
          contractId,
        });
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

      // Legacy fallback: no pending row was staged. Only swap when the
      // workspace is Metronome-only billed, or not billed at all. Shadow
      // billed subscriptions (Stripe + Metronome) follow Stripe's signal,
      // and pure Stripe subs have no Metronome contract at all.
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

      // End the current subscription as `ended_backend_only` and create
      // a new active subscription on the target plan + new contract.
      await activeSubscription.swapMetronomeContract({
        metronomeContractId: contractId,
        planCode: targetPlan.code,
      });

      await invalidateContractCache(workspace.sId);

      // Cancel any scheduled scrub workflow, unpause connectors, re-enable
      // triggers. Idempotent — safe to call regardless of prior state.
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      await restoreWorkspaceAfterSubscription(auth);

      await ensureWorkOSOrganizationForPaidPlan({
        workspace,
        planCode: targetPlan.code,
        contractId,
      });

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
          // Pending sub whose contract ended before activating (e.g.
          // sunset by an overlapping new contract). No active billing —
          // just close out the pending row.
          logger.info(
            { contractId, workspaceId: workspace.sId },
            "[Metronome Webhook] contract.end: pending subscription never activated, marking as ended"
          );
          await subscription.markAsEnded("ended");
          break;

        case "active": {
          // Race-safety: an Enterprise upgrade scheduled this end as part
          // of a transition. If a successor contract is already running
          // on this customer, contract.start (whether already processed
          // or arriving shortly) will swap the subscription — leave the
          // subscription alone here and skip the scrub.
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
            return new Err(
              new ProcessMetronomeWebhookError(
                "processing_failed",
                "Error listing contracts for successor check."
              )
            );
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

          // Launch the scrub workflow BEFORE marking the subscription
          // ended. If the launch fails the subscription stays "active",
          // so Metronome's retry re-enters this branch and tries again.
          // Reversing the order would mark the subscription ended on
          // first attempt; the retry would then dispatch to the "ended"
          // no-op branch and the scrub would never launch.
          // The launcher itself is idempotent (swallows
          // WorkflowExecutionAlreadyStartedError), so a retry after a
          // partial success — workflow started, response lost — also
          // converges.
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
            return new Err(
              new ProcessMetronomeWebhookError(
                "processing_failed",
                `Error launching scrub workspace workflow: ${scrubRes.error.message}`
              )
            );
          }
          await subscription.markAsEnded("ended");
          logger.info(
            { contractId, workspaceId: workspace.sId },
            "[Metronome Webhook] contract.end: subscription ended and scrub workflow scheduled"
          );
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

  return new Ok(undefined);
}
