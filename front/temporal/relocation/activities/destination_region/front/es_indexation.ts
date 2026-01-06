import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { indexUserDocument } from "@app/lib/user_search";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

export async function recreateUserSearchIndex({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const localLogger = logger.child({
    workspaceId,
  });

  localLogger.info("[User Search] Recreating user search index for workspace.");

  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  const lightWorkspace = renderLightWorkspaceType({ workspace });

  // Get all memberships for this workspace.
  const { memberships } = await MembershipResource.getLatestMemberships({
    workspace: lightWorkspace,
  });

  // Filter out revoked memberships - only index active members.
  const activeMemberships = memberships.filter((m) => !m.isRevoked());

  localLogger.info(
    {
      totalMemberships: memberships.length,
      activeMemberships: activeMemberships.length,
    },
    "[User Search] Found memberships to index"
  );

  let successCount = 0;
  let errorCount = 0;

  await concurrentExecutor(
    activeMemberships,
    async (membership) => {
      const user = await UserResource.fetchByModelId(membership.userId);
      if (!user) {
        localLogger.warn(
          {
            membershipId: membership.id,
            userId: membership.userId,
          },
          "[User Search] User not found for membership"
        );
        errorCount++;
        return;
      }

      const document = user.toUserSearchDocument(lightWorkspace);
      const result = await indexUserDocument(document);

      if (result.isErr()) {
        localLogger.error(
          {
            userId: user.sId,
            error: result.error,
          },
          "[User Search] Failed to index user document"
        );
        errorCount++;
      } else {
        successCount++;
      }
    },
    { concurrency: 10 }
  );

  localLogger.info(
    {
      successCount,
      errorCount,
      totalIndexed: activeMemberships.length,
    },
    "[User Search] Completed user search index recreation for workspace"
  );

  if (errorCount > 0) {
    throw new Error(
      `Failed to index ${errorCount} users for workspace ${workspaceId}`
    );
  }
}
