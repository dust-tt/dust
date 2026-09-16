import { Authenticator } from "@app/lib/auth";
import { AgentModel } from "@app/lib/models/agent/agent";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import { QueryTypes } from "sequelize";

const DEFAULT_BATCH_SIZE = 1_000;

// Agents whose `currentVersion` is not their highest configuration version: every agent that was
// upgraded before the column existed (the default 0 is right for the others). The unique
// (agentId, version) index serves the LATERAL lookup.
const SELECT_STALE_AGENT_IDS_SQL = `
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

// Idempotent: an agent already at its highest version is not rewritten, and `updatedAt` is left
// untouched.
const UPDATE_BATCH_SQL = `
  UPDATE agents AS agent
  SET "currentVersion" = latest.version
  FROM (
    SELECT "agentId", MAX(version) AS version
    FROM agent_configurations
    WHERE "workspaceId" = :workspaceId
      AND "agentId" IN (:agentIds)
    GROUP BY "agentId"
  ) AS latest
  WHERE agent."workspaceId" = :workspaceId
    AND agent.id = latest."agentId"
    AND agent."currentVersion" <> latest.version
`;

// Identities without any configuration violate `agent-current-version-pointer`; they are
// leftovers of hard deletes that removed every configuration row without the identity.
const SELECT_ORPHAN_AGENT_IDS_SQL = `
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

type MigrationWorkspace = Pick<LightWorkspaceType, "id" | "sId">;

export type AgentCurrentVersionBackfillStats = {
  agentsToPoint: number;
  updated: number;
  orphanIdentities: number;
  orphanIdentitiesDeleted: number;
};

async function selectAgentIds(
  sql: string,
  workspace: MigrationWorkspace
): Promise<number[]> {
  const rows = await frontSequelize.query<{ id: number }>(sql, {
    replacements: { workspaceId: workspace.id },
    type: QueryTypes.SELECT,
  });

  return rows.map(({ id }) => id);
}

async function deleteOrphanIdentities(
  workspace: MigrationWorkspace,
  agentModelIds: number[]
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
    for (const grantGroup of grantGroups) {
      const deleteResult = await grantGroup.delete(auth, { transaction });
      if (deleteResult.isErr()) {
        throw deleteResult.error;
      }
    }

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

  const [staleAgentIds, orphanAgentIds] = await Promise.all([
    selectAgentIds(SELECT_STALE_AGENT_IDS_SQL, workspace),
    selectAgentIds(SELECT_ORPHAN_AGENT_IDS_SQL, workspace),
  ]);
  const stats: AgentCurrentVersionBackfillStats = {
    agentsToPoint: staleAgentIds.length,
    updated: 0,
    orphanIdentities: orphanAgentIds.length,
    orphanIdentitiesDeleted: 0,
  };

  let batch = 0;
  for (let offset = 0; offset < staleAgentIds.length; offset += batchSize) {
    const agentIds = staleAgentIds.slice(offset, offset + batchSize);
    batch += 1;

    if (!execute) {
      continue;
    }

    const [, updated] = await frontSequelize.query(UPDATE_BATCH_SQL, {
      replacements: { workspaceId: workspace.id, agentIds },
      type: QueryTypes.UPDATE,
    });
    stats.updated += updated;

    logger.info(
      {
        workspaceId: workspace.sId,
        batch,
        agentCount: agentIds.length,
        updated,
        totalUpdated: stats.updated,
      },
      "Backfilled agent current version batch"
    );
  }

  if (execute) {
    for (let offset = 0; offset < orphanAgentIds.length; offset += batchSize) {
      const agentModelIds = orphanAgentIds.slice(offset, offset + batchSize);
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
      selectAgentIds(SELECT_STALE_AGENT_IDS_SQL, workspace),
      selectAgentIds(SELECT_ORPHAN_AGENT_IDS_SQL, workspace),
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
