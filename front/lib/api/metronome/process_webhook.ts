import {
  handleSubscriptionActivationFailure,
  handleSubscriptionActivationSuccess,
} from "@app/lib/api/checkout/business_activation";
import {
  maybeClearAdminsBalanceThresholdReached,
  maybeNotifyAdminsBalanceThresholdReached,
} from "@app/lib/api/credits/balance_threshold_alert";
import {
  dispatchCreditsAdded,
  dispatchLowBalance,
  dispatchPaygCapReached,
  dispatchPoolExhausted,
  dispatchSeatBalanceExhausted,
  dispatchSeatBalanceResolved,
  syncPoolCreditStateFromBalance,
} from "@app/lib/api/metronome/credit_state_dispatcher";
import { applyLegacyCreditMigrationAtActivation } from "@app/lib/api/metronome/legacy_credit_migration";
import { reconcileWorkspaceUserCreditStates } from "@app/lib/api/metronome/reconcile_credit_state";
import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import { ensureWorkOSOrganizationForPaidPlan } from "@app/lib/api/workos/organization";
import { Authenticator } from "@app/lib/auth";
import {
  markAwuPurchaseAttemptFailed,
  markAwuPurchaseAttemptSucceeded,
} from "@app/lib/credits/awu_purchase_status";
import { resolvePerUserCreditAlertUserId } from "@app/lib/metronome/alerts/per_user_credit_balance";
import { emitSubscriptionChangedAuditEvent } from "@app/lib/metronome/audit";
import {
  getMetronomeCommit,
  getMetronomeContractById,
  getMetronomeCredit,
  invalidateCachedCustomerPerUserCreditBalances,
  listMetronomeContracts,
  setMetronomeCommitCustomFields,
  setMetronomeContractCreditCustomFields,
} from "@app/lib/metronome/client";
import {
  CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY,
  CONTRACT_CREDIT_TYPE_EXCESS,
  CONTRACT_CREDIT_TYPE_FREE_SEAT,
  CONTRACT_CREDIT_TYPE_POOL,
  fromFreeMetronomeUserId,
  getCreditTypeAwuId,
  getProductExcessCreditsId,
  LEGACY_CREDIT_MIGRATION_CUSTOM_FIELD_KEY,
  PAYMENT_GATE_TYPE_CUSTOM_FIELD_KEY,
  PAYMENT_GATE_TYPE_SUBSCRIPTION_ACTIVATION,
  PLAN_CODE_CUSTOM_FIELD_KEY,
  SUBSCRIPTION_SWAP_HANDLED_INLINE_CUSTOM_FIELD_KEY,
} from "@app/lib/metronome/constants";
import { invalidateContractCache } from "@app/lib/metronome/plan_type";
import { carryOverContractBalancesOnRenewal } from "@app/lib/metronome/renewal_carry_over";
import type { MetronomeWebhookEvent } from "@app/lib/metronome/webhook_events";
import { PlanModel } from "@app/lib/models/plan";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { launchReconcileWorkspaceUserCreditStatesWorkflow } from "@app/temporal/metronome_events_queue/client";
import { launchScheduleWorkspaceScrubWorkflow } from "@app/temporal/scrub_workspace/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Commit, Credit } from "@metronome/sdk/resources";

class ProcessMetronomeWebhookError extends Error {
  constructor(
    readonly type: "processing_failed",
    message: string
  ) {
    super(message);
  }
}

/**
 * Stamp `DUST_CONTRACT_CREDIT_TYPE` on an AWU contract_credit so pool balance
 * alerts and queries count it. Idempotent — bails if already stamped. Only AWU
 * credits are stamped; others belong to different pools and are left alone
 * (mirrors `stampCommitCreditType`).
 *
 *   - non-AWU credit type → not stamped (belongs to another pool)
 *   - per-seat (INDIVIDUAL allocation) → not stamped (pool alerts don't track
 *     per-seat balances)
 *   - excess product → "excess" (filtered out of default alerts)
 *   - everything else → "pool" (counted)
 */
