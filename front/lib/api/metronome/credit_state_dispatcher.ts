import { maybeAutoUpgradeSeat } from "@app/lib/api/credits/auto_seat_upgrade";
import { fetchRemainingCapCreditsPercentageForUser } from "@app/lib/api/credits/members_usage";
import { recalculatePerUserCapAlertForSeatChange } from "@app/lib/api/membership";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { isPAYGEnabled } from "@app/lib/credits/credit_payg";
import { fetchLiveUserCreditInputs } from "@app/lib/metronome/live_user_credit_inputs";
import { getWorkspacePoolAwuBalance } from "@app/lib/metronome/pool_balance";
import { transitionProgrammaticCreditState } from "@app/lib/metronome/programmatic_credit_state_machine";
import {
  clearWorkspaceProgrammaticWarningReached,
  setUserCreditState,
  setWorkspaceProgrammaticWarningReached,
} from "@app/lib/metronome/user_block";
import type { LiveUserSeatBalance } from "@app/lib/metronome/user_credit_state_machine";
import { transitionUserCreditState } from "@app/lib/metronome/user_credit_state_machine";
import type { WorkspaceCreditEvent } from "@app/lib/metronome/workspace_credit_state_machine";
import { transitionWorkspaceCreditState } from "@app/lib/metronome/workspace_credit_state_machine";
import { notifyAdminsProgrammaticCapReached } from "@app/lib/notifications/workflows/programmatic-cap-reached";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";

import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

/**
 * Resolve the effective pool credit limit for a user.
 *
 * Priority: per-user override > workspace default. When nothing is configured,
 * defaults to 0 (no pool access). Unlimited pool is not supported.
 *
 * Returns `number`: the pool credit limit (0 = no pool access).
 */
async function resolvePoolLimitForUser({
  workspace,
  membership,
  defaultPoolCapAwuCredits,
}: {
  workspace: WorkspaceResource;
  membership: MembershipResource;
  defaultPoolCapAwuCredits: number;
}): Promise<number> {
  if (!workspace.metronomeCustomerId) {
    return 0;
  }
  // Seats with no pool access: free (personal lifetime credits only) and none
  // (no seat at all). Exit early — no point inspecting overrides or defaults.
  if (membership.seatType === "free" || membership.seatType === "none") {
    return 0;
  }
  // Per-user override takes precedence over the workspace default.
  if (membership.poolCapOverrideAwuCredits !== null) {
    return membership.poolCapOverrideAwuCredits;
  }
  // All remaining seat types (pro/max/workspace) have pool access governed by
  // the workspace default (0 = no pool if not configured).
  return defaultPoolCapAwuCredits;
}

