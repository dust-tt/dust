import {
  reconcileUser,
  reconcileWorkspaceUserCreditStates,
} from "@app/lib/api/metronome/reconcile_credit_state";
import { syncDefaultPoolCapAlertsForWorkspace } from "@app/lib/api/workspace/default_user_spend_limit";
import { Authenticator } from "@app/lib/auth";
import { getMetronomeContractById } from "@app/lib/metronome/client";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  hasContractSeatSubscription,
  remapMembershipSeatTypesForContract,
  syncSeatCount,
} from "@app/lib/metronome/seats";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Outcome of `syncMetronomeSeatCountForWorkspace`. `synced` means the
 * reconciliation ran; `skipped` means there was nothing to sync (not on
 * Metronome, no active contract, or no seat subscription) — with a
 * human-readable `reason`.
 */
export type SeatSyncOutcome =
  | { status: "synced" }
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
 */
export async function syncMetronomeSeatCountForWorkspace({
  workspace,
  reconcileUserId,
}: {
  workspace: LightWorkspaceType;
  reconcileUserId?: string;
}): Promise<Result<SeatSyncOutcome, Error>> {
  if (!workspace.metronomeCustomerId) {
    return new Ok({
      status: "skipped",
      reason: "workspace is not provisioned on Metronome",
    });
  }

  // When the workspace has a scheduled future contract switch (e.g. a
  // legacy→Business migration in its window), also stage the PENDING contract:
  // members added/changed mid-window must be seated on the contract that will
  // bill them once it starts. The seat invoice is cut at contract start, so
  // this is pre-provisioned now — the `contract.start` webhook would be too
  // late. Every membership change routes through this function, so the pending
  // contract stays correct across adds, revokes, and seat changes alike. This
  // is independent of, and in addition to, reconciling the active contract
  // below (whose seats a legacy shadow contract still bills / finalizes).
  const stagedPending = await stagePendingContractSeats(workspace);

  const activeSubscription =
    await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
  const activeContract = activeSubscription?.metronomeContractId
    ? await getActiveContract(workspace.sId)
    : null;

  if (
    !activeSubscription?.metronomeContractId ||
    !activeContract ||
    !(await hasContractSeatSubscription(activeContract))
  ) {
    return new Ok(
      stagedPending
        ? { status: "synced" }
        : {
            status: "skipped",
            reason:
              "no active or pending contract with a seat subscription to sync",
          }
    );
  }

  const result = await syncSeatCount({
    metronomeCustomerId: workspace.metronomeCustomerId,
    contractId: activeSubscription.metronomeContractId,
    workspace,
    planCode: activeSubscription.getPlan().code,
    contract: activeContract,
  });
  if (result.isErr()) {
    return new Err(result.error);
  }

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
            workspaceId: workspace.sId,
            userId: reconcileUserId,
            err: userReconcile.error.message,
          },
          "[SeatSync] Single-user credit-state reconcile failed; continuing"
        );
      }
    }
    return new Ok({ status: "synced" });
  }

  // Now that per-user seat credits are assigned, reconcile each seated user's
  // credit state from the live balances — this is what moves a freshly-created
  // or just-upgraded seat user into the correct seat↔pool state. Never throws;
  // a downstream reconcile issue must not fail (and retry) the seat sync.
  await reconcileWorkspaceUserCreditStates({
    workspace,
    metronomeCustomerId: workspace.metronomeCustomerId,
    metronomeContractId: activeSubscription.metronomeContractId,
    planCode: activeSubscription.getPlan().code,
  });

  // Ensure per-seat-type cap alerts exist with the current default pool limit.
  // Best-effort: a failure here must not fail the seat sync.
  const alertSyncResult = await syncDefaultPoolCapAlertsForWorkspace(workspace);
  if (alertSyncResult.isErr()) {
    logger.warn(
      { workspaceId: workspace.sId, err: alertSyncResult.error.message },
      "[SeatSync] Failed to sync default pool cap alerts; continuing"
    );
  }

  return new Ok({ status: "synced" });
}

/**
 * Stage the workspace's PENDING (created_backend_only) contract, if any, so a
 * scheduled future switch has correct seats before it starts.
 *
 * Schedules a future-dated seat change per member onto the pending contract
 * (`remapMembershipSeatTypesForContract` with `swapAt: "next-hour"`), then
 * pre-provisions the seat counts (`syncSeatCount` with the pending start).
 * Legacy plans only carry `workspace`/`none` seats, which Business doesn't bill,
 * so they are promoted to `pro` (the migration's target seat).
 *
 * Skips the live-balance credit reconcile: the contract isn't active yet, so
 * that runs at `contract.start` (and on the next sync once it is active).
 * Best-effort — a failure is logged and the next membership change re-runs it.
 *
 * Returns whether the pending contract was staged.
 */
async function stagePendingContractSeats(
  workspace: LightWorkspaceType
): Promise<boolean> {
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
  // stay `none`). Fixed to `"pro"` for the current legacy→Business migration.
  const remapResult = await remapMembershipSeatTypesForContract({
    metronomeCustomerId: workspace.metronomeCustomerId,
    contractId: pendingSubscription.metronomeContractId,
    workspace,
    swapAt: "next-hour",
    startingAt: new Date(pendingContract.starting_at),
    contract: pendingContract,
    promoteNoneSeatType: "pro",
  });
  if (remapResult.isErr()) {
    logger.warn(
      { workspaceId: workspace.sId, err: remapResult.error.message },
      "[SeatSync] Failed to remap seats onto pending contract; continuing"
    );
    return false;
  }

  const syncResult = await syncSeatCount({
    metronomeCustomerId: workspace.metronomeCustomerId,
    contractId: pendingSubscription.metronomeContractId,
    workspace,
    planCode: pendingSubscription.getPlan().code,
    contract: pendingContract,
    startingAt: pendingContract.starting_at,
  });
  if (syncResult.isErr()) {
    logger.warn(
      { workspaceId: workspace.sId, err: syncResult.error.message },
      "[SeatSync] Failed to pre-provision pending contract seats; continuing"
    );
    return false;
  }

  return true;
}
