import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { isPAYGEnabled } from "@app/lib/credits/credit_payg";
import { listMetronomeBalances } from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import { invalidateWorkspacePoolCredits } from "@app/lib/metronome/credit_balance";
import { transitionProgrammaticCreditState } from "@app/lib/metronome/programmatic_credit_state_machine";
import { clearUserCapBlocked } from "@app/lib/metronome/user_block";
import { transitionUserCreditState } from "@app/lib/metronome/user_credit_state_machine";
import type { WorkspaceCreditEvent } from "@app/lib/metronome/workspace_credit_state_machine";
import { transitionWorkspaceCreditState } from "@app/lib/metronome/workspace_credit_state_machine";
import { notifyAdminsProgrammaticCapWarning } from "@app/lib/notifications/workflows/workspace-programmatic-cap-warning";
import { isEntreprisePlanPrefix } from "@app/lib/plans/plan_codes";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

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
 * The signal is informational only. Best-effort: failures are logged and
 * swallowed so the webhook's credit-state processing is never disrupted.
 */
export async function dispatchProgrammaticWarning({
  workspace,
  monthlyCapCredits,
  eventId,
}: {
  workspace: WorkspaceResource;
  monthlyCapCredits: number;
  eventId: string;
}): Promise<void> {
  logger.info(
    { workspaceId: workspace.sId },
    "[ProgrammaticCreditDispatcher] Programmatic warning threshold reached"
  );

  try {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const workspaceType = auth.workspace();
    if (!workspaceType) {
      logger.error(
        { workspaceId: workspace.sId },
        "[ProgrammaticCreditDispatcher] Workspace not found for programmatic warning notification"
      );
      return;
    }

    const { members: admins } = await getMembers(auth, {
      roles: ["admin"],
      activeOnly: true,
    });
    if (admins.length === 0) {
      logger.warn(
        { workspaceId: workspace.sId },
        "[ProgrammaticCreditDispatcher] No active admins for programmatic warning notification"
      );
      return;
    }

    notifyAdminsProgrammaticCapWarning({
      admins: admins.map((admin) => ({
        sId: admin.sId,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
      })),
      workspaceId: workspace.sId,
      workspaceName: workspaceType.name,
      monthlyCapCredits,
      isEnterprise: isEntreprisePlanPrefix(auth.getNonNullablePlan().code),
      eventId,
    });
  } catch (err) {
    logger.error(
      { workspaceId: workspace.sId, error: normalizeError(err).message },
      "[ProgrammaticCreditDispatcher] Failed to notify admins of programmatic cap warning"
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
