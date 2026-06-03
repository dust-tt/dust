import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { isPAYGEnabled } from "@app/lib/credits/credit_payg";
import { getMetronomeProgrammaticCap } from "@app/lib/metronome/alerts/programmatic_cap";
import { listMetronomeBalances } from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import { invalidateWorkspacePoolCredits } from "@app/lib/metronome/credit_balance";
import { transitionProgrammaticCreditState } from "@app/lib/metronome/programmatic_credit_state_machine";
import { buildSeatDataByUserId } from "@app/lib/metronome/seats";
import {
  clearUserCreditStatus,
  clearWorkspaceProgrammaticWarned,
  setWorkspaceProgrammaticWarned,
} from "@app/lib/metronome/user_block";
import {
  resetUserCreditState,
  transitionUserCreditState,
} from "@app/lib/metronome/user_credit_state_machine";
import type { WorkspaceCreditEvent } from "@app/lib/metronome/workspace_credit_state_machine";
import { transitionWorkspaceCreditState } from "@app/lib/metronome/workspace_credit_state_machine";
import { notifyAdminsProgrammaticCapReached } from "@app/lib/notifications/workflows/programmatic-cap-reached";
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

export async function dispatchPerUserCapReached({
  workspace,
  userId,
}: {
  workspace: WorkspaceResource;
  userId: string;
}): Promise<Result<void, Error>> {
  const user = await UserResource.fetchById(userId);
  if (!user) {
    logger.warn(
      { workspaceId: workspace.sId, userId },
      "[CreditStateDispatcher] per_user_cap_reached: user not found, skipping"
    );
    return new Ok(undefined);
  }

  const lightWorkspace = renderLightWorkspaceType({ workspace });
  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace: lightWorkspace,
    });
  if (!membership) {
    logger.warn(
      { workspaceId: workspace.sId, userId },
      "[CreditStateDispatcher] per_user_cap_reached: no active membership, skipping"
    );
    return new Ok(undefined);
  }

  const result = await transitionUserCreditState(
    membership,
    { type: "per_user_cap_reached" },
    { workspaceId: workspace.sId, userId }
  );
  if (result.isErr()) {
    return result;
  }
  return new Ok(undefined);
}

