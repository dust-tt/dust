import { sendCreditUsageAlertEmail } from "@app/lib/api/email";
import { expireUserSpendLimitOverride } from "@app/lib/api/users/spend_limit";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";

export interface SendCreditAlertEmailActivityArgs {
  workspaceId: string;
  totalInitialMicroUsd: number;
  totalConsumedMicroUsd: number;
}

export async function sendCreditAlertEmailActivity({
  workspaceId,
  totalInitialMicroUsd,
  totalConsumedMicroUsd,
}: SendCreditAlertEmailActivityArgs): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspace = auth.workspace();

  if (!workspace) {
    logger.error(
      { workspaceId },
      "[Credit Alert] Workspace not found for credit alert email"
    );
    return;
  }

  const { members: admins } = await getMembers(auth, {
    roles: ["admin"],
    activeOnly: true,
  });

  if (admins.length === 0) {
    logger.warn(
      { workspaceId },
      "[Credit Alert] No active admins found for credit alert email"
    );
    return;
  }

  const percentUsed = Math.round(
    (totalConsumedMicroUsd / totalInitialMicroUsd) * 100
  );

  for (const admin of admins) {
    await sendCreditUsageAlertEmail({
      email: admin.email,
      workspace,
      percentUsed,
      totalInitialMicroUsd,
      totalConsumedMicroUsd,
    });
  }

  logger.info(
    {
      workspaceId,
      adminCount: admins.length,
      percentUsed,
      totalInitialMicroUsd,
      totalConsumedMicroUsd,
    },
    "[Credit Alert] Sent credit usage alert emails to workspace admins"
  );
}

/**
 * List the workspaces that have at least one active membership whose
 * `poolCapOverrideExpiresAt` has passed. Called once per schedule tick (see
 * `client.ts`); the workflow then fans out one activity per workspace so a
 * slow or stuck workspace can't block the others or blow the shared
 * timeout.
 */
export async function getWorkspacesWithExpiredPoolCapOverrideActivity(): Promise<
  string[]
> {
  const workspaceModelIds =
    await MembershipResource.dangerouslyGetWorkspaceModelIdsWithExpiredPoolCapOverride(
      new Date()
    );
  const workspaces = await WorkspaceResource.fetchByModelIds(workspaceModelIds);
  return workspaces
    .sort((a, b) => a.id - b.id)
    .map((workspace) => workspace.sId);
}

/**
 * Revert every active membership's pool cap override whose
 * `poolCapOverrideExpiresAt` has passed, back to the seat-type default, for
 * a single workspace.
 */
export async function expireWorkspacePoolCapOverridesActivity(
  workspaceId: string
): Promise<void> {
  const now = new Date();
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    logger.error(
      { workspaceId },
      "[SpendLimitExpiration] Workspace not found for expired pool cap override sweep"
    );
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

  const memberships =
    await MembershipResource.listActiveWithExpiredPoolCapOverride({
      auth,
      now,
    });
  if (memberships.length === 0) {
    return;
  }

  const users = await UserResource.fetchByModelIds(
    memberships.map((membership) => membership.userId)
  );
  const userByModelId = new Map(users.map((user) => [user.id, user]));

  const results = await concurrentExecutor(
    memberships,
    async (membership) => {
      const user = userByModelId.get(membership.userId);
      if (!user) {
        logger.error(
          {
            workspaceId: workspace.sId,
            membershipUserId: membership.userId,
          },
          "[SpendLimitExpiration] User not found for expired membership override"
        );
        return false;
      }
      const result = await expireUserSpendLimitOverride(auth, {
        user,
        membership,
        workspace,
      });
      if (result.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            userId: user.sId,
            err: result.error,
          },
          "[SpendLimitExpiration] Failed to revert expired pool cap override"
        );
        return false;
      }
      return result.value.reverted;
    },
    { concurrency: 4 }
  );

  const revertedCount = results.filter(Boolean).length;
  logger.info(
    { workspaceId: workspace.sId, revertedCount },
    "[SpendLimitExpiration] Completed expired pool cap override sweep for workspace"
  );
}
