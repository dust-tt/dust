/**
 * Backfill existing `regular` group kinds to `regular_auto`.
 *
 * Idempotent: workspaces with no remaining `regular` groups are skipped.
 *
 */

import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ModelId } from "@app/types/shared/model_id";
import { Op } from "sequelize";

// Number of group ids rewritten per SQL update.
const BATCH_SIZE = 500;
// Number of workspaces processed in parallel.
const WORKSPACE_CONCURRENCY = 2;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Backfill helper for the `regular` -> `regular_auto` rename.
async function updateKindToRegularAutoByIds({
  workspaceId,
  groupModelIds,
}: {
  workspaceId: ModelId;
  groupModelIds: ModelId[];
}): Promise<number> {
  if (groupModelIds.length === 0) {
    return 0;
  }

  const [affectedCount] = await GroupModel.update(
    { kind: "regular_auto" },
    { where: { workspaceId, id: { [Op.in]: groupModelIds } } }
  );

  return affectedCount;
}

makeScript(
  {
    fromWorkspaceId: {
      type: "number",
      required: false,
      description: "Resume from this workspace model id (inclusive).",
    },
  },
  async ({ execute, fromWorkspaceId }, logger) => {
    let totalWorkspacesWithLegacyGroups = 0;
    let totalUpdated = 0;

    await runOnAllWorkspaces(
      async (workspace) => {
        const legacyGroups =
          await GroupResource.internalFetchAllWorkspaceGroups({
            workspaceId: workspace.id,
            groupKinds: ["regular"],
          });

        if (legacyGroups.length === 0) {
          return;
        }

        totalWorkspacesWithLegacyGroups++;

        const groupModelIds = legacyGroups.map((g) => g.id);

        if (!execute) {
          logger.info(
            {
              workspaceId: workspace.sId,
              workspaceModelId: workspace.id,
              count: groupModelIds.length,
            },
            "[DRY-RUN] Would rewrite regular groups to regular_auto"
          );
          totalUpdated += groupModelIds.length;
          return;
        }

        let updatedForWorkspace = 0;
        const batches: ModelId[][] = chunkArray(groupModelIds, BATCH_SIZE);
        for (const batch of batches) {
          updatedForWorkspace += await updateKindToRegularAutoByIds({
            workspaceId: workspace.id,
            groupModelIds: batch,
          });
        }

        // The system-key group cache stores each group's kind; invalidate it so
        // it does not serve stale `regular` values until its TTL expires.
        await GroupResource.invalidateWorkspaceGroupsFromSystemKeyCache(
          workspace.id
        );

        totalUpdated += updatedForWorkspace;

        logger.info(
          {
            workspaceId: workspace.sId,
            workspaceModelId: workspace.id,
            count: updatedForWorkspace,
          },
          "Rewrote regular groups to regular_auto"
        );
      },
      { concurrency: WORKSPACE_CONCURRENCY, fromWorkspaceId }
    );

    logger.info(
      {
        execute,
        totalWorkspacesWithLegacyGroups,
        totalUpdated,
      },
      execute
        ? "Backfill complete"
        : "[DRY-RUN] Backfill summary (no changes written)"
    );
  }
);