export async function dispatchPerUserCapResolved({
  workspace,
  userId,
}: {
  workspace: WorkspaceResource;
  userId: string;
}): Promise<Result<void, Error>> {
  const user = await UserResource.fetchById(userId);
  if (!user) {
    logger.warn(
      { workspaceId: workspace.sId, userId },
      "[CreditStateDispatcher] per_user_cap_resolved: user not found, clearing cached status"
    );
    // Drop the cached credit status when the user is gone, so a departed user
    // doesn't stay blocked in the cache.
    await clearUserCreditStatus(workspace.sId, userId);
    return new Ok(undefined);
  }

  const lightWorkspace = renderLightWorkspaceType({ workspace });
  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace: lightWorkspace,
    });

  if (!membership) {
    logger.warn(
      { workspaceId: workspace.sId, userId },
      "[CreditStateDispatcher] per_user_cap_resolved: no active membership, clearing cached status"
    );
    await clearUserCreditStatus(workspace.sId, userId);
    return new Ok(undefined);
  }

  const result = await transitionUserCreditState(
    membership,
    { type: "per_user_cap_resolved" },
    { workspaceId: workspace.sId, userId }
  );
  if (result.isErr()) {
    return result;
  }
  return new Ok(undefined);
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
  const user = await UserResource.fetchById(userId);
  if (!user) {
    logger.warn(
      { workspaceId: workspace.sId, userId },
      "[CreditStateDispatcher] seat_balance_exhausted: user not found, skipping"
    );
    return new Ok(undefined);
  }

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace: renderLightWorkspaceType({ workspace }),
    });
  if (!membership) {
    logger.warn(
      { workspaceId: workspace.sId, userId },
      "[CreditStateDispatcher] seat_balance_exhausted: no active membership, skipping"
    );
    return new Ok(undefined);
  }

  const result = await transitionUserCreditState(
    membership,
    { type: "seat_balance_exhausted" },
    { workspaceId: workspace.sId, userId }
  );
  if (result.isErr()) {
    return result;
  }
  return new Ok(undefined);
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
  const user = await UserResource.fetchById(userId);
  if (!user) {
    logger.warn(
      { workspaceId: workspace.sId, userId },
      "[CreditStateDispatcher] seat_balance_low: user not found, skipping"
    );
    return new Ok(undefined);
  }

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace: renderLightWorkspaceType({ workspace }),
    });
  if (!membership) {
    logger.warn(
      { workspaceId: workspace.sId, userId },
      "[CreditStateDispatcher] seat_balance_low: no active membership, skipping"
    );
    return new Ok(undefined);
  }

  const result = await transitionUserCreditState(
    membership,
    { type: "seat_balance_low" },
    { workspaceId: workspace.sId, userId }
  );
  if (result.isErr()) {
    return result;
  }
  return new Ok(undefined);
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
    : new Ok(new Map<string, unknown>());

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
      const target: UserCreditState =
        seatDataByUserId.isOk() && seatDataByUserId.value.has(userId)
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
      seatUserCount: seatDataByUserId.isOk() && seatDataByUserId.value.size,
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
  eventId,
}: {
  workspace: WorkspaceResource;
  eventId: string;
}): Promise<void> {
  await transitionProgrammaticCreditState(workspace, {
    type: "programmatic_cap_reached",
  });
  void notifyAdminsProgrammaticCapAboutStatus({
    workspace,
    isBlocked: true,
    eventId,
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
  void clearWorkspaceProgrammaticWarned(workspace.sId);
}

/**
 * Notify admins that programmatic spend has crossed the early-warning
 * threshold (80% of the monthly cap). Unlike the other programmatic
 * dispatchers this does not transition the credit state machine — the
 * workspace stays in its current balance state and no throttling kicks in.
 * Sets the warning flag in Redis and emails workspace admins.
 */
export async function dispatchProgrammaticWarning({
  workspace,
  eventId,
}: {
  workspace: WorkspaceResource;
  eventId: string;
}): Promise<void> {
  void setWorkspaceProgrammaticWarned(workspace.sId);
  void notifyAdminsProgrammaticCapAboutStatus({
    workspace,
    isBlocked: false,
    eventId,
  });
  logger.info(
    { workspaceId: workspace.sId },
    "[ProgrammaticCreditDispatcher] Programmatic warning threshold reached"
  );
}

async function notifyAdminsProgrammaticCapAboutStatus({
  workspace,
  isBlocked,
  eventId,
}: {
  workspace: WorkspaceResource;
  isBlocked: boolean;
  eventId: string;
}): Promise<void> {
  const metronomeCustomerId = workspace.metronomeCustomerId;
  if (!metronomeCustomerId) {
    return;
  }

  try {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const lightWorkspace = renderLightWorkspaceType({ workspace });

    const capResult = await getMetronomeProgrammaticCap({
      metronomeCustomerId,
      workspaceId: workspace.sId,
    });
    const monthlyCapCredits = capResult.isOk() ? capResult.value : null;

    const { members: admins } = await getMembers(auth, {
      roles: ["admin"],
      activeOnly: true,
    });
    if (admins.length === 0) {
      logger.warn(
        { workspaceId: workspace.sId },
        "[ProgrammaticCreditDispatcher] No active admins found for cap notification"
      );
      return;
    }

    notifyAdminsProgrammaticCapReached({
      admins: admins.map((admin) => ({
        sId: admin.sId,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
      })),
      workspaceId: workspace.sId,
      workspaceName: lightWorkspace.name,
      monthlyCapCredits,
      isBlocked,
      eventId,
    });
  } catch (err) {
    logger.error(
      { workspaceId: workspace.sId, isBlocked, err },
      "[ProgrammaticCreditDispatcher] Failed to notify admins of programmatic cap status"
    );
  }
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
