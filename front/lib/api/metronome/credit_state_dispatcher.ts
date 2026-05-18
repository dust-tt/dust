import {
  clearUserCapBlocked,
  setUserCapBlocked,
} from "@app/lib/metronome/user_block";
import { transitionUserCreditState } from "@app/lib/metronome/user_credit_state_machine";
import type { WorkspaceCreditEvent } from "@app/lib/metronome/workspace_credit_state_machine";
import { transitionWorkspaceCreditState } from "@app/lib/metronome/workspace_credit_state_machine";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

// TODO(remy): replace stub with real contract lookup once the PAYG
// flag location on the Metronome contract is settled. Until then we treat
// every workspace as non-PAYG: `pool_exhausted` always routes to `depleted`.
async function isPaygEnabled(_workspace: WorkspaceResource): Promise<boolean> {
  return false;
}

export async function dispatchPerUserCapReached({
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
      "[CreditStateDispatcher] per_user_cap_reached: user not found, applying legacy block"
    );
    await setUserCapBlocked(workspace.sId, userId);
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
      "[CreditStateDispatcher] per_user_cap_reached: no active membership, applying legacy block"
    );
    await setUserCapBlocked(workspace.sId, userId);
    return;
  }

  if (membership.seatType !== "workspace") {
    await setUserCapBlocked(workspace.sId, userId);
    return;
  }

  await transitionUserCreditState(
    membership,
    { type: "per_user_cap_reached" },
    { workspaceId: workspace.sId, userId }
  );
}

export async function dispatchPerUserCapResolved({
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
      "[CreditStateDispatcher] per_user_cap_resolved: user not found, clearing legacy block"
    );
    await clearUserCapBlocked(workspace.sId, userId);
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
      "[CreditStateDispatcher] per_user_cap_resolved: no active membership, clearing legacy block"
    );
    await clearUserCapBlocked(workspace.sId, userId);
    return;
  }

  if (membership.seatType !== "workspace") {
    await clearUserCapBlocked(workspace.sId, userId);
    return;
  }

  await transitionUserCreditState(
    membership,
    { type: "per_user_cap_resolved" },
    { workspaceId: workspace.sId, userId }
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
}: {
  workspace: WorkspaceResource;
}): Promise<void> {
  await transitionWorkspacePool(workspace, { type: "credits_added" });
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
