/* oxlint-disable dust/noRawSql -- hard delete activities require raw SQL for cascade deletions */
import { Authenticator } from "@app/lib/auth";
import { REINFORCEMENT_EXCLUDED_PLAN_CODES } from "@app/lib/plans/plan_codes";
import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { runOnAllWorkspacesInActivity } from "@app/temporal/activity_utils";
import type {
  RunExecutionRow,
  RunsJoinsRow,
} from "@app/temporal/hard_delete/types";
import {
  getPendingAgentsDeletionCutoffDate,
  getPendingSkillsDeletionCutoffDate,
  getRunExecutionsDeletionCutoffDate,
  getSyntheticSuggestionsDeletionCutoffDate,
  isSequelizeForeignKeyConstraintError,
} from "@app/temporal/hard_delete/utils";
import { concurrentExecutor } from "@app/temporal/workflow_utils";
import { Context } from "@temporalio/activity";
import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

const BATCH_SIZE = 100;
const WORKSPACE_CONCURRENCY = 10;
const WORKSPACE_LIST_BATCH_SIZE = 1000;

// Iterate over all workspaces and sum the results.
async function sumOverAllWorkspaces(
  fn: (auth: Authenticator) => Promise<number>
): Promise<number> {
  let total = 0;
  let lastWorkspaceModelId = 0;

  while (true) {
    const batch =
      await WorkspaceResource.unsafeListWorkspaceIdBatchAfterModelId({
        lastWorkspaceModelId,
        limit: WORKSPACE_LIST_BATCH_SIZE,
      });
    if (batch.length === 0) {
      return total;
    }
    lastWorkspaceModelId = batch[batch.length - 1].workspaceModelId;

    const counts = await concurrentExecutor(
      batch,
      async ({ workspaceId }) =>
        fn(await Authenticator.internalAdminForWorkspace(workspaceId)),
      { concurrency: WORKSPACE_CONCURRENCY }
    );
    total += counts.reduce((sum, count) => sum + count, 0);
  }
}

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

  const totalDeleted = await sumOverAllWorkspaces(async (auth) => {
    let deleted = 0;
    let hasMore = true;

    do {
      const agents = await AgentResource.dangerouslyListExpiredPendingAgents(
        auth,
        { createdBefore: cutoffDate, limit: batchSize }
      );

      hasMore = agents.length === batchSize;

      if (agents.length > 0) {
        // `batchDelete` skips search-index deletion for pending agents on its own (they are never
        // indexed; see `batch-delete-search-index`), so no per-agent workflows are launched here.
        const deleteRes = await AgentResource.batchDelete(auth, agents);
        if (deleteRes.isErr()) {
          throw deleteRes.error;
        }
        deleted += agents.length;
      }

      Context.current().heartbeat();
    } while (hasMore);

    return deleted;
  });

  logger.info(
    { totalDeleted },
    "Done purging expired pending agent configurations."
  );
}

export async function purgeExpiredPendingSkillsActivity(
  batchSize: number = BATCH_SIZE
) {
  const cutoffDate = getPendingSkillsDeletionCutoffDate();

  logger.info(
    {},
    `About to purge pending skills created before ${cutoffDate.toISOString()}.`
  );

  const totalDeleted = await sumOverAllWorkspaces(async (auth) => {
    let deleted = 0;
    let hasMore = true;

    do {
      const batch = await SkillResource.listExpiredPending(auth, {
        createdBefore: cutoffDate,
        limit: batchSize,
      });

      hasMore = batch.length === batchSize;

      if (batch.length > 0) {
        const deleteRes = await SkillResource.batchDelete(auth, batch);
        if (deleteRes.isErr()) {
          throw deleteRes.error;
        }
        deleted += deleteRes.value;
      }

      Context.current().heartbeat();
    } while (hasMore);

    return deleted;
  });

  logger.info({ totalDeleted }, "Done purging expired pending skills.");
}

export async function purgeExpiredSyntheticSkillSuggestionsActivity(
  batchSize: number = BATCH_SIZE
) {
  const cutoffDate = getSyntheticSuggestionsDeletionCutoffDate();

  logger.info(
    {},
    `About to purge synthetic skill suggestions created before ${cutoffDate.toISOString()}.`
  );

  const results = await runOnAllWorkspacesInActivity(
    async (auth) => {
      let deleted = 0;
      let hasMore = true;

      do {
        const deletedCount =
          await SkillSuggestionResource.deleteExpiredSynthetic(
            auth,
            cutoffDate,
            {
              limit: batchSize,
            }
          );

        deleted += deletedCount;
        hasMore = deletedCount === batchSize;

        Context.current().heartbeat();
      } while (hasMore);

      return deleted;
    },
    {
      concurrency: WORKSPACE_CONCURRENCY,
      excludePlanCodes: REINFORCEMENT_EXCLUDED_PLAN_CODES,
    }
  );

  const totalDeleted = results.reduce((sum, count) => sum + count, 0);

  logger.info(
    { totalDeleted },
    "Done purging expired synthetic skill suggestions."
  );
}
