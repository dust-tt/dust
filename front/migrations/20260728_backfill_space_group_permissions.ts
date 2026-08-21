import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import type { Transaction } from "sequelize";

const WORKSPACE_CONCURRENCY = 2;
const SPACE_CONCURRENCY = 4;

// The space's groups split into `members` and `editors` (the shape `writeGroupPermissions`
// expects), read directly from the legacy `group_vaults` associations that this backfill derives
// grants from. The project viewer group (the workspace global group, kind `project_viewer`) goes in
// `members`, since only editors need to be told apart.
async function fetchAssociatedGroups(
  auth: Authenticator,
  space: SpaceResource,
  transaction: Transaction
): Promise<{ members: GroupResource[]; editors: GroupResource[] }> {
  const groupSpaces = await GroupSpaceModel.findAll({
    where: {
      vaultId: space.id,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    transaction,
  });

  const memberGroupIds = groupSpaces
    .filter((gs) => gs.kind === "member" || gs.kind === "project_viewer")
    .map((gs) => gs.groupId);
  const editorGroupIds = groupSpaces
    .filter((gs) => gs.kind === "project_editor")
    .map((gs) => gs.groupId);

  const [members, editors] = await Promise.all([
    GroupResource.fetchByModelIds(auth, memberGroupIds, { transaction }),
    GroupResource.fetchByModelIds(auth, editorGroupIds, { transaction }),
  ]);

  return { members, editors };
}

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
          ...(await fetchAssociatedGroups(auth, space, transaction)),
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
