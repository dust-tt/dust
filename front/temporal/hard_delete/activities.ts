// biome-ignore-all lint/plugin/noRawSql: hard delete activities require raw SQL for cascade deletions
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { GroupResource } from "@app/lib/resources/group_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type {
  RunExecutionRow,
  RunsJoinsRow,
} from "@app/temporal/hard_delete/types";
import {
  getPendingAgentsDeletionCutoffDate,
  getRunExecutionsDeletionCutoffDate,
  isSequelizeForeignKeyConstraintError,
} from "@app/temporal/hard_delete/utils";
import { Context } from "@temporalio/activity";
import type { Sequelize } from "sequelize";
import { Op, QueryTypes } from "sequelize";

const BATCH_SIZE = 100;

export async function purgeExpiredRunExecutionsActivity() {
  const coreSequelize = getCorePrimaryDbConnection();

  const cutoffDate = getRunExecutionsDeletionCutoffDate();

  logger.info(
    {},
    `About to purge block and run executions anterior to ${new Date(
      cutoffDate
    ).toISOString()}.`
  );

  let hasMoreRunsToPurge = true;
  let runsPurgedCount = 0;
  do {
    // eslint-disable-next-line dust/no-raw-sql
    const batchToDelete = await coreSequelize.query<RunExecutionRow>(
      "SELECT id FROM runs WHERE created < :cutoffDate ORDER BY created, id ASC LIMIT :batchSize",
      {
        replacements: {
          batchSize: BATCH_SIZE,
          cutoffDate,
        },
        type: QueryTypes.SELECT,
      }
    );

    Context.current().heartbeat();

    logger.info(
      { batchSize: BATCH_SIZE },
      "Deleting batch of block executions."
    );

    hasMoreRunsToPurge = batchToDelete.length === BATCH_SIZE;
    runsPurgedCount += batchToDelete.length;

    await deleteRunExecutionBatch(coreSequelize, batchToDelete);
  } while (hasMoreRunsToPurge);

  logger.info({ runsPurgedCount }, "Done purging expired runs executions.");
}

async function deleteRunExecutionBatch(
  coreSequelize: Sequelize,
  runs: RunExecutionRow[]
) {
  if (runs.length === 0) {
    return;
  }

  const runIds = runs.map((r) => r.id);

  // eslint-disable-next-line dust/no-raw-sql
  const runsJoins = await coreSequelize.query<RunsJoinsRow>(
    "SELECT id, block_execution FROM runs_joins WHERE run IN (:runIds)",
    {
      replacements: {
        runIds,
      },
      type: QueryTypes.SELECT,
    }
  );

  // For legacy rows, runsJoins may be empty.
  if (runsJoins.length > 0) {
    // eslint-disable-next-line dust/no-raw-sql
    await coreSequelize.query(
      "DELETE FROM runs_joins WHERE id IN (:runsJoinsIds)",
      {
        replacements: {
          runsJoinsIds: runsJoins.map((rj) => rj.id),
        },
      }
    );

    // TODO(2024-06-13 flav) Remove once the schedule has completed at least once.
    // Previously, we had a cache shared between identical block executions.
    // Ensure we delete distinct run block executions.
    const blockExecutionIds = [
      ...new Set(runsJoins.map((rj) => rj.block_execution)),
    ];

    try {
      // eslint-disable-next-line dust/no-raw-sql
      await coreSequelize.query(
        "DELETE FROM block_executions WHERE id IN (:blockExecutionIds)",
        {
          replacements: {
            blockExecutionIds,
          },
        }
      );
    } catch (err) {
      if (isSequelizeForeignKeyConstraintError(err)) {
        logger.info({}, "Failed to delete runs joins");
      }
    }
  }

  // eslint-disable-next-line dust/no-raw-sql
  await coreSequelize.query("DELETE FROM runs WHERE id IN (:runIds)", {
    replacements: {
      runIds,
    },
  });
}

export async function purgeExpiredPendingAgentsActivity(
  batchSize: number = BATCH_SIZE
) {
  const cutoffDate = getPendingAgentsDeletionCutoffDate();

  logger.info(
    {},
    `About to purge pending agents created before ${cutoffDate.toISOString()}.`
  );

  const workspaces = await WorkspaceResource.listAll();

  let totalDeleted = 0;

  for (const workspace of workspaces) {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    let hasMore = true;
    do {
      const batch = await AgentConfigurationModel.findAll({
        where: {
          status: "pending",
          createdAt: { [Op.lt]: cutoffDate },
          workspaceId: workspace.id,
        },
        limit: batchSize,
        order: [["createdAt", "ASC"]],
      });

      hasMore = batch.length === batchSize;

      for (const agent of batch) {
        await withTransaction(async (t) => {
          const group = await GroupResource.fetchByAgentConfiguration({
            auth,
            agentConfiguration: agent,
            isDeletionFlow: true,
          });

          if (group) {
            await group.delete(auth, { transaction: t });
          }

          await agent.destroy({ transaction: t });
        });

        totalDeleted++;
      }

      Context.current().heartbeat();
    } while (hasMore);
  }

  logger.info(
    { totalDeleted },
    "Done purging expired pending agent configurations."
  );
}
