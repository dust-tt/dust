/*
import { QueryTypes } from "sequelize";

import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const WORKSPACE_CONCURRENCY = 8;
*/

/**
 * Backfill: give every active, non-system, builder-role API key membership in its
 * workspace's manual "Builders" group (MANUAL_BUILDERS_GROUP_NAME), so existing keys keep
 * their effective access once agent-edit authorization moves off `ensureIsBuilder()` onto
 * the `agent:editor` (write) capability. Keys created (or role-changed) after this deploy
 * are kept in sync by `KeyResource.syncBuilderGroupMembership`, called from the key
 * creation route and `KeyResource.updateRole`. See dust-tt/tasks#9710.
 */

/*
async function reconcileWorkspace(
  workspaceModelId: number,
  execute: boolean,
  logger: Logger
): Promise<{ added: number }> {
  const [workspace] = await WorkspaceResource.fetchByModelIds([
    workspaceModelId,
  ]);
  if (!workspace) {
    logger.warn({ workspaceModelId }, "Workspace not found, skipping");
    return { added: 0 };
  }
  const lightWorkspace = renderLightWorkspaceType({ workspace });

  const keys = await KeyResource.listNonSystemKeysByWorkspace(lightWorkspace);
  const builderKeys = keys.filter(
    (key) => key.isActive && key.role === "builder"
  );
  if (builderKeys.length === 0) {
    return { added: 0 };
  }

  // Don't create the group on a dry run: existence-only lookup first, only falling back
  // to fetchOrCreateManualBuildersGroup once we know we're about to mutate.
  const existingGroup =
    await GroupResource.fetchManualBuildersGroup(lightWorkspace);
  const toSync = existingGroup
    ? builderKeys.filter((key) => !key.groupIds.includes(existingGroup.id))
    : builderKeys;
  if (toSync.length === 0) {
    return { added: 0 };
  }

  logger.info(
    { workspaceId: workspace.sId, count: toSync.length, execute },
    execute
      ? "Adding keys to Builders group"
      : "Would add keys to Builders group (dry run)"
  );
  if (!execute) {
    return { added: toSync.length };
  }

  const group =
    existingGroup ??
    (await GroupResource.fetchOrCreateManualBuildersGroup(lightWorkspace));
  for (const key of toSync) {
    await key.setGroupMembership({ group, isMember: true });
  }

  return { added: toSync.length };
}

makeScript({}, async ({ execute }, logger) => {
  const candidates = await frontSequelize.query<{ workspaceId: number }>(
    `SELECT DISTINCT "workspaceId" FROM keys
     WHERE role = 'builder' AND status = 'active' AND "isSystem" = false`,
    { type: QueryTypes.SELECT }
  );

  logger.info({ count: candidates.length }, "Found candidate workspaces");

  const results = await concurrentExecutor(
    candidates,
    (candidate) => reconcileWorkspace(candidate.workspaceId, execute, logger),
    { concurrency: WORKSPACE_CONCURRENCY }
  );

  const added = results.reduce((sum, r) => sum + r.added, 0);
  const touchedWorkspaces = results.filter((r) => r.added > 0).length;

  logger.info(
    { workspaces: touchedWorkspaces, added, execute },
    execute
      ? "Builder key group backfill complete"
      : "Builder key group backfill dry run complete"
  );
});
*/
