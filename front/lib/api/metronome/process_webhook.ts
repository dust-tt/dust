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
  dispatchPerUserCapReached,
  dispatchPerUserCapResolved,
  dispatchPoolExhausted,
  dispatchProgrammaticCapReached,
  dispatchProgrammaticCapReset,
  dispatchProgrammaticLowBalance,
  dispatchProgrammaticWarning,
  dispatchSeatBalanceExhausted,
  dispatchSeatBalanceResolved,
  syncPoolCreditStateFromBalance,
} from "@app/lib/api/metronome/credit_state_dispatcher";
import { reconcileWorkspaceUserCreditStates } from "@app/lib/api/metronome/reconcile_credit_state";
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
import { resolvePerUserCreditAlertUserId } from "@app/lib/metronome/alerts/per_user_credit_balance";
import {
  CRITICAL_BALANCE_OFFSET,
  LOW_BALANCE_OFFSET,
  PROGRAMMATIC_CAP_ALERT_NAME,
  PROGRAMMATIC_CRITICAL_BALANCE_ALERT_NAME,
  PROGRAMMATIC_LOW_BALANCE_ALERT_NAME,
  PROGRAMMATIC_WARNING_BALANCE_ALERT_NAME,
} from "@app/lib/metronome/alerts/programmatic_cap";
import {
  getMetronomeDefaultUserCapAlertForSeatType,
  getMetronomeDefaultUserWarningAlertForSeatType,
  getMetronomePerUserCap,
  getMetronomePerUserWarningAlert,
} from "@app/lib/metronome/alerts/spend_limits";
import { emitSubscriptionChangedAuditEvent } from "@app/lib/metronome/audit";
import {
  getMetronomeCommit,
  getMetronomeContractById,
  getMetronomeCredit,
  listMetronomeContracts,
  setMetronomeCommitCustomFields,
  setMetronomeContractCreditCustomFields,
  updateMetronomeCreditSegmentAmount,
} from "@app/lib/metronome/client";
import {
  CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY,
  CONTRACT_CREDIT_TYPE_EXCESS,
  CONTRACT_CREDIT_TYPE_POOL,
  getCreditTypeAwuId,
  getProductExcessCreditsId,
  PAYMENT_GATE_TYPE_CUSTOM_FIELD_KEY,
  PAYMENT_GATE_TYPE_SUBSCRIPTION_ACTIVATION,
  PLAN_CODE_CUSTOM_FIELD_KEY,
  USAGE_TYPE_GROUP_KEY,
  USAGE_TYPE_PROGRAMMATIC,
} from "@app/lib/metronome/constants";
import { invalidateContractCache } from "@app/lib/metronome/plan_type";
import type { ProgrammaticCreditEvent } from "@app/lib/metronome/programmatic_credit_state_machine";
import { carryOverContractBalancesOnRenewal } from "@app/lib/metronome/renewal_carry_over";
import { isMetronomeFreeCredit } from "@app/lib/metronome/types";
import { setUserNearLimit } from "@app/lib/metronome/user_block";
import type { MetronomeWebhookEvent } from "@app/lib/metronome/webhook_events";
import { PlanModel } from "@app/lib/models/plan";
import { notifyUserAwuCapReached } from "@app/lib/notifications/workflows/user-awu-cap-reached";
import { isFreePlan } from "@app/lib/plans/plan_codes";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { launchReconcileWorkspaceUserCreditStatesWorkflow } from "@app/temporal/metronome_events_queue/client";
import { launchScheduleWorkspaceScrubWorkflow } from "@app/temporal/scrub_workspace/client";
import { normalizeToPoolLimitSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Commit, Credit } from "@metronome/sdk/resources";

// Programmatic cap alerts share the AWU credit type with PAYG cap alerts;
// the `usage_type=programmatic` group filter is what distinguishes them.
function isProgrammaticMonthlyCap(
  event: Extract<
    MetronomeWebhookEvent,
    {
      type:
        | "alerts.spend_threshold_reached"
        | "alerts.spend_threshold_resolved";
    }
  >
): boolean {
  if (event.properties.credit_type_id !== getCreditTypeAwuId()) {
    return false;
  }
  return (
    event.properties.group_values?.some(
      (g) =>
        g.key === USAGE_TYPE_GROUP_KEY && g.value === USAGE_TYPE_PROGRAMMATIC
    ) ?? false
  );
}