async function stampContractCreditType({
  workspaceId,
  credit,
  eventType,
}: {
  workspaceId: string;
  credit: Credit;
  eventType: string;
}): Promise<Result<void, ProcessMetronomeWebhookError>> {
  if (credit.custom_fields?.[CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY]) {
    return new Ok(undefined);
  }

  if (credit.access_schedule?.credit_type?.id !== getCreditTypeAwuId()) {
    return new Ok(undefined);
  }

  if (credit.subscription_config?.allocation === "INDIVIDUAL") {
    return new Ok(undefined);
  }

  // Per-user free-seat credits are stamped "free_seat" at creation (see
  // `addPerUserCreditToCustomer`), so they hit the already-stamped early
  // return above and are never re-stamped "pool" here.

  const value =
    credit.product.id === getProductExcessCreditsId()
      ? CONTRACT_CREDIT_TYPE_EXCESS
      : CONTRACT_CREDIT_TYPE_POOL;

  const setResult = await setMetronomeContractCreditCustomFields({
    creditId: credit.id,
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
    { workspaceId, creditId: credit.id, value, eventType },
    `[Metronome Webhook] ${eventType}: stamped DUST_CONTRACT_CREDIT_TYPE`
  );
  return new Ok(undefined);
}

// Stamp `DUST_CONTRACT_CREDIT_TYPE=pool` on an AWU commit so the pool balance
// alert's Commit filter counts it alongside pool credits. The key is shared with
// contract credits — Metronome requires every entity in an alert's
// custom_field_filters to use the same key/value. Idempotent — bails if already
// stamped. Commits have no excess or per-seat variants (unlike contract credits),
// so AWU commits are always "pool"; non-AWU commits (e.g. programmatic USD)
// belong to other pools and are left unstamped.
async function stampCommitCreditType({
  workspaceId,
  commit,
  commitCustomFields,
  eventType,
}: {
  workspaceId: string;
  commit: Commit;
  commitCustomFields?: Record<string, string> | null;
  eventType: string;
}): Promise<Result<void, ProcessMetronomeWebhookError>> {
  if (
    commitCustomFields?.[CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY] ||
    commit.custom_fields?.[CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY]
  ) {
    return new Ok(undefined);
  }

  if (commit.access_schedule?.credit_type?.id !== getCreditTypeAwuId()) {
    return new Ok(undefined);
  }

  const setResult = await setMetronomeCommitCustomFields({
    commitId: commit.id,
    customFields: {
      [CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY]: CONTRACT_CREDIT_TYPE_POOL,
    },
  });
  if (setResult.isErr()) {
    return new Err(
      new ProcessMetronomeWebhookError(
        "processing_failed",
        `Error stamping commit custom field: ${setResult.error.message}`
      )
    );
  }
  logger.info(
    { workspaceId, commitId: commit.id, eventType },
    `[Metronome Webhook] ${eventType}: stamped DUST_CONTRACT_CREDIT_TYPE=pool on commit`
  );
  return new Ok(undefined);
}

// Returns true when the credit is an individual AWU seat credit — i.e. the
// per-user recurring credit that backs a Pro/Max seat allocation. Used to
// decide whether a segment event should trigger a seat sync + user credit state
// reconciliation.
function isSeatAwuCredit(credit: Credit): boolean {
  return (
    credit.subscription_config?.allocation === "INDIVIDUAL" &&
    credit.access_schedule?.credit_type?.id === getCreditTypeAwuId()
  );
}

// Reconcile the workspace pool credit state from a commit/credit segment,
// create, or edit webhook event. Shared by `commit.*` and `credit.*` handlers.
// Only AWU entities feed the pool; anything else (programmatic USD, EUR seat
// credits, etc.) is out of scope for the pool state machine and skipped.
async function reconcilePoolStateFromSegmentEvent({
  workspace,
  metronomeCustomerId,
  commitOrCredit,
}: {
  workspace: WorkspaceResource;
  metronomeCustomerId: string;
  commitOrCredit: Commit | Credit;
}): Promise<void> {
  const creditTypeId = commitOrCredit.access_schedule?.credit_type?.id;

  if (creditTypeId !== getCreditTypeAwuId()) {
    return;
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      metronomeCustomerId,
      entityId: commitOrCredit.id,
    },
    "[Metronome Webhook] reconcilePoolStateFromSegmentEvent: reconciling pool from AWU entity"
  );
  await syncPoolCreditStateFromBalance({
    workspace,
    metronomeCustomerId,
  });
}

