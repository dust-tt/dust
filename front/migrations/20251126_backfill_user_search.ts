import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { deleteUserDocument, indexUserDocument } from "@app/lib/user_search";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

async function backfillUserSearch(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  logger.info(
    {
      workspaceId: workspace.sId,
    },
    "Starting user search backfill"
  );

  // Get all active memberships for this workspace
  const { memberships, total } = await MembershipResource.getLatestMemberships({
    workspace,
  });

  // Filter out revoked memberships
  const activeMemberships = memberships.filter((m) => !m.isRevoked());
  const revokedMemberships = memberships.filter((m) => m.isRevoked());

  logger.info(
    {
      workspaceId: workspace.sId,
      totalMemberships: total,
      activeMemberships: activeMemberships.length,
      revokedMemberships: revokedMemberships.length,
    },
    "Found memberships to process"
  );

  let successCount = 0;
  let errorCount = 0;

  if (execute) {
    // Index active
    await concurrentExecutor(
      activeMemberships,
      async (membership) => {
        try {
          // Get the user for this membership
          const user = await UserResource.fetchByModelId(membership.userId);
          if (!user) {
            logger.warn(
              {
                membershipId: membership.id,
                userId: membership.userId,
                workspaceId: workspace.sId,
              },
              "User not found for membership"
            );
            errorCount++;
            return;
          }

          // Create the user search document
          const document = user.toUserSearchDocument(workspace);

          // Index the document
          const result = await indexUserDocument(document);

          if (result.isErr()) {
            logger.error(
              {
                userId: user.sId,
                workspaceId: workspace.sId,
                error: result.error,
              },
              "Failed to index user document"
            );
            errorCount++;
          } else {
            successCount++;
          }
        } catch (err) {
          errorCount++;
          logger.error(
            {
              membershipId: membership.id,
              workspaceId: workspace.sId,
              error: err,
            },
            "Failed to process active membership"
          );
        }
      },
      { concurrency: 10 }
    );

    // Delete revoked (so that we can re-run this to re-index if needed)
    await concurrentExecutor(
      revokedMemberships,
      async (membership) => {
        try {
          // Get the user for this membership
          const user = await UserResource.fetchByModelId(membership.userId);
          if (!user) {
            logger.warn(
              {
                membershipId: membership.id,
                userId: membership.userId,
                workspaceId: workspace.sId,
              },
              "User not found for membership"
            );
            errorCount++;
            return;
          }

          // We ignore errors here - user likely not indexed
          await deleteUserDocument({
            workspaceId: workspace.sId,
            userId: user.sId,
          });
        } catch (err) {
          errorCount++;
          logger.error(
            {
              membershipId: membership.id,
              workspaceId: workspace.sId,
              error: err,
            },
            "Failed to process revoked membership"
          );
        }
      },
      { concurrency: 10 }
    );
  } else {
    logger.info(
      {
        workspaceId: workspace.sId,
        usersToIndex: activeMemberships.length,
        usersToDelete: revokedMemberships.length,
      },
      "Would index these users (dry run)"
    );
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      successCount,
      errorCount,
      totalIndexed: activeMemberships.length,
      totalRemoved: revokedMemberships.length,
    },
    "Completed user search backfill for workspace"
  );
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: false,
      description: "Run on a single workspace (optional)",
    },
  },
  async ({ execute, workspaceId }, logger) => {
    if (workspaceId) {
      // Run on a single workspace
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }

      await backfillUserSearch(
        renderLightWorkspaceType({ workspace }),
        logger,
        execute
      );
    } else {
      // Run on all workspaces
      return runOnAllWorkspaces(
        async (workspace) => {
          await backfillUserSearch(workspace, logger, execute);
        },
        { concurrency: 16 }
      );
    }
  }
);