// Map a programmatic cap alert name to the state-machine event it should
// dispatch. Returns null when the alert name doesn't match any of the three
// FSM-driving programmatic alerts (the warning alert is handled separately
// since it does not drive the state machine).
function programmaticEventFromAlertName(
  alertName: string
): ProgrammaticCreditEvent | null {
  if (alertName.startsWith(PROGRAMMATIC_CAP_ALERT_NAME)) {
    return { type: "programmatic_cap_reached" };
  }
  if (alertName.startsWith(PROGRAMMATIC_CRITICAL_BALANCE_ALERT_NAME)) {
    return {
      type: "programmatic_low_balance",
      remainingCredits: CRITICAL_BALANCE_OFFSET,
    };
  }
  if (alertName.startsWith(PROGRAMMATIC_LOW_BALANCE_ALERT_NAME)) {
    return {
      type: "programmatic_low_balance",
      remainingCredits: LOW_BALANCE_OFFSET,
    };
  }
  return null;
}

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
  workspaceId,
  customerId,
  contractId,
  creditId,
  creditCustomFields,
  eventType,
}: {
  workspaceId: string;
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
        {
          workspaceId,
          customerId,
          contractId,
          creditId,
          error: contractResult.error,
        },
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
        { workspaceId, customerId, contractId, creditId },
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

    // Per-user free-seat credits are stamped "free_seat" at creation (see
    // `addPerUserCreditToContract`), so they hit the already-stamped early
    // return above and are never re-stamped "pool" here.

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
    { workspaceId, customerId, contractId, creditId, value, eventType },
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

// Reconcile the workspace pool credit state from a commit/credit segment or
// edit webhook event. Shared by `commit.segment.start`, `commit.edit`,
// `credit.edit`, and `credit.segment.start`.
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

  if (creditTypeId === getCreditTypeAwuId()) {
    await syncPoolCreditStateFromBalance({
      workspace,
      metronomeCustomerId,
    });
  }
}

