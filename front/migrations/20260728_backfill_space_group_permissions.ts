import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";

const WORKSPACE_CONCURRENCY = 2;
const SPACE_CONCURRENCY = 4;

// Backfill (#9478): (re-)derive every space's group_permissions from its group_vaults associations.
// The write goes through SpaceResource.writeGroupPermissions — the same method the space mutation
// paths call — so the backfill and the ongoing writes can never disagree. Idempotent (clears +
// re-inserts), so it is safe to re-run if grants get corrupted.
async function backfillWorkspaceSpaceGroupPermissions(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const spaces = await SpaceResource.listWorkspaceSpaces(auth, {
    includeConversationsSpace: true,
    includeProjectSpaces: true,
  });

  await concurrentExecutor(
    spaces,
    async (space) => {
      const desiredGrants = space
        .getAccessControlLists(auth)
        .flatMap((permission) => permission.groups ?? [])
        .map((grant) => ({
          groupId: grant.id,
          permissions: grant.permissions,
        }));

      if (!execute) {
        logger.info(
          {
            workspaceId: workspace.sId,
            spaceId: space.sId,
            kind: space.kind,
            desiredGrants,
          },
          "Dry-run: would reconcile space group permissions"
        );
        return;
      }

      // One transaction per space so a space is never left without its grants mid-reconcile.
      await frontSequelize.transaction(async (transaction) => {
        await space.writeGroupPermissions(auth, {
          ...(await space.fetchAssociatedGroups(transaction)),
          transaction,
        });
      });

      logger.info(
        {
          workspaceId: workspace.sId,
          spaceId: space.sId,
          kind: space.kind,
          grantCount: desiredGrants.length,
        },
        "Reconciled space group permissions"
      );
    },
    { concurrency: SPACE_CONCURRENCY }
  );
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting space group_permissions backfill");

    await runOnAllWorkspaces(
      async (workspace) => {
        await backfillWorkspaceSpaceGroupPermissions(
          execute,
          logger,
          workspace
        );
      },
      { concurrency: WORKSPACE_CONCURRENCY, wId }
    );

    logger.info("Space group_permissions backfill completed");
  }
);
