import { maybeAutoUpgradeSeat } from "@app/lib/api/credits/auto_seat_upgrade";
import { Authenticator } from "@app/lib/auth";
import { isPAYGEnabled } from "@app/lib/credits/credit_payg";
import { getWorkspacePoolAwuBalance } from "@app/lib/metronome/pool_balance";
import { transitionUserCreditState } from "@app/lib/metronome/user_credit_state_machine";
import type { WorkspaceCreditEvent } from "@app/lib/metronome/workspace_credit_state_machine";
import { transitionWorkspaceCreditState } from "@app/lib/metronome/workspace_credit_state_machine";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { resolveEffectiveSpendLimitAwuCredits } from "@app/lib/spend_limits/effective";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Resolve the effective pool credit limit for a user.
 *
 * Priority: per-user override > max group cap > workspace default. When nothing
 * is configured, defaults to 0 (no pool access). Unlimited pool is not
 * supported. All values are pool-only (excluding seat allowance).
 *
 * Returns `number`: the pool credit limit (0 = no pool access).
 */
function resolvePoolLimitForUser({
  workspace,
  membership,
  groupCapAwuCredits,
  defaultPoolCapAwuCredits,
}: {
  workspace: WorkspaceResource;
  membership: MembershipResource;
  groupCapAwuCredits: number | null;
  defaultPoolCapAwuCredits: number;
}): number {
  if (!workspace.metronomeCustomerId) {
    return 0;
  }
  // Seats with no pool access: free (personal lifetime credits only) and none
  // (no seat at all). Exit early — no point inspecting overrides or defaults.
  if (membership.seatType === "free" || membership.seatType === "none") {
    return 0;
  }
  // Remaining seat types (pro/max/workspace) have pool access following the
  // shared ladder: per-user override > max group cap > workspace default.
  return resolveEffectiveSpendLimitAwuCredits({
    overrideAwuCredits: membership.poolCapOverrideAwuCredits,
    groupCapAwuCredits,
    defaultAwuCredits: defaultPoolCapAwuCredits,
  });
}

// Max group cap (pool-only, excluding seat allowance) across a single user's
// groups; null when none carry a cap. Fed into the effective-cap resolution so
// group caps rank between the per-user override and the workspace default.
async function fetchMaxGroupPoolCapForUser({
  workspace,
  userModelId,
}: {
  workspace: LightWorkspaceType;
  userModelId: ModelId;
}): Promise<number | null> {
  const caps =
    await GroupResource.listMaxPoolCapAwuCreditsByUserModelIdInWorkspace({
      workspace,
      userModelIds: [userModelId],
    });
  return caps.get(userModelId) ?? null;
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

  // Max group cap (pool-only) across the user's groups; null when none carry a
  // cap. Resolved once and fed to both the pool-limit and remaining-% helpers so
  // they agree on the effective cap.
  const groupCapAwuCredits = await fetchMaxGroupPoolCapForUser({
    workspace: lightWorkspace,
    userModelId: user.id,
  });

  const poolLimitAwuCredits = resolvePoolLimitForUser({
    workspace,
    membership,
    groupCapAwuCredits,
    defaultPoolCapAwuCredits,
  });

  // Seats with pool access fall back to `on_pool`; free seats (no pool) have no
  // matching transition and stay `user_seat` — their blocking is the
  // rate-limiter lifetime cap, not this state.
  const result = await transitionUserCreditState(
    membership,
    { type: "seat_balance_exhausted" },
    {
      workspaceId: workspace.sId,
      userId,
      seatType: membership.seatType,
      poolLimitAwuCredits,
    }
  );
  if (result.isErr()) {
    logger.info(
      {
        workspaceId: workspace.sId,
        userId,
        seatType: membership.seatType,
        poolLimitAwuCredits,
      },
      "[CreditStateDispatcher] dispatchSeatBalanceExhausted: no seat→pool transition (free seat stays user_seat)"
    );
  }

  // The personal seat balance is exhausted: auto-upgrade one tier (free→pro,
  // pro→max) if the workspace opted in and a higher tier exists (no-op
  // otherwise, and for pool-based seats).
  void maybeAutoUpgradeSeat({ workspaceId: workspace.sId, userId });
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

  // The seat balance came back: a seat-based user returns to `user_seat`.
  const result = await transitionUserCreditState(
    membership,
    { type: "seat_balance_resolved" },
    {
      workspaceId: workspace.sId,
      userId,
      seatType: membership.seatType,
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
