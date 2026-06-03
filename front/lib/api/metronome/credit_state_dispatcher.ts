import { Authenticator } from "@app/lib/auth";
import { isPAYGEnabled } from "@app/lib/credits/credit_payg";
import { listMetronomeBalances } from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import { invalidateWorkspacePoolCredits } from "@app/lib/metronome/credit_balance";
import { transitionProgrammaticCreditState } from "@app/lib/metronome/programmatic_credit_state_machine";
import { buildSeatDataByUserId } from "@app/lib/metronome/seats";
import { clearUserCreditStatus } from "@app/lib/metronome/user_block";
import type { UserCreditEvent } from "@app/lib/metronome/user_credit_state_machine";
import {
  resetUserCreditState,
  transitionUserCreditState,
} from "@app/lib/metronome/user_credit_state_machine";
import type { WorkspaceCreditEvent } from "@app/lib/metronome/workspace_credit_state_machine";
import { transitionWorkspaceCreditState } from "@app/lib/metronome/workspace_credit_state_machine";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { UserCreditState } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

/**
 * Resolve the user's active membership and feed `event` to the user credit
 * state machine. Shared by the per-user-cap and seat-balance dispatchers.
 *
 * A no-op (returns `Ok`) when the user or their active membership can't be
 * resolved; `onMissing` lets callers run a side effect in that case (e.g.
 * clearing the legacy Redis block on cap resolution).
 */
async function transitionUserCredit({
  workspace,
  userId,
  event,
  onMissing,
}: {
  workspace: WorkspaceResource;
  userId: string;
  event: UserCreditEvent;
  onMissing?: () => Promise<void>;
}): Promise<Result<void, Error>> {
  const user = await UserResource.fetchById(userId);
  if (!user) {
    logger.warn(
      { workspaceId: workspace.sId, userId, event: event.type },
      "[CreditStateDispatcher] user not found, skipping transition"
    );
    await onMissing?.();
    return new Ok(undefined);
  }

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace: renderLightWorkspaceType({ workspace }),
    });
  if (!membership) {
    logger.warn(
      { workspaceId: workspace.sId, userId, event: event.type },
      "[CreditStateDispatcher] no active membership, skipping transition"
    );
    await onMissing?.();
    return new Ok(undefined);
  }

  const result = await transitionUserCreditState(membership, event, {
    workspaceId: workspace.sId,
    userId,
  });
  if (result.isErr()) {
    return result;
  }
  return new Ok(undefined);
}

export async function dispatchPerUserCapReached({
  workspace,
  userId,
}: {
  workspace: WorkspaceResource;
  userId: string;
}): Promise<Result<void, Error>> {
  return transitionUserCredit({
    workspace,
    userId,
    event: { type: "per_user_cap_reached" },
  });
}

export async function dispatchPerUserCapResolved({
  workspace,
  userId,
}: {
  workspace: WorkspaceResource;
  userId: string;
}): Promise<Result<void, Error>> {
  return transitionUserCredit({
    workspace,
    userId,
    event: { type: "per_user_cap_resolved" },
    // Drop the cached credit status when the user / membership is gone, so a
    // departed user doesn't stay blocked in the cache.
    onMissing: () => clearUserCreditStatus(workspace.sId, userId),
  });
}

/**
 * A user's personal (seat) credit balance reached 0. Move them from the
 * `user_seat*` states to `on_pool` so they spend from the workspace pool.
 */
export async function dispatchSeatBalanceExhausted({
  workspace,
  userId,
}: {
  workspace: WorkspaceResource;
  userId: string;
}): Promise<Result<void, Error>> {
  return transitionUserCredit({
    workspace,
    userId,
    event: { type: "seat_balance_exhausted" },
  });
}

/**
 * A user's personal (seat) credit balance is running low (still > 0). Surface
 * the low-balance warning by moving `user_seat` → `user_seat_low_balance`.
 */
export async function dispatchSeatBalanceLow({
  workspace,
  userId,
}: {
  workspace: WorkspaceResource;
  userId: string;
}): Promise<Result<void, Error>> {
  return transitionUserCredit({
    workspace,
    userId,
    event: { type: "seat_balance_low" },
  });
}

const CREDIT_STATE_RESET_CONCURRENCY = 8;

/**
 * Reset every active member's per-user credit state to their billing-cycle
 * baseline: `user_seat` for users holding a seat with an allocation, `on_pool`
 * for everyone else (including all members of pool-only workspaces). Called
 * when AWU credits refill at a new billing period — seat and pool credits both
 * reset, so users return to spending personal credits first (seat-based) or the
 * pool (pooled), regardless of where they ended the prior period.
 *
 * Idempotent and derived from live Metronome seat data, so it also corrects any
 * drift from missed or duplicated webhooks. On a seat-data fetch error the map
 * is empty, degrading safely to "everyone on_pool".
 */
export async function resetWorkspaceUserCreditStates({
  workspace,
  metronomeCustomerId,
}: {
  workspace: WorkspaceResource;
  metronomeCustomerId: string;
}): Promise<void> {
  const lightWorkspace = renderLightWorkspaceType({ workspace });

  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );
  const contractId = subscription?.metronomeContractId;

  // Per-user seat allocations; empty for pool-only workspaces.
  const seatDataByUserId = contractId
    ? await buildSeatDataByUserId({ metronomeCustomerId, contractId })
    : new Map<string, unknown>();

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace: lightWorkspace,
  });

  await concurrentExecutor(
    memberships,
    async (membership) => {
      const userId = membership.user?.sId;
      if (!userId) {
        return;
      }
      const target: UserCreditState = seatDataByUserId.has(userId)
        ? "user_seat"
        : "on_pool";
      await resetUserCreditState(membership, target, {
        workspaceId: workspace.sId,
        userId,
      });
    },
    { concurrency: CREDIT_STATE_RESET_CONCURRENCY }
  );

  logger.info(
    {
      workspaceId: workspace.sId,
      metronomeCustomerId,
      memberCount: memberships.length,
      seatUserCount: seatDataByUserId.size,
    },
    "[CreditStateDispatcher] Reset user credit states for new billing cycle"
  );
}

