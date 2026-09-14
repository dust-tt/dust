import {
  AgentConfigurationModel,
  AgentModel,
} from "@app/lib/models/agent/agent";
import { frontSequelize } from "@app/lib/resources/storage";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import { Op, QueryTypes } from "sequelize";

const DEFAULT_BATCH_SIZE = 1_000;

// Applying the null check after grouping makes PostgreSQL scan one workspace once instead of
// walking a global index to find matching configurations for every batch.
const SELECT_MISSING_AGENT_IDS_SQL = `
  SELECT "sId"
  FROM agent_configurations
  WHERE "workspaceId" = :workspaceId
  GROUP BY "sId"
  HAVING BOOL_OR("agentId" IS NULL)
`;

const UPDATE_BATCH_SQL = `
  UPDATE agent_configurations AS configuration
  SET "agentId" = agent.id
  FROM agents AS agent
  WHERE configuration."workspaceId" = :workspaceId
    AND configuration."agentId" IS NULL
    AND configuration."sId" IN (:agentIds)
    AND agent."workspaceId" = configuration."workspaceId"
    AND agent."sId" = configuration."sId"
`;

type MigrationWorkspace = Pick<LightWorkspaceType, "id" | "sId">;

export type AgentIdentityBackfillStats = {
  logicalAgentCount: number;
  identitiesToCreate: number;
  versionsToAttach: number;
  orphanIdentityCount: number;
};

async function validateIdentityLinks(workspace: MigrationWorkspace) {
  const [invalidLink] = await frontSequelize.query<{ sId: string }>(
    `
      SELECT configuration."sId"
      FROM agent_configurations AS configuration
      INNER JOIN agents AS agent ON agent.id = configuration."agentId"
      WHERE configuration."workspaceId" = :workspaceId
        AND (
          agent."workspaceId" != configuration."workspaceId"
          OR agent."sId" != configuration."sId"
        )
      LIMIT 1
    `,
    {
      replacements: { workspaceId: workspace.id },
      type: QueryTypes.SELECT,
    }
  );
  if (invalidLink) {
    throw new Error(
      `Agent ${invalidLink.sId} is linked to an invalid identity.`
    );
  }
}

async function getBackfillStats(
  workspace: MigrationWorkspace
): Promise<AgentIdentityBackfillStats> {
  const [logicalAgentCount, versionsToAttach, [{ count }]] = await Promise.all([
    AgentConfigurationModel.count({
      where: { workspaceId: workspace.id },
      distinct: true,
      col: "sId",
    }),
    AgentConfigurationModel.count({
      // @ts-expect-error This historical backfill predates the non-null agentId constraint.
      where: { workspaceId: workspace.id, agentId: null },
    }),
    frontSequelize.query<{ count: string }>(
      `
          SELECT COUNT(*) AS count
          FROM agents AS agent
          WHERE agent."workspaceId" = :workspaceId
            AND NOT EXISTS (
              SELECT 1
              FROM agent_configurations AS configuration
              WHERE configuration."workspaceId" = agent."workspaceId"
                AND configuration."sId" = agent."sId"
            )
        `,
      {
        replacements: { workspaceId: workspace.id },
        type: QueryTypes.SELECT,
      }
    ),
  ]);

  return {
    logicalAgentCount,
    identitiesToCreate: 0,
    // @ts-expect-error This count targets the historical nullable agentId schema.
    versionsToAttach,
    orphanIdentityCount: Number(count),
  };
}

/**
 * Backfills the stable numeric identity shared by every version of an agent. Each batch first
 * creates missing rows in `agents`, then uses their generated IDs to fill
 * `agent_configurations.agentId` for all matching versions.
 */
export async function backfillAgentIdentities({
  execute,
  logger,
  workspace,
  batchSize = DEFAULT_BATCH_SIZE,
}: {
  execute: boolean;
  logger: Logger;
  workspace: MigrationWorkspace;
  batchSize?: number;
}): Promise<AgentIdentityBackfillStats> {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("batchSize must be a positive integer");
  }

  await validateIdentityLinks(workspace);
  const stats = await getBackfillStats(workspace);
  const rows = await frontSequelize.query<{ sId: string }>(
    SELECT_MISSING_AGENT_IDS_SQL,
    {
      replacements: { workspaceId: workspace.id },
      type: QueryTypes.SELECT,
    }
  );

  let batch = 0;
  let totalUpdated = 0;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const agentIds = rows
      .slice(offset, offset + batchSize)
      .map(({ sId }) => sId);
    const existingIdentities = await AgentModel.findAll({
      where: {
        workspaceId: workspace.id,
        sId: { [Op.in]: agentIds },
      },
      attributes: ["sId"],
    });
    const existingAgentIds = new Set(existingIdentities.map(({ sId }) => sId));
    const missingAgentIds = agentIds.filter(
      (agentId) => !existingAgentIds.has(agentId)
    );
    stats.identitiesToCreate += missingAgentIds.length;

    if (!execute) {
      continue;
    }

    const updated = await withTransaction(async (transaction) => {
      if (missingAgentIds.length > 0) {
        await AgentModel.bulkCreate(
          missingAgentIds.map((sId) => ({ sId, workspaceId: workspace.id })),
          { ignoreDuplicates: true, transaction }
        );
      }

      // A joined update attaches all versions in the batch without changing their updatedAt.
      const [, updatedCount] = await frontSequelize.query(UPDATE_BATCH_SQL, {
        replacements: { workspaceId: workspace.id, agentIds },
        transaction,
        type: QueryTypes.UPDATE,
      });
      return updatedCount;
    });

    batch += 1;
    totalUpdated += updated;
    logger.info(
      {
        workspaceId: workspace.sId,
        batch,
        agentCount: agentIds.length,
        updated,
        totalUpdated,
      },
      "Backfilled agent identity batch"
    );
  }

  if (execute) {
    const missingIdentityCount = await AgentConfigurationModel.count({
      // @ts-expect-error This historical backfill predates the non-null agentId constraint.
      where: { workspaceId: workspace.id, agentId: null },
    });
    // @ts-expect-error This count targets the historical nullable agentId schema.
    if (missingIdentityCount > 0) {
      throw new Error(
        `Workspace ${workspace.sId} still has ${missingIdentityCount} versions without an identity.`
      );
    }
  }

  logger.info(
    { workspaceId: workspace.sId, execute, batch, totalUpdated, ...stats },
    "Agent identity backfill completed for workspace"
  );
  return stats;
}

if (process.argv[1]?.endsWith("20260828_backfill_agent_identities.ts")) {
  makeScript(
    {
      wId: { type: "string", required: false },
      batchSize: {
        type: "number",
        default: DEFAULT_BATCH_SIZE,
        description: "Maximum number of agents updated per transaction",
      },
    },
    async ({ execute, wId, batchSize }, logger) => {
      await runOnAllWorkspaces(
        async (workspace) => {
          await backfillAgentIdentities({
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
