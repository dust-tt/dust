import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { indexUserDocument } from "@app/lib/user_search";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";

// Backfill the `seat_type` field newly added to the user search index. Re-indexes
// every active member with the seat type of their currently-active membership so
// the seat-type filter (now owned by Elasticsearch) reflects existing members.
// Revoked members are left untouched (they aren't in the index). Run once after
// the schema + write-path change ships.
async function backfillUserSearchSeatType(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  const { memberships, total } = await MembershipResource.getActiveMemberships({
    workspace,
  });

  logger.info(
    {
      workspaceId: workspace.sId,
      activeMemberships: memberships.length,
      total,
    },
    "Found active memberships to backfill seat type"
  );

  if (!execute) {
    logger.info(
      {
        workspaceId: workspace.sId,
        usersToIndex: memberships.length,
      },
      "Would re-index these users with their seat type (dry run)"
    );
    return;
  }

  const users = await UserResource.fetchByModelIds([
    ...new Set(memberships.map((m) => m.userId)),
  ]);
  const userByModelId = new Map(users.map((user) => [user.id, user]));

  let successCount = 0;
  let errorCount = 0;

  await concurrentExecutor(
    memberships,
    async (membership) => {
      const user = userByModelId.get(membership.userId);
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

      const document = user.toUserSearchDocument(
        workspace,
        membership.seatType
      );
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
    },
    { concurrency: 10 }
  );

  logger.info(
    {
      workspaceId: workspace.sId,
      successCount,
      errorCount,
    },
    "Completed seat type backfill for workspace"
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
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }

      await backfillUserSearchSeatType(
        renderLightWorkspaceType({ workspace }),
        logger,
        execute
      );
    } else {
      return runOnAllWorkspaces(
        async (workspace) => {
          await backfillUserSearchSeatType(workspace, logger, execute);
        },
        { concurrency: 16 }
      );
    }
  }
);