export async function dispatchPoolExhausted({
  workspace,
}: {
  workspace: WorkspaceResource;
}): Promise<void> {
  await transitionWorkspacePool(workspace, { type: "pool_exhausted" });
}

export async function dispatchPaygCapReached({
  workspace,
}: {
  workspace: WorkspaceResource;
}): Promise<void> {
  await transitionWorkspacePool(workspace, { type: "payg_cap_reached" });
}

export async function dispatchCreditsAdded({
  workspace,
  newBalanceAwu,
}: {
  workspace: WorkspaceResource;
  newBalanceAwu: number;
}): Promise<void> {
  await transitionWorkspacePool(workspace, {
    type: "credits_added",
    balanceAwu: newBalanceAwu,
  });
}

export async function dispatchPaygDisabled({
  workspace,
}: {
  workspace: WorkspaceResource;
}): Promise<void> {
  await transitionWorkspacePool(workspace, { type: "payg_disabled" });
}

export async function dispatchPaygEnabled({
  workspace,
}: {
  workspace: WorkspaceResource;
}): Promise<void> {
  await transitionWorkspacePool(workspace, { type: "payg_enabled" });
}

export async function dispatchLowBalance({
  workspace,
  balanceAwu,
}: {
  workspace: WorkspaceResource;
  balanceAwu: number;
}): Promise<void> {
  await transitionWorkspacePool(workspace, {
    type: "low_balance",
    balanceAwu,
  });
}

async function transitionWorkspacePool(
  workspace: WorkspaceResource,
  event: WorkspaceCreditEvent
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const paygEnabled = await isPAYGEnabled(auth);
  await transitionWorkspaceCreditState(workspace, event, {
    workspaceId: workspace.sId,
    paygEnabled,
  });
}

// ---------------------------------------------------------------------------
// Programmatic credit state dispatchers
// ---------------------------------------------------------------------------

export async function dispatchProgrammaticLowBalance({
  workspace,
  remainingCredits,
}: {
  workspace: WorkspaceResource;
  remainingCredits: number;
}): Promise<void> {
  await transitionProgrammaticCreditState(workspace, {
    type: "programmatic_low_balance",
    remainingCredits,
  });
}

export async function dispatchProgrammaticCapReached({
  workspace,
}: {
  workspace: WorkspaceResource;
}): Promise<void> {
  await transitionProgrammaticCreditState(workspace, {
    type: "programmatic_cap_reached",
  });
}

export async function dispatchProgrammaticCapReset({
  workspace,
}: {
  workspace: WorkspaceResource;
}): Promise<void> {
  await transitionProgrammaticCreditState(workspace, {
    type: "programmatic_cap_reset",
  });
}

/**
 * Notify admins that programmatic spend has crossed the early-warning
 * threshold (80% of the monthly cap). Unlike the other programmatic
 * dispatchers this does not transition the credit state machine — the
 * workspace stays in its current balance state and no throttling kicks in.
 * The signal is informational only.
 */
export async function dispatchProgrammaticWarning({
  workspace,
}: {
  workspace: WorkspaceResource;
}): Promise<void> {
  // TODO: send notification to admin.
  logger.info(
    { workspaceId: workspace.sId },
    "[ProgrammaticCreditDispatcher] Programmatic warning threshold reached"
  );
}

/**
 * Reconcile the workspace pool credit state with the current Metronome AWU
 * balance. Used after a new contract is provisioned: the cached pool state
 * may be stale (e.g. `depleted` from the previous contract) and Metronome
 * alert webhooks won't fire until the new balance crosses a threshold.
 *
 * Invalidates the pool credits cache, reads the live AWU balance, then
 * dispatches `credits_added` (balance > 0) or `pool_exhausted` (balance == 0)
 * so the state machine routes to the correct state. On balance-fetch
 * failure, logs and skips — the next Metronome alert webhook will converge.
 */
export async function syncPoolCreditStateFromBalance({
  workspace,
  metronomeCustomerId,
}: {
  workspace: WorkspaceResource;
  metronomeCustomerId: string;
}): Promise<void> {
  await invalidateWorkspacePoolCredits(workspace.sId, metronomeCustomerId);

  const balancesResult = await listMetronomeBalances(metronomeCustomerId);

  if (balancesResult.isErr()) {
    logger.warn(
      {
        workspaceId: workspace.sId,
        metronomeCustomerId,
        error: balancesResult.error,
      },
      "[CreditStateDispatcher] syncPoolCreditStateFromBalance: failed to fetch balances, skipping dispatch"
    );
    return;
  }

  const awuCreditTypeId = getCreditTypeAwuId();
  const awuBalance = balancesResult.value.reduce((sum, entry) => {
    if (entry.access_schedule?.credit_type?.id !== awuCreditTypeId) {
      return sum;
    }
    return sum + (entry.balance ?? 0);
  }, 0);

  if (awuBalance > 0) {
    await dispatchCreditsAdded({ workspace, newBalanceAwu: awuBalance });
  } else {
    await dispatchPoolExhausted({ workspace });
  }
}
