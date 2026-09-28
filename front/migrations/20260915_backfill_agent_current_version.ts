// @ts-nocheck - Legacy migration kept for reference; it uses removed agent editor group APIs.
import { Authenticator } from "@app/lib/auth";
import { AgentModel } from "@app/lib/models/agent/agent";
import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import type { Transaction } from "sequelize";
import { QueryTypes } from "sequelize";

const DEFAULT_BATCH_SIZE = 1_000;

// Agents whose `currentVersion` is not their highest configuration version: every agent that was
// upgraded before the column existed (the default 0 is right for the others). The unique
// (agentId, version) index serves the LATERAL lookup.
const SELECT_STALE_AGENT_MODEL_IDS_SQL = `
  SELECT agent.id
  FROM agents AS agent
  INNER JOIN LATERAL (
    SELECT configuration.version
    FROM agent_configurations AS configuration
    WHERE configuration."agentId" = agent.id
    ORDER BY configuration.version DESC
    LIMIT 1
  ) AS latest ON true
  WHERE agent."workspaceId" = :workspaceId
    AND agent."currentVersion" <> latest.version
  ORDER BY agent.id
`;

// Locks the batch's identity rows before their highest version is computed, in the same
// transaction as the update below. A concurrent upgrade takes that same row lock (through
// `AgentResource.setCurrentConfiguration`) after inserting its new version, so it either commits
// before the maximum is computed, or waits for this transaction and then overwrites the pointer
// with its own, higher version. Without the lock the update could snapshot a stale maximum and
// commit it over a newer pointer. Locking `agents` first is safe here, unlike a transaction that
// deletes `agent_configurations` rows before locking `agents`: this transaction only reads
// `agent_configurations`, so it never waits on a row the upgrade holds.
const LOCK_AGENTS_SQL = `
  SELECT agent.id
  FROM agents AS agent
  WHERE agent."workspaceId" = :workspaceId
    AND agent.id IN (:agentModelIds)
  ORDER BY agent.id
  FOR UPDATE
`;

// Idempotent: an agent already at its highest version is not rewritten, and `updatedAt` is left
// untouched.
const UPDATE_BATCH_SQL = `
  UPDATE agents AS agent
  SET "currentVersion" = latest.version
  FROM (
    SELECT "agentId", MAX(version) AS version
    FROM agent_configurations
    WHERE "workspaceId" = :workspaceId
      AND "agentId" IN (:agentModelIds)
    GROUP BY "agentId"
  ) AS latest
  WHERE agent."workspaceId" = :workspaceId
    AND agent.id = latest."agentId"
    AND agent."currentVersion" <> latest.version
`;

// Identities without any configuration violate `agent-current-version-pointer`; they are
// leftovers of hard deletes that removed every configuration row without the identity.
const SELECT_ORPHAN_AGENT_MODEL_IDS_SQL = `
  SELECT agent.id
  FROM agents AS agent
  WHERE agent."workspaceId" = :workspaceId
    AND NOT EXISTS (
      SELECT 1
      FROM agent_configurations AS configuration
      WHERE configuration."agentId" = agent.id
    )
  ORDER BY agent.id
`;

// Drops the batch's group ids from every API key that carries one, in one statement (the
// per-group `array_remove` of `GroupResource.delete` would be one statement per group).
const REMOVE_GROUPS_FROM_KEYS_SQL = `
  UPDATE keys
  SET "groupIds" = ARRAY(
    SELECT "groupId"
    FROM unnest("groupIds") AS "groupId"
    WHERE "groupId" <> ALL(ARRAY[:groupModelIds]::bigint[])
  )
  WHERE "workspaceId" = :workspaceId
    AND "groupIds" && ARRAY[:groupModelIds]::bigint[]
`;

type MigrationWorkspace = Pick<LightWorkspaceType, "id" | "sId">;

export type AgentCurrentVersionBackfillStats = {
  agentsToPoint: number;
  updated: number;
  orphanIdentities: number;
  orphanIdentitiesDeleted: number;
};

async function selectAgentModelIds(
  sql: string,
  workspace: MigrationWorkspace
): Promise<ModelId[]> {
  const rows = await frontSequelize.query<{ id: ModelId }>(sql, {
    replacements: { workspaceId: workspace.id },
    type: QueryTypes.SELECT,
  });

  return rows.map(({ id }) => id);
}

// Batched counterpart of `GroupResource.delete`, which runs six statements per group: the orphan
// identities of a workspace are cleaned up in a fixed number of statements instead.
async function deleteGroups(
  workspace: MigrationWorkspace,
  groupModelIds: ModelId[],
  transaction: Transaction
): Promise<void> {
  if (groupModelIds.length === 0) {
    return;
  }

  const memberships = await GroupMembershipModel.findAll({
    where: { groupId: groupModelIds, workspaceId: workspace.id },
    attributes: ["userId"],
    transaction,
  });

  await frontSequelize.query(REMOVE_GROUPS_FROM_KEYS_SQL, {
    replacements: { workspaceId: workspace.id, groupModelIds },
    type: QueryTypes.UPDATE,
    transaction,
  });

  await GroupAgentModel.destroy({
    where: { groupId: groupModelIds, workspaceId: workspace.id },
    transaction,
  });
  await GroupMembershipModel.destroy({
    where: { groupId: groupModelIds, workspaceId: workspace.id },
    transaction,
  });
  await GroupPermissionModel.destroy({
    where: { groupId: groupModelIds, workspaceId: workspace.id },
    transaction,
  });
  await GroupModel.destroy({
    where: { id: groupModelIds, workspaceId: workspace.id },
    transaction,
  });

  const memberUserModelIds = [
    ...new Set(memberships.map(({ userId }) => userId)),
  ];
  invalidateCacheAfterCommit(transaction, async () => {
    if (memberUserModelIds.length > 0) {
      await GroupResource.batchInvalidateGroupIdsCacheForUsers(
        memberUserModelIds.map((userId) => [
          { user: { id: userId }, workspace: { id: workspace.id } },
        ])
      );
    }
    await GroupResource.invalidateWorkspaceGroupsFromSystemKeyCache(
      workspace.id
    );
  });
}

