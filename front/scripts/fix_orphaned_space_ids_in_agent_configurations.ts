import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";
import { QueryTypes } from "sequelize";

interface AgentWithOrphanedSpaces {
  id: number;
  sId: string;
  version: number;
  createdAt: Date;
  workspaceId: number;
  allRequestedSpaceIds: number[];
  orphanedSpaceIds: number[];
}

makeScript({}, async ({ execute }, logger) => {
  // Find all agent configurations with orphaned space IDs
  const agentsWithOrphanedSpaces =
    // biome-ignore lint/plugin/noRawSql: script uses raw SQL for complex query
    await frontSequelize.query<AgentWithOrphanedSpaces>(
      `
      WITH agent_with_orphaned_spaces AS (
        SELECT 
          ac.id,
          ac."sId",
          ac.version,
          ac."createdAt",
          ac."workspaceId",
          ac."requestedSpaceIds" AS "allRequestedSpaceIds",
          array_agg(DISTINCT orphaned_id) AS "orphanedSpaceIds"
        FROM agent_configurations ac
        CROSS JOIN LATERAL unnest(ac."requestedSpaceIds") AS orphaned_id
        WHERE NOT EXISTS (
          SELECT 1 
          FROM vaults v 
          WHERE v.id = orphaned_id AND v."deletedAt" IS NULL
        )
        AND ac.status = 'active'
        GROUP BY ac.id, ac."sId", ac.version, ac."workspaceId", ac."requestedSpaceIds"
      )
      SELECT * FROM agent_with_orphaned_spaces
      ORDER BY "workspaceId", "sId", version
      `,
      { type: QueryTypes.SELECT }
    );

  const totalCount = agentsWithOrphanedSpaces.length;

  logger.info(
    { totalCount, execute },
    execute
      ? `Found ${totalCount} agent configurations with orphaned space IDs`
      : `Would fix ${totalCount} agent configurations with orphaned space IDs (dry run)`
  );

  if (totalCount === 0) {
    logger.info("No agent configurations to fix");
    return;
  }

  let updatedCount = 0;
  let errorCount = 0;

  for (const agent of agentsWithOrphanedSpaces) {
    // Filter out orphaned space IDs
    // orphanedSpaceIds should never be null due to the query, but handle it safely
    const orphanedIds = agent.orphanedSpaceIds || [];
    const validSpaceIds = agent.allRequestedSpaceIds.filter(
      (spaceId) => !orphanedIds.includes(spaceId)
    );

    logger.info(
      {
        agentId: agent.sId,
        agentVersion: agent.version,
        workspaceId: agent.workspaceId,
        originalSpaceIds: agent.allRequestedSpaceIds,
        orphanedSpaceIds: orphanedIds,
        newSpaceIds: validSpaceIds,
        execute,
      },
      execute
        ? "Updating agent configuration to remove orphaned space IDs"
        : "[DRY RUN] Would update agent configuration to remove orphaned space IDs"
    );

    if (execute) {
      try {
        await AgentConfigurationModel.update(
          {
            requestedSpaceIds: validSpaceIds,
          },
          {
            where: {
              id: agent.id,
              workspaceId: agent.workspaceId,
            },
            hooks: false,
            silent: true,
          }
        );
        updatedCount++;
      } catch (error) {
        logger.error(
          {
            agentId: agent.sId,
            agentVersion: agent.version,
            error: error instanceof Error ? error.message : String(error),
          },
          "Failed to update agent configuration"
        );
        errorCount++;
      }
    } else {
      updatedCount++;
    }
  }

  logger.info(
    {
      totalCount,
      updated: updatedCount,
      errors: errorCount,
      execute,
    },
    execute
      ? `Migration completed: updated ${updatedCount} agent configurations`
      : `Dry run completed: would have updated ${totalCount} agent configurations`
  );
});