// Handle the managed free monthly/yearly credit grant for a contract-bound
// `credit.segment.start` event. The webhook payload doesn't carry the credit's
// product or recurring-credit definition, so we fetch the contract to identify
// whether the segment belongs to the free credit we manage. When it does,
// Metronome is the source of truth: we update the segment amount there, then
// ensure the matching DB credit (linked by metronomeCreditId) exists. Segments
// that aren't the managed free credit are ignored.
async function handleFreeCreditSegmentGrant({
  workspace,
  metronomeCustomerId,
  contractId,
  creditId,
  segmentId,
}: {
  workspace: WorkspaceResource;
  metronomeCustomerId: string;
  contractId: string;
  creditId: string;
  segmentId: string;
}): Promise<Result<void, ProcessMetronomeWebhookError>> {
  const contractResult = await getMetronomeContractById({
    metronomeCustomerId,
    metronomeContractId: contractId,
  });
  if (contractResult.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        metronomeCustomerId,
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

  const credit = contractResult.value.credits?.find((c) => c.id === creditId);
  if (!credit) {
    logger.info(
      { workspaceId: workspace.sId, metronomeCustomerId, contractId, creditId },
      "[Metronome Webhook] credit.segment.start: credit not found on contract, ignoring"
    );
    return new Ok(undefined);
  }

  if (!isMetronomeFreeCredit(credit)) {
    logger.info(
      {
        workspaceId: workspace.sId,
        metronomeCustomerId,
        creditId,
        productId: credit.product.id,
        creditTypeId: credit.access_schedule?.credit_type?.id,
      },
      "[Metronome Webhook] credit.segment.start: ignoring non-free-credit segment"
    );
    return new Ok(undefined);
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
  if (programmaticConfig && programmaticConfig.freeCreditMicroUsd !== null) {
    amountMicroUsd = programmaticConfig.freeCreditMicroUsd;
  } else {
    userCount = await countEligibleUsersForFreeCredits(workspace);
    const monthlyAmountMicroUsd = calculateFreeCreditAmountMicroUsd(userCount);
    amountMicroUsd = isAnnual
      ? monthlyAmountMicroUsd * YEARLY_MULTIPLIER
      : monthlyAmountMicroUsd;
  }
  const amount = amountMicroUsd / 1_000_000;

  const updateResult = await updateMetronomeCreditSegmentAmount({
    metronomeCustomerId,
    contractId,
    creditId,
    segmentId,
    amount,
  });

  if (updateResult.isErr()) {
    logger.error(
      {
        metronomeCustomerId,
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
        metronomeCustomerId,
        contractId,
        creditId,
        segmentId,
        workspaceId: workspace.sId,
      },
      "[Metronome Webhook] credit.segment.start: segment not found in access_schedule, skipping DB credit creation"
    );
    return new Ok(undefined);
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
        metronomeCustomerId,
        contractId,
        creditId,
        segmentId,
        error: grantResult.error,
        workspaceId: workspace.sId,
      },
      "[Metronome Webhook] credit.segment.start: failed to ensure DB credit"
    );
    return new Ok(undefined);
  }

  logger.info(
    {
      metronomeCustomerId,
      contractId,
      creditId,
      segmentId,
      amountMicroUsd,
      userCount,
      isAnnual,
      usedProgrammaticOverride: programmaticConfig?.freeCreditMicroUsd != null,
      dbCreditId: grantResult.value.credit.id,
      dbCreditCreated: grantResult.value.created,
      dbCreditAlreadyExisted: grantResult.value.alreadyExisted,
      periodStart,
      periodEnd,
      workspaceId: workspace.sId,
    },
    "[Metronome Webhook] credit.segment.start: free credit amount updated and DB credit ensured"
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

/**
 * Resolve the effective per-user spend-cap state by re-deriving from
 * Metronome on every event, then dispatch to the local credit-state machine.
 *
 * Override-replaces-default: if a per-user override exists, its evaluation
 * state wins regardless of the default. Otherwise the workspace-wide
 * default's state is used. With neither configured, the user is uncapped
 * (defensive — no alert should be firing in that case).
 *
 * The dispatch is idempotent: `setUserSpendLimit` and
 * `setDefaultUserSpendLimit` (PR B) recompute and dispatch eagerly, so the
 * webhook arriving later either re-confirms the state or skips (when
 * Metronome is still in `evaluating`).
 */
type UserSpendAlerts = {
  capAlertId: string | null;
  warningAlertId: string | null;
  capThreshold: number;
  source: "override" | "default" | "none";
};

/**
 * Resolve the Metronome alert IDs that govern this user's spend cap.
 *
 * Priority: per-user override > per-seat-type default > none.
 */
async function resolveUserSpendAlerts({
  metronomeCustomerId,
  workspaceId,
  workspace,
  userId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  workspace: WorkspaceResource;
  userId: string;
}): Promise<Result<UserSpendAlerts, ProcessMetronomeWebhookError>> {
  // Check for a per-user override first.
  const userCapResult = await getMetronomePerUserCap({
    metronomeCustomerId,
    workspaceId,
    userId,
  });
  if (userCapResult.isErr()) {
    return new Err(
      new ProcessMetronomeWebhookError(
        "processing_failed",
        `Error reading per-user cap override: ${userCapResult.error.message}`
      )
    );
  }

  if (userCapResult.value) {
    const userWarningResult = await getMetronomePerUserWarningAlert({
      metronomeCustomerId,
      workspaceId,
      userId,
    });
    return new Ok({
      capAlertId: userCapResult.value.alert.id,
      capThreshold: userCapResult.value.alert.threshold,
      warningAlertId: userWarningResult.isOk()
        ? (userWarningResult.value?.alert.id ?? null)
        : null,
      source: "override",
    });
  }

  // No override — resolve user's seat type and find the matching default.
  const user = await UserResource.fetchById(userId);
  const lightWorkspace = renderLightWorkspaceType({ workspace });
  const membership = user
    ? await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace: lightWorkspace,
      })
    : null;
  const normalizedSeatType = normalizeToPoolLimitSeatType(membership?.seatType);

  if (!normalizedSeatType) {
    return new Ok({
      capAlertId: null,
      warningAlertId: null,
      capThreshold: 0,
      source: "none",
    });
  }

  const [defaultCapResult, defaultWarningResult] = await Promise.all([
    getMetronomeDefaultUserCapAlertForSeatType({
      metronomeCustomerId,
      workspaceId,
      seatType: normalizedSeatType,
    }),
    getMetronomeDefaultUserWarningAlertForSeatType({
      metronomeCustomerId,
      workspaceId,
      seatType: normalizedSeatType,
    }),
  ]);
  if (defaultCapResult.isErr()) {
    return new Err(
      new ProcessMetronomeWebhookError(
        "processing_failed",
        `Error reading default user cap for seat type ${normalizedSeatType}: ${defaultCapResult.error.message}`
      )
    );
  }

  if (!defaultCapResult.value) {
    return new Ok({
      capAlertId: null,
      warningAlertId: null,
      capThreshold: 0,
      source: "none",
    });
  }

  return new Ok({
    capAlertId: defaultCapResult.value.alert.id,
    capThreshold: defaultCapResult.value.alert.threshold,
    warningAlertId: defaultWarningResult.isOk()
      ? (defaultWarningResult.value?.alert.id ?? null)
      : null,
    source: "default",
  });
}

