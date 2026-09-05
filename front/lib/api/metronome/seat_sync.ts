import {
  reconcileUser,
  reconcileWorkspaceUserCreditStates,
} from "@app/lib/api/metronome/reconcile_credit_state";
import { syncDefaultPoolCapAlertsForWorkspace } from "@app/lib/api/workspace/default_user_spend_limit";
import { Authenticator } from "@app/lib/auth";
import { getMetronomeContractById } from "@app/lib/metronome/client";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { getProductSeatTypes } from "@app/lib/metronome/seat_types";
import type { SyncSeatCountSummary } from "@app/lib/metronome/seats";
import {
  hasContractSeatSubscription,
  moveSeatWithCreditCarry,
  remapMembershipSeatTypesForContract,
  syncSeatCount,
} from "@app/lib/metronome/seats";
import { isProPlanPrefix } from "@app/lib/plans/plan_codes";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { heartbeat } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Outcome of `syncMetronomeSeatCountForWorkspace`. `synced` means the
 * reconciliation ran; `skipped` means there was nothing to sync (not on
 * Metronome, no active contract, or no seat subscription) — with a
 * human-readable `reason`. `activeContractSummary` is `null` only when
 * nothing ran for the active contract (e.g. a pending contract was staged
 * but there's no active contract to sync yet).
 */
type SeatSyncOutcome =
  | {
      status: "synced";
      stagedPendingContract: boolean;
      activeContractSummary: SyncSeatCountSummary | null;
      workspaceUserCreditStatesReconciled: boolean;
    }
  | { status: "skipped"; reason: string };

/**
 * Resolve a workspace's active Metronome contract and reconcile its seat
 * subscriptions to the DB membership state — the same work the debounced
 * `syncMetronomeSeatCountActivity` performs, but callable directly (e.g. from
 * a poke plugin) to run the sync immediately, without the debounce.
 *
 * Lives in `lib/api/metronome` rather than `lib/metronome/seats` on purpose:
 * it depends on `SubscriptionResource`, and `subscription_resource` →
 * `metronome/contracts` → `metronome/seats` already forms a chain, so importing
 * the resource from `seats.ts` would close an import cycle. `lib/api/*` sits
 * above the resource layer, breaking it.
 *
 * Returns a domain `Result`: a Metronome failure from `syncSeatCount` is
 * propagated as `Err` rather than swallowed, so the caller can surface it.
 *
 * `reconcileUserId` scopes the post-sync credit-state reconcile to a single
 * user (e.g. an auto-upgrade unblocking one member mid-flow) and skips the
 * workspace-wide cap-alert sync. The seat-count push itself is always
 * workspace-wide. When omitted, the whole workspace is reconciled.
 *
 * `forceFreeCreditRevokeCheck` runs the ex-free-seat credit revoke check
 * unconditionally instead of only when the cheap gate signals a change (see
 * `syncSeatCount`). Set by the poke plugin, where an operator explicitly
 * asked for a thorough pass; left unset on the automatic/debounced path.
 */
export async function syncMetronomeSeatCountForWorkspace({
  workspace,
  reconcileUserId,
  forceFreeCreditRevokeCheck,
}: {
  workspace: LightWorkspaceType;
  reconcileUserId?: string;
  forceFreeCreditRevokeCheck?: boolean;
}): Promise<Result<SeatSyncOutcome, Error>> {
  const workspaceId = workspace.sId;
  if (!workspace.metronomeCustomerId) {
    return new Ok({
      status: "skipped",
      reason: "workspace is not provisioned on Metronome",
    });
  }

  const activeSubscription =
    await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);

  // When the workspace has a scheduled future contract switch (e.g. a
  // legacy→Business migration in its window), also stage the PENDING contract:
  // members added/changed mid-window must be seated on the contract that will
  // bill them once it starts. The seat invoice is cut at contract start, so
  // this is pre-provisioned now — the `contract.start` webhook would be too
  // late. Every membership change routes through this function, so the pending
  // contract stays correct across adds, revokes, and seat changes alike. This
  // is independent of, and in addition to, reconciling the active contract
  // below (whose seats a legacy shadow contract still bills / finalizes).
  const stagePendingStartedAt = Date.now();
  const stagedPending = await stagePendingContractSeats({
    workspace,
    currentPlanCode: activeSubscription?.getPlan().code ?? null,
  });
  logger.info(
    {
      workspaceId,
      stagedPending,
      durationMs: Date.now() - stagePendingStartedAt,
    },
    "[SeatSync] stagePendingContractSeats done"
  );
  await heartbeat();

  const activeContract = activeSubscription?.metronomeContractId
    ? await getActiveContract(workspace.sId)
    : null;

  if (
    !activeSubscription?.metronomeContractId ||
    !activeContract ||
    !(await hasContractSeatSubscription(activeContract))
  ) {
    if (stagedPending) {
      logger.info(
        { workspaceId },
        "[SeatSync] Done — only the pending contract was staged, no active contract to sync"
      );
      return new Ok({
        status: "synced",
        stagedPendingContract: true,
        activeContractSummary: null,
        workspaceUserCreditStatesReconciled: false,
      });
    }
    logger.info(
      { workspaceId },
      "[SeatSync] Skipped — no active or pending contract with a seat subscription to sync"
    );
    return new Ok({
      status: "skipped",
      reason: "no active or pending contract with a seat subscription to sync",
    });
  }

  const result = await syncSeatCount({
    metronomeCustomerId: workspace.metronomeCustomerId,
    contractId: activeSubscription.metronomeContractId,
    workspace,
    planCode: activeSubscription.getPlan().code,
    contract: activeContract,
    forceFreeCreditRevokeCheck,
  });
  if (result.isErr()) {
    logger.error(
      { workspaceId, err: result.error.message },
      "[SeatSync] syncSeatCount failed"
    );
    return new Err(result.error);
  }
  const activeContractSummary = result.value;
  await heartbeat();

  // Single-user scope: reconcile just this user from the live balances now that
  // their seat credits are assigned. Skips the whole-workspace reconcile and the
  // cap-alert sync below — the debounced workflow runs the full path as backstop.
  if (reconcileUserId) {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    if (workspaceResource) {
      const userReconcile = await reconcileUser({
        auth,
        workspace: workspaceResource,
        metronomeCustomerId: workspace.metronomeCustomerId,
        userId: reconcileUserId,
        execute: true,
      });
      if (userReconcile.isErr()) {
        logger.warn(
          {
            workspaceId,
            userId: reconcileUserId,
            err: userReconcile.error.message,
          },
          "[SeatSync] Single-user credit-state reconcile failed; continuing"
        );
      }
    }
    logger.info(
      { workspaceId, reconcileUserId },
      "[SeatSync] Done — single-user scope"
    );
    return new Ok({
      status: "synced",
      stagedPendingContract: stagedPending,
      activeContractSummary,
      workspaceUserCreditStatesReconciled: false,
    });
  }

  // Now that per-user seat credits are assigned, reconcile each seated user's
  // credit state from the live balances — this is what moves a freshly-created
  // or just-upgraded seat user into the correct seat↔pool state. Never throws;
  // a downstream reconcile issue must not fail (and retry) the seat sync.
  const reconcileStartedAt = Date.now();
  await reconcileWorkspaceUserCreditStates({
    workspace,
    metronomeCustomerId: workspace.metronomeCustomerId,
    metronomeContractId: activeSubscription.metronomeContractId,
    planCode: activeSubscription.getPlan().code,
  });
  logger.info(
    { workspaceId, durationMs: Date.now() - reconcileStartedAt },
    "[SeatSync] reconcileWorkspaceUserCreditStates done"
  );
  await heartbeat();

  // Ensure per-seat-type cap alerts exist with the current default pool limit.
  // Best-effort: a failure here must not fail the seat sync.
  const alertSyncStartedAt = Date.now();
  const alertSyncResult = await syncDefaultPoolCapAlertsForWorkspace(workspace);
  if (alertSyncResult.isErr()) {
    logger.warn(
      { workspaceId, err: alertSyncResult.error.message },
      "[SeatSync] Failed to sync default pool cap alerts; continuing"
    );
  } else {
    logger.info(
      { workspaceId, durationMs: Date.now() - alertSyncStartedAt },
      "[SeatSync] syncDefaultPoolCapAlertsForWorkspace done"
    );
  }

  logger.info(
    { workspaceId },
    "[SeatSync] syncMetronomeSeatCountForWorkspace done"
  );
  return new Ok({
    status: "synced",
    stagedPendingContract: stagedPending,
    activeContractSummary,
    workspaceUserCreditStatesReconciled: true,
  });
}