async function deleteOrphanIdentities(
  workspace: MigrationWorkspace,
  agentModelIds: ModelId[]
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  await withTransaction(async (transaction) => {
    const grantGroups =
      await GroupPermissionResource.listRegularAutoGroupsForResources(auth, {
        resourceType: "agent",
        resourceIds: agentModelIds,
        transaction,
      });
    await GroupPermissionResource.deleteAllForResources(auth, {
      resourceType: "agent",
      resourceIds: agentModelIds,
      transaction,
    });
    await deleteGroups(
      workspace,
      grantGroups.map((grantGroup) => grantGroup.id),
      transaction
    );

    await AgentModel.destroy({
      where: { id: agentModelIds, workspaceId: workspace.id },
      transaction,
    });
  });
}

/**
 * Sets `agents.currentVersion` to the highest configuration version of each agent and removes
 * identities that have no configuration at all.
 */
export async function backfillAgentCurrentVersion({
  execute,
  logger,
  workspace,
  batchSize = DEFAULT_BATCH_SIZE,
}: {
  execute: boolean;
  logger: Logger;
  workspace: MigrationWorkspace;
  batchSize?: number;
}): Promise<AgentCurrentVersionBackfillStats> {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("batchSize must be a positive integer");
  }

  const [staleAgentModelIds, orphanAgentModelIds] = await Promise.all([
    selectAgentModelIds(SELECT_STALE_AGENT_MODEL_IDS_SQL, workspace),
    selectAgentModelIds(SELECT_ORPHAN_AGENT_MODEL_IDS_SQL, workspace),
  ]);
  const stats: AgentCurrentVersionBackfillStats = {
    agentsToPoint: staleAgentModelIds.length,
    updated: 0,
    orphanIdentities: orphanAgentModelIds.length,
    orphanIdentitiesDeleted: 0,
  };

  let batch = 0;
  for (
    let offset = 0;
    offset < staleAgentModelIds.length;
    offset += batchSize
  ) {
    const agentModelIds = staleAgentModelIds.slice(offset, offset + batchSize);
    batch += 1;

    if (!execute) {
      continue;
    }

    const updated = await withTransaction(async (transaction) => {
      await frontSequelize.query(LOCK_AGENTS_SQL, {
        replacements: { workspaceId: workspace.id, agentModelIds },
        type: QueryTypes.SELECT,
        transaction,
      });

      const [, updatedCount] = await frontSequelize.query(UPDATE_BATCH_SQL, {
        replacements: { workspaceId: workspace.id, agentModelIds },
        type: QueryTypes.UPDATE,
        transaction,
      });

      return updatedCount;
    });
    stats.updated += updated;

    logger.info(
      {
        workspaceId: workspace.sId,
        batch,
        agentCount: agentModelIds.length,
        updated,
        totalUpdated: stats.updated,
      },
      "Backfilled agent current version batch"
    );
  }

  if (execute) {
    for (
      let offset = 0;
      offset < orphanAgentModelIds.length;
      offset += batchSize
    ) {
      const agentModelIds = orphanAgentModelIds.slice(
        offset,
        offset + batchSize
      );
      await deleteOrphanIdentities(workspace, agentModelIds);
      stats.orphanIdentitiesDeleted += agentModelIds.length;
      logger.info(
        {
          workspaceId: workspace.sId,
          agentModelIds,
          totalDeleted: stats.orphanIdentitiesDeleted,
        },
        "Deleted orphan agent identities"
      );
    }

    const [remainingStale, remainingOrphans] = await Promise.all([
      selectAgentModelIds(SELECT_STALE_AGENT_MODEL_IDS_SQL, workspace),
      selectAgentModelIds(SELECT_ORPHAN_AGENT_MODEL_IDS_SQL, workspace),
    ]);
    if (remainingStale.length > 0 || remainingOrphans.length > 0) {
      throw new Error(
        `Workspace ${workspace.sId} still has ${remainingStale.length} agents not at their highest version and ${remainingOrphans.length} identities without configuration.`
      );
    }
  }

  logger.info(
    { workspaceId: workspace.sId, execute, batch, ...stats },
    "Agent current version backfill completed for workspace"
  );
  return stats;
}

if (process.argv[1]?.endsWith("20260915_backfill_agent_current_version.ts")) {
  makeScript(
    {
      wId: { type: "string", required: false },
      batchSize: {
        type: "number",
        default: DEFAULT_BATCH_SIZE,
        description: "Maximum number of agents updated per statement",
      },
    },
    async ({ execute, wId, batchSize }, logger) => {
      await runOnAllWorkspaces(
        async (workspace) => {
          await backfillAgentCurrentVersion({
            execute,
            logger,
            workspace,
            batchSize,
          });
        },
        { concurrency: 4, wId }
      );
    }
  );
}
