import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { isPAYGEnabled } from "@app/lib/credits/credit_payg";
import { getMetronomeProgrammaticCap } from "@app/lib/metronome/alerts/programmatic_cap";
import { listMetronomeBalances } from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import { invalidateWorkspacePoolCredits } from "@app/lib/metronome/credit_balance";
import { transitionProgrammaticCreditState } from "@app/lib/metronome/programmatic_credit_state_machine";
import {
  clearUserCapBlocked,
  clearWorkspaceProgrammaticWarned,
  setWorkspaceProgrammaticWarned,
} from "@app/lib/metronome/user_block";
import { transitionUserCreditState } from "@app/lib/metronome/user_credit_state_machine";
import type { WorkspaceCreditEvent } from "@app/lib/metronome/workspace_credit_state_machine";
import { transitionWorkspaceCreditState } from "@app/lib/metronome/workspace_credit_state_machine";
import { notifyAdminsProgrammaticCapReached } from "@app/lib/notifications/workflows/programmatic-cap-reached";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

/**
 * Transition a single user from `user_seat` / `user_seat_low_balance` when
 * Metronome fires `alerts.low_remaining_seat_balance_reached` for that user.
 *
 * Paid seats fall back to the workspace pool (`on_pool`). Free seats have no
 * pool access and are capped (`capped`). The guard in the state machine decides
 * which branch applies based on `seatType`.
 */
export async function dispatchSeatBalanceExhausted({
  workspace,
  userId,
}: {
  workspace: WorkspaceResource;
  userId: string;
}): Promise<void> {
  const user = await UserResource.fetchById(userId);
  if (!user) {
    logger.warn(
      { workspaceId: workspace.sId, userId },
      "[CreditStateDispatcher] dispatchSeatBalanceExhausted: user not found, skipping"
    );
    return;
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
      "[CreditStateDispatcher] dispatchSeatBalanceExhausted: no active membership, skipping"
    );
    return;
  }

  const result = await transitionUserCreditState(
    membership,
    { type: "seat_balance_exhausted" },
    { workspaceId: workspace.sId, userId, seatType: membership.seatType }
  );
  if (result.isErr()) {
    logger.warn(
      {
        workspaceId: workspace.sId,
        userId,
        seatType: membership.seatType,
        creditState: membership.creditState,
      },
      "[CreditStateDispatcher] dispatchSeatBalanceExhausted: transition skipped"
    );
  }
}

export async function dispatchSeatLowBalance({
  workspace,
  userId,
}: {
  workspace: WorkspaceResource;
  userId: string;
}): Promise<void> {
  const user = await UserResource.fetchById(userId);
  if (!user) {
    logger.warn(
      { workspaceId: workspace.sId, userId },
      "[CreditStateDispatcher] dispatchSeatLowBalance: user not found, skipping"
    );
    return;
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
      "[CreditStateDispatcher] dispatchSeatLowBalance: no active membership, skipping"
    );
    return;
  }

  const result = await transitionUserCreditState(
    membership,
    { type: "seat_low_balance" },
    { workspaceId: workspace.sId, userId, seatType: membership.seatType }
  );
  if (result.isErr()) {
    logger.warn(
      {
        workspaceId: workspace.sId,
        userId,
        seatType: membership.seatType,
        creditState: membership.creditState,
      },
      "[CreditStateDispatcher] dispatchSeatLowBalance: transition skipped"
    );
  }
}

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
      "[CreditStateDispatcher] per_user_cap_resolved: user not found, clearing legacy block"
    );
    await clearUserCapBlocked(workspace.sId, userId);
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
      "[CreditStateDispatcher] per_user_cap_resolved: no active membership, clearing legacy block"
    );
    await clearUserCapBlocked(workspace.sId, userId);
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