/**
 * Immediately assign (or move) a SINGLE user's seat in Metronome, plus reconcile
 * that one user's credit state — nothing else.
 *
 * This is the only seat write allowed outside the debounced Temporal workflow.
 * It touches just this user's `seat_id` (and their per-user credit); it never
 * writes the unassigned pool, other users, alerts, or credit transfers. That
 * narrow scope is what makes it safe to run concurrently with the workflow's
 * full reconcile — unlike a full `syncMetronomeSeatCountForWorkspace`, which
 * must be serialized: two full reconciles in parallel stack open-ended
 * unassigned-seat deltas (the seat-sync rate-limit incident). Callers that need
 * to unblock a just-upgraded user should call this AND launch the debounced
 * workflow as the workspace-wide backstop (unassigned floor, other members,
 * alerts, transfers).
 *
 * Best-effort and idempotent: `add_seat_ids` of an already-assigned seat is a
 * no-op, and the credit state is reconciled from live balances. A missing
 * contract or a target seat type with no billable subscription is skipped (the
 * workflow reconciles it). Downgrades to a non-billable seat type only reconcile
 * credit state here; the seat removal is left to the workflow (access is
 * DB-gated, so billing removal is not latency-sensitive).
 */
export async function assignSeatForUser({
  workspace,
  userId,
  seatType,
  previousSeatType,
}: {
  workspace: LightWorkspaceType;
  userId: string;
  seatType: MembershipSeatType;
  previousSeatType?: MembershipSeatType;
}): Promise<Result<undefined, Error>> {
  const workspaceId = workspace.sId;
  if (!workspace.metronomeCustomerId) {
    return new Ok(undefined);
  }

  const activeSubscription =
    await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
  if (!activeSubscription?.metronomeContractId) {
    return new Ok(undefined);
  }
  const contractId = activeSubscription.metronomeContractId;

  const contract = await getActiveContract(workspaceId);
  if (!contract) {
    return new Ok(undefined);
  }
  const productSeatTypes = await getProductSeatTypes();

  // Move (or add) just this user's seat, carrying seat-credit consumption across
  // a recurring-credit change (pro↔max: empty the old credit, carry consumed AWU
  // onto the new one). Scoped to this one user — never the unassigned pool or
  // other members — so it's safe to run alongside the debounced workflow, which
  // still owns the workspace-wide reconcile. The carry has to happen here (not
  // only in the later workflow sync) because we move the seat immediately, which
  // would otherwise hide the seat-type change from the workflow.
  const moveResult = await moveSeatWithCreditCarry({
    metronomeCustomerId: workspace.metronomeCustomerId,
    contractId,
    contract,
    productSeatTypes,
    workspaceId,
    userId,
    fromSeatType: previousSeatType,
    toSeatType: seatType,
  });
  if (moveResult.isErr()) {
    logger.warn(
      { workspaceId, userId, seatType, err: moveResult.error.message },
      "[SeatSync] Immediate single-seat assignment failed; debounced workflow will reconcile"
    );
    return new Err(moveResult.error);
  }

  // Reconcile just this user's credit state from live balances so they land in
  // the correct seat↔pool state immediately. Never fails the assignment.
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspaceResource = await WorkspaceResource.fetchById(workspaceId);
  if (workspaceResource) {
    const userReconcile = await reconcileUser({
      auth,
      workspace: workspaceResource,
      metronomeCustomerId: workspace.metronomeCustomerId,
      userId,
      execute: true,
    });
    if (userReconcile.isErr()) {
      logger.warn(
        { workspaceId, userId, err: userReconcile.error.message },
        "[SeatSync] Single-user credit-state reconcile failed; continuing"
      );
    }
  }

  logger.info(
    { workspaceId, userId, seatType },
    "[SeatSync] assignSeatForUser done"
  );
  return new Ok(undefined);
}