type SpendThresholdEvent = Extract<
  MetronomeWebhookEvent,
  {
    type: "alerts.spend_threshold_reached" | "alerts.spend_threshold_resolved";
  }
>;

async function handlePerUserSpendThresholdEvent({
  workspace,
  userId,
  event,
}: {
  workspace: WorkspaceResource;
  userId: string;
  event: SpendThresholdEvent;
}): Promise<Result<undefined, ProcessMetronomeWebhookError>> {
  const metronomeCustomerId = workspace.metronomeCustomerId;
  if (!metronomeCustomerId) {
    logger.warn(
      { eventId: event.id, eventType: event.type, workspaceId: workspace.sId },
      "[Metronome Webhook] per-user spend threshold event for workspace without metronomeCustomerId, skipping"
    );
    return new Ok(undefined);
  }

  const alertsResult = await resolveUserSpendAlerts({
    metronomeCustomerId,
    workspaceId: workspace.sId,
    workspace,
    userId,
  });
  if (alertsResult.isErr()) {
    return alertsResult;
  }

  const { capAlertId, warningAlertId, capThreshold, source } =
    alertsResult.value;
  const eventAlertId = event.properties.alert_id;
  const isReached = event.type === "alerts.spend_threshold_reached";

  if (eventAlertId === capAlertId) {
    // Cap alert fired for this user.
    if (isReached) {
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
            source,
            err: dispatchResult.error,
          },
          "[Metronome Webhook] per-user spend threshold: dispatchPerUserCapReached failed"
        );
        return new Err(
          new ProcessMetronomeWebhookError(
            "processing_failed",
            `Error dispatching per-user cap reached: ${dispatchResult.error.message}`
          )
        );
      }
      // Notify the user (email + in-app) that they are now hard-blocked.
      const user = await UserResource.fetchById(userId);
      if (user) {
        const lightWorkspace = renderLightWorkspaceType({ workspace });
        notifyUserAwuCapReached({
          userSId: user.sId,
          userEmail: user.email,
          userFirstName: user.firstName,
          userLastName: user.lastName,
          workspaceId: workspace.sId,
          workspaceName: lightWorkspace.name,
          capAwuCredits: capThreshold,
          isBlocked: true,
        });
      }
    } else {
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
            source,
            err: dispatchResult.error,
          },
          "[Metronome Webhook] per-user spend threshold: dispatchPerUserCapResolved failed"
        );
        return new Err(
          new ProcessMetronomeWebhookError(
            "processing_failed",
            `Error dispatching per-user cap resolved: ${dispatchResult.error.message}`
          )
        );
      }
    }
  } else if (eventAlertId === warningAlertId) {
    if (isReached) {
      // Warning alert (80%) fired — set near-limit flag and notify, don't block.
      void setUserNearLimit(workspace.sId, userId, true);
      const user = await UserResource.fetchById(userId);
      if (user) {
        const lightWorkspace = renderLightWorkspaceType({ workspace });
        notifyUserAwuCapReached({
          userSId: user.sId,
          userEmail: user.email,
          userFirstName: user.firstName,
          userLastName: user.lastName,
          workspaceId: workspace.sId,
          workspaceName: lightWorkspace.name,
          capAwuCredits: capThreshold,
          isBlocked: false,
        });
      }
    } else {
      // Warning alert resolved (cap raised/removed) — clear near-limit flag.
      void setUserNearLimit(workspace.sId, userId, false);
    }
  } else {
    // Event is from an unrelated alert (e.g. a different seat type) — ignore.
    logger.info(
      {
        eventId: event.id,
        eventType: event.type,
        workspaceId: workspace.sId,
        userId,
        eventAlertId,
        source,
      },
      "[Metronome Webhook] per-user spend threshold: event does not match user's alerts, ignoring"
    );
  }

  return new Ok(undefined);
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
        const handleResult = await handlePerUserSpendThresholdEvent({
          workspace,
          userId,
          event,
        });
        if (handleResult.isErr()) {
          return handleResult;
        }
      } else if (isProgrammaticMonthlyCap(event)) {
        // Programmatic monthly cap alerts. Three alerts exist per workspace
        // with distinct names; route to the matching dispatcher.
        //
        // The warning alert (80% of cap) is informational only — it does not
        // drive the credit state machine, so it's handled separately from the
        // three FSM-driving alerts (cap reached / low / critical).
        const alertName = event.properties.alert_name ?? "";
        if (alertName.startsWith(PROGRAMMATIC_WARNING_BALANCE_ALERT_NAME)) {
          await dispatchProgrammaticWarning({ workspace, eventId: event.id });
        } else {
          const programmaticEvent = programmaticEventFromAlertName(alertName);
          if (programmaticEvent) {
            switch (programmaticEvent.type) {
              case "programmatic_cap_reached":
                await dispatchProgrammaticCapReached({
                  workspace,
                  eventId: event.id,
                });
                break;
              case "programmatic_low_balance":
                await dispatchProgrammaticLowBalance({
                  workspace,
                  remainingCredits: programmaticEvent.remainingCredits,
                });
                break;
              case "programmatic_cap_reset":
                // never happens in spend_threshold_reached
                // dispatch below by spend_threshold_resolved case
                break;
              default:
                assertNever(programmaticEvent);
            }
          }
        }
        logger.info(
          {
            eventId: event.id,
            workspaceId: workspace.sId,
            alertName,
            currentSpend: event.properties.current_spend,
          },
          "[Metronome Webhook] spend_threshold_reached: programmatic alert dispatched"
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
      // Metronome fires this for every previously-capped user — we re-derive
      // the effective state (override > default > uncapped) and dispatch.
      //
      // Workspace-level: a `payg_cap_resolved` event means spend dropped
      // back below the PAYG threshold. We do not transition on this signal:
      // once the workspace is `depleted`, only a real pool replenishment
      // (commit.segment.start) brings it back.
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
        const handleResult = await handlePerUserSpendThresholdEvent({
          workspace,
          userId,
          event,
        });
        if (handleResult.isErr()) {
          return handleResult;
        }
      } else if (isProgrammaticMonthlyCap(event)) {
        await dispatchProgrammaticCapReset({ workspace });
        logger.info(
          { eventId: event.id, workspaceId: workspace.sId },
          "[Metronome Webhook] spend_threshold_resolved: programmatic cap reset dispatched"
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
      const userId = await resolvePerUserCreditAlertUserId({
        metronomeCustomerId: event.properties.customer_id,
        alertId,
      });
      if (!userId || threshold === null || threshold === undefined) {
        break;
      }
      if (threshold === 0) {
        await dispatchSeatBalanceExhausted({ workspace, userId });
        logger.info(
          { eventId: event.id, workspaceId: workspace.sId, userId },
          "[Metronome Webhook] low_remaining_contract_credit_balance_reached: per-user credit exhausted dispatched"
        );
      } else {
        void setUserNearLimit(workspace.sId, userId, true);
        logger.info(
          {
            eventId: event.id,
            workspaceId: workspace.sId,
            userId,
          },
          "[Metronome Webhook] low_remaining_contract_credit_balance_reached: free seat near-limit flag set"
        );
      }
      break;
    }
    case "alerts.low_remaining_contract_credit_balance_resolved": {
      const userId = await resolvePerUserCreditAlertUserId({
        metronomeCustomerId: event.properties.customer_id,
        alertId: event.properties.alert_id,
      });
      if (!userId) {
        break;
      }
      void setUserNearLimit(workspace.sId, userId, false);
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
        workspaceId: workspace.sId,
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
      const {
        customer_id: metronomeCustomerId,
        contract_id: contractId,
        credit_id: creditId,
      } = event;

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
      if (creditResult.value) {
        await reconcilePoolStateFromSegmentEvent({
          workspace,
          metronomeCustomerId,
          commitOrCredit: creditResult.value,
        });

        // A new seat segment starting means a seat type was activated (e.g.
        // a planned Pro→Max downgrade takes effect). Re-sync the seat count so
        // the per-user allocation is reassigned and each user's credit state
        // reflects the new seat type.
        if (
          event.type === "credit.segment.start" &&
          isSeatAwuCredit(creditResult.value)
        ) {
          await launchReconcileWorkspaceUserCreditStatesWorkflow({
            workspaceId: workspace.sId,
          });
          logger.info(
            { metronomeCustomerId, creditId, workspaceId: workspace.sId },
            "[Metronome Webhook] credit.segment.start: seat credit activated, reconcile triggered"
          );
        }
      }

      if (event.type === "credit.segment.start") {
        // Special case: only a contract-bound managed free credit drives the
        // free monthly/yearly credit grant. Customer-level credits with no
        // parent contract can't be the managed free credit, so stop here.
        if (!contractId) {
          break;
        }

        const grantResult = await handleFreeCreditSegmentGrant({
          workspace,
          metronomeCustomerId,
          contractId,
          creditId,
          segmentId: event.segment_id,
        });
        if (grantResult.isErr()) {
          return grantResult;
        }
      }
      break;
    }

    case "contract.start": {
      const { contract_id: contractId, customer_id: customerId } = event;

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
      // time (`syncContractQuantities` → `syncSeatCount`), but that path does
      // not touch per-user credit states; now that the contract is active the
      // balances are live, so this lands each user in the right seat↔pool
      // state. Without it, a switch that changes seat allocations (e.g. moving
      // onto a business plan) leaves users stuck in their previous state.
      // Mirrors the pool reconcile above; pass the new contract id directly
      // since the subscription swap below may not have happened yet.
      await reconcileWorkspaceUserCreditStates({
        workspace: renderLightWorkspaceType({ workspace }),
        metronomeCustomerId: customerId,
        metronomeContractId: contractId,
      });

      const targetPlanCode =
        contractResult.value.custom_fields?.[PLAN_CODE_CUSTOM_FIELD_KEY];
      if (!targetPlanCode) {
        logger.info(
          { contractId, workspaceId: workspace.sId },
          `[Metronome Webhook] contract.start: no ${PLAN_CODE_CUSTOM_FIELD_KEY} custom field, leaving subscription alone`
        );
        break;
      }

      // Payment-gated subscription activation: skip the automatic swap here.
      // The payment_gate.payment_status webhook handles the plan switch once
      // payment succeeds, ensuring the workspace stays on CP_FREE_PLAN until paid.
      const paymentGateType =
        contractResult.value.custom_fields?.[
          PAYMENT_GATE_TYPE_CUSTOM_FIELD_KEY
        ];
      if (paymentGateType === PAYMENT_GATE_TYPE_SUBSCRIPTION_ACTIVATION) {
        logger.info(
          { contractId, workspaceId: workspace.sId },
          "[Metronome Webhook] contract.start: payment-gated activation contract, skipping — payment_gate.payment_status will activate"
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
        const previousPlanCode = activeSubscription.getPlan().code;
        // `activatePending` flushes the contract cache itself.
        await pendingSubscription.activatePending();
        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );
        await restoreWorkspaceAfterSubscription(auth);
        await ensureWorkOSOrganizationForPaidPlan({
          workspace,
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
      emitSubscriptionChangedAuditEvent({
        auth,
        planCode: targetPlan.code,
        previousPlanCode: legacyPreviousPlanCode,
        metronomeContractId: contractId,
      });

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
        { eventType: event.type, workspaceId: workspace.sId },
        "[Metronome Webhook] Unhandled event type"
      );
      break;
  }

  return new Ok(undefined);
}
