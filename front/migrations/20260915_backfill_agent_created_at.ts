import { frontSequelize } from "@app/lib/resources/storage";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import { QueryTypes } from "sequelize";

const DEFAULT_BATCH_SIZE = 1_000;

// Identities created by 20260828_backfill_agent_identities carry that backfill's date, which is
// later than the agent's first configuration. Agents created since then were inserted in the same
// transaction as their first configuration and are never selected here.
const SELECT_LATE_AGENT_MODEL_IDS_SQL = `
  SELECT agent.id
  FROM agents AS agent
  JOIN agent_configurations AS configuration
    ON configuration."agentId" = agent.id
  WHERE agent."workspaceId" = :workspaceId
  GROUP BY agent.id
  HAVING agent."createdAt" > MIN(configuration."createdAt")
  ORDER BY agent.id
`;

// The date comparison makes the update idempotent: an agent already at or before its first
// configuration's date is not rewritten, and `updatedAt` is left untouched.
const UPDATE_BATCH_SQL = `
  UPDATE agents AS agent
  SET "createdAt" = first_configuration."createdAt"
  FROM (
    SELECT "agentId", MIN("createdAt") AS "createdAt"
    FROM agent_configurations
    WHERE "workspaceId" = :workspaceId
      AND "agentId" IN (:agentModelIds)
    GROUP BY "agentId"
  ) AS first_configuration
  WHERE agent."workspaceId" = :workspaceId
    AND agent.id = first_configuration."agentId"
    AND agent."createdAt" > first_configuration."createdAt"
`;

type MigrationWorkspace = Pick<LightWorkspaceType, "id" | "sId">;

export type AgentCreatedAtBackfillStats = {
  agentsToFix: number;
  updated: number;
};

async function selectLateAgentModelIds(
  workspace: MigrationWorkspace
): Promise<number[]> {
  const rows = await frontSequelize.query<{ id: number }>(
    SELECT_LATE_AGENT_MODEL_IDS_SQL,
    {
      replacements: { workspaceId: workspace.id },
      type: QueryTypes.SELECT,
    }
  );

  return rows.map(({ id }) => id);
}

/**
 * Aligns `agents.createdAt` with the creation date of each agent's first configuration, so that
 * the head row carries the logical agent's creation date rather than the identity backfill's.
 */
export async function backfillAgentCreatedAt({
  execute,
  logger,
  workspace,
  batchSize = DEFAULT_BATCH_SIZE,
}: {
  execute: boolean;
  logger: Logger;
  workspace: MigrationWorkspace;
  batchSize?: number;
}): Promise<AgentCreatedAtBackfillStats> {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("batchSize must be a positive integer");
  }

  const lateAgentModelIds = await selectLateAgentModelIds(workspace);
  const stats: AgentCreatedAtBackfillStats = {
    agentsToFix: lateAgentModelIds.length,
    updated: 0,
  };

  let batch = 0;
  for (let offset = 0; offset < lateAgentModelIds.length; offset += batchSize) {
    const agentModelIds = lateAgentModelIds.slice(offset, offset + batchSize);
    batch += 1;

    if (!execute) {
      continue;
    }

    const [, updated] = await frontSequelize.query(UPDATE_BATCH_SQL, {
      replacements: { workspaceId: workspace.id, agentModelIds },
      type: QueryTypes.UPDATE,
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
      "Backfilled agent createdAt batch"
    );
  }

  if (execute) {
    const remaining = await selectLateAgentModelIds(workspace);
    if (remaining.length > 0) {
      throw new Error(
        `Workspace ${workspace.sId} still has ${remaining.length} agents created after their first configuration.`
      );
    }
  }

  logger.info(
    { workspaceId: workspace.sId, execute, batch, ...stats },
    "Agent createdAt backfill completed for workspace"
  );
  return stats;
}

// Only run when executed directly: the test imports `backfillAgentCreatedAt` from this module.
if (process.argv[1]?.endsWith("20260915_backfill_agent_created_at.ts")) {
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
          await backfillAgentCreatedAt({
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
