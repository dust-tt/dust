import { Authenticator } from "@app/lib/auth";
import { isPAYGEnabled } from "@app/lib/credits/payg";
import { listMetronomeBalances } from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import { invalidateWorkspacePoolCredits } from "@app/lib/metronome/credit_balance";
import { clearUserCapBlocked } from "@app/lib/metronome/user_block";
import { transitionUserCreditState } from "@app/lib/metronome/user_credit_state_machine";
import type { WorkspaceCreditEvent } from "@app/lib/metronome/workspace_credit_state_machine";
import { transitionWorkspaceCreditState } from "@app/lib/metronome/workspace_credit_state_machine";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

async function isPaygEnabled(workspace: WorkspaceResource): Promise<boolean> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  return isPAYGEnabled(auth);
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
  newBalance,
}: {
  workspace: WorkspaceResource;
  newBalance: number;
}): Promise<void> {
  await transitionWorkspacePool(workspace, {
    type: "credits_added",
    balance: newBalance,
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

export async function dispatchLowBalance100({
  workspace,
}: {
  workspace: WorkspaceResource;
}): Promise<void> {
  await transitionWorkspacePool(workspace, { type: "low_balance_100" });
}

export async function dispatchLowBalance10({
  workspace,
}: {
  workspace: WorkspaceResource;
}): Promise<void> {
  await transitionWorkspacePool(workspace, { type: "low_balance_10" });
}

async function transitionWorkspacePool(
  workspace: WorkspaceResource,
  event: WorkspaceCreditEvent
): Promise<void> {
  const paygEnabled = await isPaygEnabled(workspace);
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
    await dispatchCreditsAdded({ workspace, newBalance: awuBalance });
  } else {
    await dispatchPoolExhausted({ workspace });
  }
}