// Perform the subscription-affecting side effects of a Metronome
// `contract.start` event: carry over renewal balances, reconcile credit
// state, and swap (or activate a pending) local Subscription row onto the
// new contract.
export async function applyContractStartSubscriptionSwap({
  workspace,
  contractId,
  customerId,
}: {
  workspace: WorkspaceResource;
  contractId: string;
  customerId: string;
}): Promise<Result<undefined, ProcessMetronomeWebhookError>> {
  // Read the PLAN_CODE custom field to know which plan to swap the
  // workspace subscription onto. The actual swap is gated below on
  // `isMetronomeOnlyBilled` — other billing paths (shadow, pure
  // Stripe) handle their own state transitions, and contracts whose
  // start aligns with a synchronous DB flip get caught by the
  // idempotency check. Fetched up-front because the carry-over below also
  // needs the contract's transition lineage and start.
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

  // The contract was archived (cancelled) after the start webhook was
  // enqueued but before it was delivered — skip to avoid swapping the
  // active subscription onto a dead contract.
  if (contractResult.value.archived_at) {
    logger.info(
      { contractId, workspaceId: workspace.sId },
      "[Metronome Webhook] contract.start: contract is archived, skipping"
    );
    return new Ok(undefined);
  }

  const renewalTransition = contractResult.value.transitions?.find(
    (t) => t.to_contract_id === contractId
  );
  logger.info(
    {
      contractId,
      customerId,
      workspaceId: workspace.sId,
      transitions: contractResult.value.transitions,
      renewalFromContractId: renewalTransition?.from_contract_id ?? null,
    },
    "[Metronome Webhook] contract.start: renewal transition lookup"
  );
  if (renewalTransition) {
    const carryResult = await carryOverContractBalancesOnRenewal({
      metronomeCustomerId: customerId,
      fromContractId: renewalTransition.from_contract_id,
      toContractId: contractId,
      toContractStart: new Date(contractResult.value.starting_at),
    });
    if (carryResult.isErr()) {
      logger.error(
        {
          contractId,
          customerId,
          fromContractId: renewalTransition.from_contract_id,
          error: carryResult.error,
          workspaceId: workspace.sId,
        },
        "[Metronome Webhook] contract.start: failed to carry over balances"
      );
    }
  }

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

  // Reconcile per-user credit states against the new contract's live
  // per-seat balances. Seats were synced to this contract at provision
  // time (`syncSeatCount`), but that path does
  // not touch per-user credit states; now that the contract is active the
  // balances are live, so this lands each user in the right seat↔pool
  // state. Without it, a switch that changes seat allocations (e.g. moving
  // onto a business plan) leaves users stuck in their previous state.
  // Mirrors the pool reconcile above; pass the new contract id directly
  // since the subscription swap below may not have happened yet.
  const targetPlanCode =
    contractResult.value.custom_fields?.[PLAN_CODE_CUSTOM_FIELD_KEY];

  await reconcileWorkspaceUserCreditStates({
    workspace: renderLightWorkspaceType({ workspace }),
    metronomeCustomerId: customerId,
    metronomeContractId: contractId,
    planCode: targetPlanCode ?? "",
    contract: contractResult.value,
  });
  if (!targetPlanCode) {
    logger.info(
      { contractId, workspaceId: workspace.sId },
      `[Metronome Webhook] contract.start: no ${PLAN_CODE_CUSTOM_FIELD_KEY} custom field, leaving subscription alone`
    );
    return new Ok(undefined);
  }

  // Payment-gated subscription activation: skip the automatic swap here.
  // The payment_gate.payment_status webhook handles the plan switch once
  // payment succeeds, ensuring the workspace stays on CP_FREE_PLAN until paid.
  const paymentGateType =
    contractResult.value.custom_fields?.[PAYMENT_GATE_TYPE_CUSTOM_FIELD_KEY];
  if (paymentGateType === PAYMENT_GATE_TYPE_SUBSCRIPTION_ACTIVATION) {
    logger.info(
      { contractId, workspaceId: workspace.sId },
      "[Metronome Webhook] contract.start: payment-gated activation contract, skipping — payment_gate.payment_status will activate"
    );
    return new Ok(undefined);
  }

  // The calling code that provisioned this contract already created the
  // workspace's DB subscription row synchronously (e.g.
  // provisionCreditPricedFreePlan) to avoid racing with this webhook's
  // own swap logic below — skip it entirely.
  if (
    contractResult.value.custom_fields?.[
      SUBSCRIPTION_SWAP_HANDLED_INLINE_CUSTOM_FIELD_KEY
    ]
  ) {
    logger.info(
      { contractId, workspaceId: workspace.sId },
      "[Metronome Webhook] contract.start: subscription swap handled inline by caller, skipping"
    );
    return new Ok(undefined);
  }

  const targetPlan = await PlanModel.findOne({
    where: { code: targetPlanCode },
  });
  if (!targetPlan) {
    logger.info(
      { contractId, targetPlanCode, workspaceId: workspace.sId },
      `[Metronome Webhook] contract.start: ${PLAN_CODE_CUSTOM_FIELD_KEY} not found, leaving subscription alone`
    );
    return new Ok(undefined);
  }

  const activeSubscription =
    await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);

  // Idempotency: re-deliveries land here with the active subscription
  // already pointing at the new contract.
  if (activeSubscription.metronomeContractId === contractId) {
    logger.info(
      { contractId, workspaceId: workspace.sId },
      "[Metronome Webhook] contract.start: subscription already swapped, skipping"
    );
    return new Ok(undefined);
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
    const previousPlanCode = activeSubscription.getPlan().code;
    // `activatePending` flushes the contract cache itself.
    await pendingSubscription.activatePending();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await restoreWorkspaceAfterSubscription(auth);

    await applyStampedLegacyCreditMigration({
      auth,
      workspace,
      contract: contractResult.value,
      metronomeCustomerId: customerId,
      metronomeContractId: contractId,
    });
    await ensureWorkOSOrganizationForPaidPlan({
      workspace: renderLightWorkspaceType({ workspace }),
      planCode: targetPlan.code,
      contractId,
    });
    emitSubscriptionChangedAuditEvent({
      auth,
      planCode: targetPlanCode,
      previousPlanCode,
      metronomeContractId: contractId,
    });
    logger.info(
      {
        contractId,
        planCode: targetPlan.code,
        workspaceId: workspace.sId,
      },
      "[Metronome Webhook] contract.start: pending subscription activated"
    );
    return new Ok(undefined);
  }

  // No pending row was staged (e.g. an immediate switch). Swap the active
  // subscription onto the new contract regardless of its current billing
  // rail — switchContract is used this way routinely. The ONLY contract we
  // must NOT swap onto is a shadow contract: a Metronome contract that runs
  // in parallel to a Stripe subscription with no billing-provider delivery
  // (Stripe owns billing). That is a property of the contract itself — it has
  // no `customer_billing_provider_configuration` — and only applies while the
  // workspace is still Stripe-billed (so free / Metronome-only contracts,
  // which also lack a delivery config, are not mistaken for shadows).
  const startedContractIsShadow =
    !contractResult.value.customer_billing_provider_configuration &&
    !!activeSubscription.stripeSubscriptionId;
  if (startedContractIsShadow) {
    logger.info(
      {
        contractId,
        targetPlanCode,
        workspaceId: workspace.sId,
      },
      "[Metronome Webhook] contract.start: shadow contract started, leaving subscription alone (Stripe drives billing)"
    );
    return new Ok(undefined);
  }

  // End the current subscription as `ended_backend_only` and create
  // a new active subscription on the target plan + new contract.
  const legacyPreviousPlanCode = activeSubscription.getPlan().code;
  // `swapMetronomeContract` flushes the contract cache itself.
  await activeSubscription.swapMetronomeContract({
    metronomeContractId: contractId,
    planCode: targetPlan.code,
  });

  // Cancel any scheduled scrub workflow, unpause connectors, re-enable
  // triggers. Idempotent — safe to call regardless of prior state.
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  await restoreWorkspaceAfterSubscription(auth);

  await applyStampedLegacyCreditMigration({
    auth,
    workspace,
    contract: contractResult.value,
    metronomeCustomerId: customerId,
    metronomeContractId: contractId,
  });

  emitSubscriptionChangedAuditEvent({
    auth,
    planCode: targetPlan.code,
    previousPlanCode: legacyPreviousPlanCode,
    metronomeContractId: contractId,
  });

  await ensureWorkOSOrganizationForPaidPlan({
    workspace: renderLightWorkspaceType({ workspace }),
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
  return new Ok(undefined);
}

async function applyStampedLegacyCreditMigration({
  auth,
  workspace,
  contract,
  metronomeCustomerId,
  metronomeContractId,
}: {
  auth: Authenticator;
  workspace: WorkspaceResource;
  contract: {
    custom_fields?: Record<string, string> | null;
    starting_at: string;
  };
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<void> {
  const stamped =
    contract.custom_fields?.[LEGACY_CREDIT_MIGRATION_CUSTOM_FIELD_KEY];
  if (stamped === undefined) {
    return;
  }
  const freeAwuCreditsPerUser = Number.parseInt(stamped, 10);
  if (!Number.isFinite(freeAwuCreditsPerUser)) {
    logger.error(
      { metronomeContractId, workspaceId: workspace.sId, stamped },
      "[Metronome Webhook] contract.start: invalid legacy credit migration custom field, skipping credit migration"
    );
    return;
  }
  await applyLegacyCreditMigrationAtActivation({
    auth,
    workspace: renderLightWorkspaceType({ workspace }),
    metronomeCustomerId,
    metronomeContractId,
    startingAt: new Date(contract.starting_at),
    freeAwuCreditsPerUser,
  });
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
      // Only the workspace-level PAYG cap is acted on here. Per-user cap alerts
      // are no longer used (per-user enforcement moved to the Redis rate
      // limiter); a stale per-user alert is scoped via a `user_id` group and is
      // ignored.
      const isPerUser = event.properties.group_values?.some(
        (g) => g.key === "user_id"
      );
      if (isPerUser) {
        logger.info(
          { eventId: event.id, workspaceId: workspace.sId },
          "[Metronome Webhook] spend_threshold_reached: stale per-user alert, ignoring"
        );
        break;
      }
      await dispatchPaygCapReached({ workspace });
      logger.info(
        {
          eventId: event.id,
          workspaceId: workspace.sId,
          currentSpend: event.properties.current_spend,
        },
        "[Metronome Webhook] spend_threshold_reached: payg cap dispatched"
      );
      break;
    }
    case "alerts.spend_threshold_resolved": {
      // Workspace-level PAYG resolve is a no-op: once a workspace is `depleted`,
      // only a real pool replenishment (commit.segment.start) brings it back.
      // Stale per-user alerts are likewise ignored.
      logger.info(
        { eventId: event.id, workspaceId: workspace.sId },
        "[Metronome Webhook] spend_threshold_resolved: no transition"
      );
      break;
    }
    case "alerts.low_remaining_contract_credit_and_commit_balance_reached": {
      // Pool-exhaustion / low-balance signal: total remaining (contract credits
      // + commit balance) crossed a threshold. Multiple alerts are configured at
      // different thresholds (100, 10, 0 credits). Route to the appropriate
      // dispatcher based on the remaining balance reported by Metronome.
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
      } else {
        await dispatchLowBalance({ workspace, balanceAwu: remaining });
        logger.info(
          {
            eventId: event.id,
            workspaceId: workspace.sId,
            remaining,
          },
          "[Metronome Webhook] low_remaining_contract_credit_and_commit_balance_reached: low balance dispatched"
        );
      }

      // If this is the workspace's own configured balance-threshold alert,
      // email its admins.
      await maybeNotifyAdminsBalanceThresholdReached({
        metronomeCustomerId: workspace.metronomeCustomerId,
        workspaceId: workspace.sId,
        eventId: event.id,
        alertId: event.properties.alert_id ?? null,
        remainingBalanceCredits: remaining ?? null,
      });
      break;
    }
    case "alerts.low_remaining_contract_credit_and_commit_balance_resolved": {
      await dispatchCreditsAdded({
        workspace,
        newBalanceAwu: event.properties.remaining_balance ?? 0,
      });

      // If this is the workspace's own configured balance-threshold alert,
      // clear the warning banner now that the balance has recovered.
      await maybeClearAdminsBalanceThresholdReached({
        metronomeCustomerId: workspace.metronomeCustomerId,
        workspaceId: workspace.sId,
        alertId: event.properties.alert_id ?? null,
      });
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
    case "alerts.low_remaining_seat_balance_reached": {
      const userId = event.properties.seat_filter?.seat_group_value;
      if (!userId) {
        logger.warn(
          { eventId: event.id, workspaceId: workspace.sId },
          "[Metronome Webhook] low_remaining_seat_balance_reached: no seat_group_value in payload, skipping"
        );
        break;
      }
      const threshold = event.properties.threshold;
      if (threshold === null || threshold === undefined) {
        break;
      }
      if (threshold === 0) {
        await dispatchSeatBalanceExhausted({ workspace, userId });
        logger.info(
          { eventId: event.id, workspaceId: workspace.sId, userId },
          "[Metronome Webhook] low_remaining_seat_balance_reached: seat balance exhausted dispatched"
        );
      }
      break;
    }
    case "alerts.low_remaining_seat_balance_resolved": {
      const userId = event.properties.seat_filter?.seat_group_value;
      if (!userId) {
        logger.warn(
          { eventId: event.id, workspaceId: workspace.sId },
          "[Metronome Webhook] low_remaining_seat_balance_resolved: no seat_group_value in payload, skipping"
        );
        break;
      }
      await dispatchSeatBalanceResolved({ workspace, userId });
      logger.info(
        { eventId: event.id, workspaceId: workspace.sId, userId },
        "[Metronome Webhook] low_remaining_seat_balance_resolved: seat balance resolved dispatched"
      );
      break;
    }

    // Per-user free-seat credit balance. These alerts are scoped (via the
    // `DUST_PER_USER_CREDIT_USER` custom field) to a single free user's credit,
    // so they drive that user's seat↔capped transitions — the seat-balance
    // alert can't, because the free credit isn't a seat balance. The event
    // carries no `credit_id` for a custom-field-filtered alert, so the user is
    // resolved from the alert's enforced `custom_field_filters` via its
    // `alert_id` (see `resolvePerUserCreditAlertUserId`); events for any other
    // alert return null and are ignored. Two thresholds:
    // `threshold === 0` → exhausted (→ capped), else → near-limit flag set.
    case "alerts.low_remaining_contract_credit_balance_reached": {
      const { alert_id: alertId, threshold } = event.properties;
      const metronomeUserId = await resolvePerUserCreditAlertUserId({
        metronomeCustomerId: event.properties.customer_id,
        alertId,
      });
      if (!metronomeUserId || threshold === null || threshold === undefined) {
        break;
      }
      // Alerts are keyed by the free-prefixed Metronome user id; strip the
      // prefix to recover the raw sId used everywhere else.
      const userId =
        fromFreeMetronomeUserId(metronomeUserId) ?? metronomeUserId;
      if (threshold === 0) {
        await dispatchSeatBalanceExhausted({ workspace, userId });
        logger.info(
          { eventId: event.id, workspaceId: workspace.sId, userId },
          "[Metronome Webhook] low_remaining_contract_credit_balance_reached: per-user credit exhausted dispatched"
        );
      }
      break;
    }
    case "alerts.low_remaining_contract_credit_balance_resolved": {
      const metronomeUserId = await resolvePerUserCreditAlertUserId({
        metronomeCustomerId: event.properties.customer_id,
        alertId: event.properties.alert_id,
      });
      if (!metronomeUserId) {
        break;
      }
      // Alerts are keyed by the free-prefixed Metronome user id; strip the
      // prefix to recover the raw sId used everywhere else.
      const userId =
        fromFreeMetronomeUserId(metronomeUserId) ?? metronomeUserId;
      await dispatchSeatBalanceResolved({ workspace, userId });
      logger.info(
        { eventId: event.id, workspaceId: workspace.sId, userId },
        "[Metronome Webhook] low_remaining_contract_credit_balance_resolved: per-user credit resolved dispatched"
      );
      break;
    }

    case "alerts.invoice_total_reached":
    case "alerts.invoice_total_resolved":
    case "alerts.low_remaining_commit_balance_reached":
    case "alerts.low_remaining_commit_balance_resolved":
    case "alerts.low_remaining_credit_balance_reached":
    case "alerts.low_remaining_credit_balance_resolved":
    case "alerts.usage_threshold_reached":
    case "alerts.usage_threshold_resolved":
    case "commit.archive":
    case "commit.segment.end":
    case "contract.archive":
    case "contract.create":
    case "credit.archive":
    case "credit.segment.end":
    case "invoice.billing_provider_error":
    case "invoice.finalized":
      break;

    // Editing a live contract (e.g. entitling a new seat type, changing
    // overrides or subscriptions) keeps it active — so no contract.start /
    // contract.end fires. The active-contract cache has no TTL and is only
    // invalidated on those lifecycle events, so without this it would serve
    // the pre-edit contract indefinitely (e.g. seats/plan and seat sync would
    // never see a newly-enabled free seat). Invalidate so the next read
    // refetches the edited contract.
    case "contract.edit": {
      await invalidateContractCache(workspace.sId);
      logger.info(
        {
          contractId: event.contract_id,
          customerId: event.customer_id,
          workspaceId: workspace.sId,
        },
        "[Metronome Webhook] contract.edit: invalidated active-contract cache"
      );
      break;
    }

    case "commit.create": {
      const { customer_id: metronomeCustomerId, commit_id: commitId } = event;
      const commitResult = await getMetronomeCommit({
        metronomeCustomerId,
        commitId,
      });
      if (commitResult.isErr()) {
        return new Err(
          new ProcessMetronomeWebhookError(
            "processing_failed",
            `Error fetching commit: ${commitResult.error.message}`
          )
        );
      }
      if (commitResult.value) {
        const stampResult = await stampCommitCreditType({
          workspaceId: workspace.sId,
          commit: commitResult.value,
          commitCustomFields: event.commit_custom_fields,
          eventType: "commit.create",
        });
        if (stampResult.isErr()) {
          return stampResult;
        }
      }
      break;
    }

    case "credit.create": {
      const { customer_id: metronomeCustomerId, credit_id: creditId } = event;
      logger.info(
        {
          customerId: metronomeCustomerId,
          contractId: event.contract_id,
          creditId,
          workspaceId: workspace.sId,
        },
        "[Metronome Webhook] credit.create: handler entered"
      );

      // Fetch the credit once: it drives both the stamp and the reconcile.
      const creditResult = await getMetronomeCredit({
        metronomeCustomerId,
        creditId,
      });
      if (creditResult.isErr()) {
        return new Err(
          new ProcessMetronomeWebhookError(
            "processing_failed",
            `Error fetching credit: ${creditResult.error.message}`
          )
        );
      }
      const credit = creditResult.value;

      // Non-AWU credits (programmatic USD, EUR seat credits, etc.) feed neither
      // the pool nor per-user seat states — opt out.
      if (
        !credit ||
        credit.access_schedule?.credit_type?.id !== getCreditTypeAwuId()
      ) {
        break;
      }

      // A new AWU credit changes free-seat per-user balances — drop the cached
      // read so the members/usage views reflect the grant on their next load.
      await invalidateCachedCustomerPerUserCreditBalances({
        metronomeCustomerId,
        contractCreditType: CONTRACT_CREDIT_TYPE_FREE_SEAT,
      });

      // A credit granted at contract-switch time (see `stepContractEdits`) is
      // added to the already-active contract *after* `contract.start` fired, so
      // that handler's reconcile ran before the credit existed. Metronome only
      // fires `credit.create` — not `credit.segment.start` — for a segment that
      // is already active when the credit is created, so the segment reconcile
      // path would never re-run for it. Mirror the same split as
      // `credit.segment.start`, plus the pool stamp on the pool branch.
      if (isSeatAwuCredit(credit)) {
        // Per-seat (INDIVIDUAL) AWU credit → reconcile per-user credit states
        // (a new seat allocation lands each user in the right seat↔pool state).
        // The workspace-scoped reconcile workflow collapses concurrent
        // launches, so onboarding many seats triggers one run. Not stamped and
        // no pool reconcile: seat credits never count toward the pool balance.
        await launchReconcileWorkspaceUserCreditStatesWorkflow({
          workspaceId: workspace.sId,
        });
        logger.info(
          { metronomeCustomerId, creditId, workspaceId: workspace.sId },
          "[Metronome Webhook] credit.create: seat credit created, user state reconcile triggered"
        );
      } else {
        // Pool AWU credit (e.g. the recurring free credit) → stamp, then
        // reconcile the workspace pool credit state (which would otherwise stay
        // stuck, e.g. `depleted`). Stamp first: the pool balance is read with an
        // `onlyPoolCredits` filter (see `getNetBalance`), so an unstamped credit
        // is invisible to the reconcile.
        const stampResult = await stampContractCreditType({
          workspaceId: workspace.sId,
          credit,
          eventType: "credit.create",
        });
        if (stampResult.isErr()) {
          return stampResult;
        }

        await reconcilePoolStateFromSegmentEvent({
          workspace,
          metronomeCustomerId,
          commitOrCredit: credit,
        });
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
          {
            workspaceId: workspace.sId,
            customerId,
            contractId,
            invoiceId,
            paymentStatus,
          },
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
        // Resolve a subscription activation if one is pending on this contract.
        await handleSubscriptionActivationSuccess({
          workspace,
          contractId,
          invoiceId,
        });
      } else if (paymentStatus === "failed") {
        logger.warn(
          {
            workspaceId: workspace.sId,
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
        await handleSubscriptionActivationFailure({
          workspace,
          contractId,
          invoiceId: invoiceId || undefined,
          errorMessage: errorMessage ?? "Payment failed",
        });
      } else {
        // Non-terminal `payment_status` values — log and leave the attempt
        // pending; the terminal "paid" / "failed" event will follow.
        logger.info(
          {
            workspaceId: workspace.sId,
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
      const { customer_id: metronomeCustomerId, commit_id: commitId } = event;

      const commitResult = await getMetronomeCommit({
        metronomeCustomerId,
        commitId,
      });
      if (commitResult.isErr()) {
        return new Err(
          new ProcessMetronomeWebhookError(
            "processing_failed",
            `Error fetching commit: ${commitResult.error.message}`
          )
        );
      }
      if (commitResult.value) {
        await reconcilePoolStateFromSegmentEvent({
          workspace,
          metronomeCustomerId,
          commitOrCredit: commitResult.value,
        });
        const stampResult = await stampCommitCreditType({
          workspaceId: workspace.sId,
          commit: commitResult.value,
          commitCustomFields: event.commit_custom_fields,
          eventType: event.type,
        });
        if (stampResult.isErr()) {
          return stampResult;
        }
      }
      break;
    }

    case "credit.segment.start":
    case "credit.edit": {
      const { customer_id: metronomeCustomerId, credit_id: creditId } = event;

      const creditResult = await getMetronomeCredit({
        metronomeCustomerId,
        creditId,
      });
      if (creditResult.isErr()) {
        return new Err(
          new ProcessMetronomeWebhookError(
            "processing_failed",
            `Error fetching credit: ${creditResult.error.message}`
          )
        );
      }
      const credit = creditResult.value;

      // Non-AWU credits (programmatic USD, EUR seat credits, etc.) feed neither
      // the pool nor per-user seat states — opt out.
      if (
        !credit ||
        credit.access_schedule?.credit_type?.id !== getCreditTypeAwuId()
      ) {
        break;
      }

      // A segment start / amount edit changes free-seat per-user balances — drop
      // the cached read so the members/usage views reflect it on their next load.
      await invalidateCachedCustomerPerUserCreditBalances({
        metronomeCustomerId,
        contractCreditType: CONTRACT_CREDIT_TYPE_FREE_SEAT,
      });

      if (isSeatAwuCredit(credit)) {
        // Per-seat (INDIVIDUAL) AWU credit: a seat segment starting (a seat
        // type activated, e.g. a planned Pro→Max downgrade) or an amount edit
        // both shift per-user balances, so reconcile per-user credit states.
        // The reconcile is workspace-scoped and idempotent. No pool reconcile:
        // seat credits never count toward the pool balance.
        await launchReconcileWorkspaceUserCreditStatesWorkflow({
          workspaceId: workspace.sId,
        });
        logger.info(
          {
            metronomeCustomerId,
            creditId,
            workspaceId: workspace.sId,
            eventType: event.type,
          },
          "[Metronome Webhook] seat credit event: user state reconcile triggered"
        );
      } else {
        // Pool AWU credit: reconcile the workspace pool credit state.
        await reconcilePoolStateFromSegmentEvent({
          workspace,
          metronomeCustomerId,
          commitOrCredit: credit,
        });
      }

      // The free monthly/yearly credit grant is now driven by the Stripe
      // `customer.subscription.updated` webhook (see
      // `grantFreeCreditsForSubscription`), which creates the DB credit and
      // syncs the amount back into Metronome. We no longer grant it here.
      break;
    }

    case "contract.start": {
      const { contract_id: contractId, customer_id: customerId } = event;
      return applyContractStartSubscriptionSwap({
        workspace,
        contractId,
        customerId,
      });
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
        { eventType: event.type, workspaceId: workspace.sId },
        "[Metronome Webhook] Unhandled event type"
      );
      break;
  }

  return new Ok(undefined);
}
