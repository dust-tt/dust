import { expireUserSpendLimitOverride } from "@app/lib/api/users/spend_limit";
import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";

/**
 * Revert every active membership's pool cap override whose
 * `poolCapOverrideExpiresAt` has passed, back to the seat-type default.
 * Global sweep across all workspaces, run on a schedule (see `client.ts`).
 */
export async function expirePoolCapOverridesActivity(): Promise<void> {
  const now = new Date();
  const workspaces =
    await MembershipResource.getWorkspacesWithExpiredPoolCapOverride(now);

  if (workspaces.length === 0) {
    logger.info("[SpendLimitExpiration] No expired pool cap overrides found");
    return;
  }

  let revertedCount = 0;

  for (const workspace of workspaces) {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const lightWorkspace = auth.getNonNullableWorkspace();

    const memberships =
      await MembershipResource.listActiveWithExpiredPoolCapOverride({
        workspace: lightWorkspace,
        now,
      });
    if (memberships.length === 0) {
      continue;
    }

    const users = await UserResource.fetchByModelIds(
      memberships.map((membership) => membership.userId)
    );
    const userSIdByModelId = new Map(users.map((user) => [user.id, user.sId]));

    const results = await concurrentExecutor(
      memberships,
      async (membership) => {
        const userId = userSIdByModelId.get(membership.userId);
        if (!userId) {
          logger.error(
            { workspaceId: workspace.sId, membershipUserId: membership.userId },
            "[SpendLimitExpiration] User not found for expired membership override"
          );
          return false;
        }
        const result = await expireUserSpendLimitOverride(auth, { userId });
        if (result.isErr()) {
          logger.error(
            { workspaceId: workspace.sId, userId, err: result.error },
            "[SpendLimitExpiration] Failed to revert expired pool cap override"
          );
          return false;
        }
        return result.value.reverted;
      },
      { concurrency: 4 }
    );

    revertedCount += results.filter(Boolean).length;
  }

  logger.info(
    { workspaceCount: workspaces.length, revertedCount },
    "[SpendLimitExpiration] Completed expired pool cap override sweep"
  );
}
