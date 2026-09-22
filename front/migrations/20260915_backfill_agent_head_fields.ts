import { frontSequelize } from "@app/lib/resources/storage";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import { QueryTypes } from "sequelize";

const DEFAULT_BATCH_SIZE = 1_000;

// Agents whose head fields differ from their current configuration's, including agents that
// predate the columns (NULL head fields).
const HEAD_FIELDS_DIFFER_SQL = `
  agent.name IS DISTINCT FROM configuration.name
  OR agent.status IS DISTINCT FROM configuration.status
  OR agent.scope IS DISTINCT FROM configuration.scope
  OR agent.reinforcement IS DISTINCT FROM configuration.reinforcement
  OR agent."lastReinforcementAnalysisAt" IS DISTINCT FROM configuration."lastReinforcementAnalysisAt"
  OR agent."templateId" IS DISTINCT FROM configuration."templateId"
`;

const SELECT_STALE_AGENT_IDS_SQL = `
  SELECT agent.id
  FROM agents AS agent
  INNER JOIN agent_configurations AS configuration
    ON configuration."agentId" = agent.id
    AND configuration.version = agent."currentVersion"
  WHERE agent."workspaceId" = :workspaceId
    AND (${HEAD_FIELDS_DIFFER_SQL})
  ORDER BY agent.id
`;

// Idempotent: an agent whose head already equals its current configuration is not rewritten, and
// `updatedAt` is left untouched.
const UPDATE_BATCH_SQL = `
  UPDATE agents AS agent
  SET
    name = configuration.name,
    status = configuration.status,
    scope = configuration.scope,
    reinforcement = configuration.reinforcement,
    "lastReinforcementAnalysisAt" = configuration."lastReinforcementAnalysisAt",
    "templateId" = configuration."templateId"
  FROM agent_configurations AS configuration
  WHERE agent."workspaceId" = :workspaceId
    AND agent.id IN (:agentIds)
    AND configuration."agentId" = agent.id
    AND configuration.version = agent."currentVersion"
    AND (${HEAD_FIELDS_DIFFER_SQL})
`;

type MigrationWorkspace = Pick<LightWorkspaceType, "id" | "sId">;

export type AgentHeadFieldsBackfillStats = {
  agentsToFill: number;
  updated: number;
};

async function selectStaleAgentIds(
  workspace: MigrationWorkspace
): Promise<number[]> {
  const rows = await frontSequelize.query<{ id: number }>(
    SELECT_STALE_AGENT_IDS_SQL,
    {
      replacements: { workspaceId: workspace.id },
      type: QueryTypes.SELECT,
    }
  );

  return rows.map(({ id }) => id);
}

/**
 * Copies the head fields (`name`, `status`, `scope`, `reinforcement`, `lastReinforcementAnalysisAt`,
 * `templateId`) of each agent's current configuration onto its `agents`
 * row, so that they can be made NOT NULL and read from `agents`.
 */
export async function backfillAgentHeadFields({
  execute,
  logger,
  workspace,
  batchSize = DEFAULT_BATCH_SIZE,
}: {
  execute: boolean;
  logger: Logger;
  workspace: MigrationWorkspace;
  batchSize?: number;
}): Promise<AgentHeadFieldsBackfillStats> {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("batchSize must be a positive integer");
  }

  const staleAgentIds = await selectStaleAgentIds(workspace);
  const stats: AgentHeadFieldsBackfillStats = {
    agentsToFill: staleAgentIds.length,
    updated: 0,
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
      "Backfilled agent head fields batch"
    );
  }

  if (execute) {
    const remaining = await selectStaleAgentIds(workspace);
    if (remaining.length > 0) {
      throw new Error(
        `Workspace ${workspace.sId} still has ${remaining.length} agents whose head fields differ from their current configuration.`
      );
    }
  }

  logger.info(
    { workspaceId: workspace.sId, execute, batch, ...stats },
    "Agent head fields backfill completed for workspace"
  );
  return stats;
}

if (process.argv[1]?.endsWith("20260915_backfill_agent_head_fields.ts")) {
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
          await backfillAgentHeadFields({
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