/**
 * Transition a single user from `user_seat` when Metronome fires
 * `alerts.low_remaining_seat_balance_reached` at threshold 0 for that user.
 *
 * Resolves the user's effective pool credit limit (0 when none is configured).
 * The state machine uses this limit to decide whether the user goes to
 * `on_pool` or `capped`.
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

  const creditUsageConfig =
    await CreditUsageConfigurationResource.fetchByWorkspaceModelId(
      workspace.id
    );
  const defaultPoolCapAwuCredits =
    creditUsageConfig?.defaultPoolCapAwuCredits ?? 0;

  const poolLimitAwuCredits = await resolvePoolLimitForUser({
    workspace,
    membership,
    defaultPoolCapAwuCredits,
  });
  const remainingCapCreditsPercentage =
    await fetchRemainingCapCreditsPercentageForUser({
      metronomeCustomerId: workspace.metronomeCustomerId,
      workspaceId: workspace.sId,
      userId,
      seatType: membership.seatType,
      poolCapOverrideAwuCredits: membership.poolCapOverrideAwuCredits,
      defaultPoolCapAwuCredits,
    });

  const result = await transitionUserCreditState(
    membership,
    { type: "seat_balance_exhausted" },
    {
      workspaceId: workspace.sId,
      userId,
      seatType: membership.seatType,
      remainingCapCreditsPercentage,
      poolLimitAwuCredits,
    }
  );
  if (result.isErr()) {
    logger.warn(
      {
        workspaceId: workspace.sId,
        userId,
        seatType: membership.seatType,
        creditState: membership.creditState,
        poolLimitAwuCredits,
      },
      "[CreditStateDispatcher] dispatchSeatBalanceExhausted: transition skipped"
    );
    return;
  }

  // Free seats have no pool fallback, so an exhausted balance lands them in
  // `capped`. If the workspace opted into auto-upgrades, bump their seat one
  // tier (free → pro) so they stay unblocked. Pro/max seats fall back to the
  // pool (`on_pool`) instead and are left alone here.
  if (result.value === "capped") {
    void maybeAutoUpgradeSeat({ workspaceId: workspace.sId, userId });
  }
}

export async function dispatchSeatBalanceResolved({
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
      "[CreditStateDispatcher] dispatchSeatBalanceResolved: user not found, skipping"
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
      "[CreditStateDispatcher] dispatchSeatBalanceResolved: no active membership, skipping"
    );
    return;
  }

  // A deferred seat change may have just taken effect (the future membership
  // row became active). Re-derive the per-user cap alert from the membership's
  // pool cap override and the current seat allowance — a no-op when the user
  // has no override or the threshold is unchanged.
  await recalculatePerUserCapAlertForSeatChange({
    workspace: lightWorkspace,
    membership,
    userId,
  });

  // The seat balance came back; the band the user lands in depends on how much
  // is left. Read the live balance so the state machine can route to
  // `user_seat` vs `user_seat_low_balance` (or the pool for non-seat users).
  const liveBalance = await resolveLiveUserBalance({
    workspace,
    userId,
    seatType: membership.seatType,
    poolCapOverrideAwuCredits: membership.poolCapOverrideAwuCredits,
  });

  const result = await transitionUserCreditState(
    membership,
    { type: "seat_balance_resolved" },
    {
      workspaceId: workspace.sId,
      userId,
      seatType: membership.seatType,
      liveBalance,
    }
  );
  if (result.isErr()) {
    logger.warn(
      {
        workspaceId: workspace.sId,
        userId,
        seatType: membership.seatType,
        creditState: membership.creditState,
      },
      "[CreditStateDispatcher] dispatchSeatBalanceResolved: transition skipped"
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

  // The member just hit their per-user cap. If the workspace opted into
  // auto-upgrades, bump their seat one tier so they stay unblocked.
  if (result.value === "capped") {
    void maybeAutoUpgradeSeat({ workspaceId: workspace.sId, userId });
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
      "[CreditStateDispatcher] per_user_cap_resolved: user not found, resetting credit state"
    );
    await setUserCreditState(workspace.sId, userId, "on_pool");
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
      "[CreditStateDispatcher] per_user_cap_resolved: no active membership, resetting credit state"
    );
    await setUserCreditState(workspace.sId, userId, "on_pool");
    return new Ok(undefined);
  }

  // Resolving the per-user cap only clears the cap dimension; the seat↔pool band
  // the user lands in depends on their live balance. Read it from Metronome and
  // pass it into the transition context so the state machine picks the correct
  // band (a seat-based user with personal balance left → `user_seat` /
  // `user_seat_low_balance`; otherwise the pool). When the live read isn't
  // available the transition defaults to `on_pool` and the reconcile / billing
  // webhooks correct it later.
  const liveBalance = await resolveLiveUserBalance({
    workspace,
    userId,
    seatType: membership.seatType,
    poolCapOverrideAwuCredits: membership.poolCapOverrideAwuCredits,
  });

  const result = await transitionUserCreditState(
    membership,
    { type: "per_user_cap_resolved" },
    {
      workspaceId: workspace.sId,
      userId,
      seatType: membership.seatType,
      liveBalance,
    }
  );
  if (result.isErr()) {
    return result;
  }
  return new Ok(undefined);
}

// Read the live per-user balance snapshot used to recompute the seat↔pool band
// when a per-user cap resolves or a seat balance is replenished. Returns
// `undefined` when there's no Metronome customer or the live read fails — the
// transition then falls back to its unguarded default.
async function resolveLiveUserBalance({
  workspace,
  userId,
  seatType,
  poolCapOverrideAwuCredits,
}: {
  workspace: WorkspaceResource;
  userId: string;
  seatType: MembershipSeatType | null;
  poolCapOverrideAwuCredits: number | null;
}): Promise<LiveUserSeatBalance | undefined> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return undefined;
  }

  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );
  const metronomeContractId = subscription?.metronomeContractId ?? null;

  const creditUsageConfig =
    await CreditUsageConfigurationResource.fetchByWorkspaceModelId(
      workspace.id
    );

  const liveResult = await fetchLiveUserCreditInputs({
    workspaceId: workspace.sId,
    userId,
    seatType,
    poolCapOverrideAwuCredits,
    defaultPoolCapAwuCredits: creditUsageConfig?.defaultPoolCapAwuCredits ?? 0,
    metronomeCustomerId,
    metronomeContractId,
  });
  if (liveResult.isErr()) {
    logger.warn(
      { workspaceId: workspace.sId, userId, seatType, err: liveResult.error },
      "[CreditStateDispatcher] live balance read failed; transition uses default band"
    );
    return undefined;
  }

  return {
    seatBalanceAwu: liveResult.value.seatBalanceAwu,
    seatStartingBalanceAwu: liveResult.value.seatStartingBalanceAwu,
    perUserCapAwuCredits: liveResult.value.effectiveCapAwuCredits,
    consumedAwuCredits: liveResult.value.consumedAwuCredits,
  };
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
  void clearWorkspaceProgrammaticWarningReached(workspace.sId);
  await transitionProgrammaticCreditState(workspace, {
    type: "programmatic_cap_reset",
  });
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
  void setWorkspaceProgrammaticWarningReached(workspace.sId);
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

    const creditUsageConfig =
      await CreditUsageConfigurationResource.fetchByWorkspaceModelId(
        workspace.id
      );
    const monthlyCapCredits =
      creditUsageConfig?.programmaticMonthlyCapAwuCredits ?? null;

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
 * Reads the live AWU balance, then dispatches `credits_added` (balance > 0)
 * or `pool_exhausted` (balance == 0)
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
  const balanceResult = await getWorkspacePoolAwuBalance(metronomeCustomerId);

  if (balanceResult.isErr()) {
    logger.warn(
      {
        workspaceId: workspace.sId,
        metronomeCustomerId,
        error: balanceResult.error,
      },
      "[CreditStateDispatcher] syncPoolCreditStateFromBalance: failed to fetch balances, skipping dispatch"
    );
    return;
  }

  const awuBalance = balanceResult.value;
  if (awuBalance > 0) {
    await dispatchCreditsAdded({ workspace, newBalanceAwu: awuBalance });
  } else {
    await dispatchPoolExhausted({ workspace });
  }
}