/**
 * Stage the workspace's PENDING (created_backend_only) contract, if any, so a
 * scheduled future switch has correct seats before it starts.
 *
 * Schedules a future-dated seat change per member onto the pending contract
 * (`remapMembershipSeatTypesForContract` with `swapAt: "next-hour"`), then
 * pre-provisions the seat counts (`syncSeatCount` with the pending start).
 * A legacy Pro plan only carries `workspace`/`none` seats, which Business
 * doesn't bill, so — ONLY when the workspace is currently on a legacy Pro plan
 * (mid legacy→Business migration) — seat-less members are force-promoted to
 * `pro` (the migration's target seat). Any other pending contract switch (a
 * manual Enterprise/Business switch, etc.) falls through to the ordinary
 * committed-spare-seat promotion instead — forcing `pro` there would put
 * members on a seat type their new contract may not even entitle.
 *
 * Skips the live-balance credit reconcile: the contract isn't active yet, so
 * that runs at `contract.start` (and on the next sync once it is active).
 * Best-effort — a failure is logged and the next membership change re-runs it.
 *
 * Returns whether the pending contract was staged.
 */
async function stagePendingContractSeats({
  workspace,
  currentPlanCode,
}: {
  workspace: LightWorkspaceType;
  currentPlanCode: string | null;
}): Promise<boolean> {
  const workspaceId = workspace.sId;
  if (!workspace.metronomeCustomerId) {
    return false;
  }
  const pendingSubscription =
    await SubscriptionResource.fetchPendingByWorkspaceModelId(workspace.id);
  if (!pendingSubscription?.metronomeContractId) {
    return false;
  }
  const pendingContractResult = await getMetronomeContractById({
    metronomeCustomerId: workspace.metronomeCustomerId,
    metronomeContractId: pendingSubscription.metronomeContractId,
  });
  if (
    pendingContractResult.isErr() ||
    !(await hasContractSeatSubscription(pendingContractResult.value))
  ) {
    return false;
  }
  const pendingContract = pendingContractResult.value;

  // Schedule each member's future-dated seat change onto the pending contract.
  // `promoteNoneSeatType: "pro"` maps legacy `workspace`/`none` members onto
  // Business's `pro` seat (Business has no committed seats, so they'd otherwise
  // stay `none`) — but only when this workspace is actually mid legacy Pro →
  // Business migration. Any other pending switch omits it, so seat-less
  // members fall through to the ordinary committed-spare-seat promotion.
  const promoteNoneSeatType =
    currentPlanCode && isProPlanPrefix(currentPlanCode) ? "pro" : undefined;
  const remapStartedAt = Date.now();
  const remapResult = await remapMembershipSeatTypesForContract({
    metronomeCustomerId: workspace.metronomeCustomerId,
    contractId: pendingSubscription.metronomeContractId,
    workspace,
    swapAt: "next-hour",
    startingAt: new Date(pendingContract.starting_at),
    contract: pendingContract,
    promoteNoneSeatType,
  });
  logger.info(
    {
      workspaceId,
      isErr: remapResult.isErr(),
      durationMs: Date.now() - remapStartedAt,
    },
    "[SeatSync] remapMembershipSeatTypesForContract done"
  );
  await heartbeat();
  if (remapResult.isErr()) {
    logger.warn(
      { workspaceId, err: remapResult.error.message },
      "[SeatSync] Failed to remap seats onto pending contract; continuing"
    );
    return false;
  }

  const pendingSyncStartedAt = Date.now();
  const syncResult = await syncSeatCount({
    metronomeCustomerId: workspace.metronomeCustomerId,
    contractId: pendingSubscription.metronomeContractId,
    workspace,
    planCode: pendingSubscription.getPlan().code,
    contract: pendingContract,
    startingAt: pendingContract.starting_at,
  });
  logger.info(
    {
      workspaceId,
      isErr: syncResult.isErr(),
      durationMs: Date.now() - pendingSyncStartedAt,
    },
    "[SeatSync] Pending-contract syncSeatCount done"
  );
  if (syncResult.isErr()) {
    logger.warn(
      { workspaceId, err: syncResult.error.message },
      "[SeatSync] Failed to pre-provision pending contract seats; continuing"
    );
    return false;
  }

  return true;
}
