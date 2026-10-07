import type {
  ModelStaticWorkspaceAware,
  WorkspaceAwareModel,
} from "@app/lib/resources/storage/wrappers/workspace_models";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import type { WhereOptions } from "sequelize";

// A workspace can hold millions of rows in a table. Deleting them in a single statement holds a
// transaction open for as long as it runs, which blocks `CREATE INDEX CONCURRENTLY` in migrations,
// and an aborted statement rolls back after having written gigabytes of WAL. Batching keeps each
// statement short and lets the deletion make forward progress across retries.
const DESTROY_BATCH_SIZE = 10_000;

/**
 * @cc [owner:fontanierh,label:performance;backend] bounded-workspace-destroy
 * Each DELETE statement issued against `model` MUST target at most `DESTROY_BATCH_SIZE` rows of the
 * given workspace, selected by primary key, and MUST run in its own implicit transaction. Returns the
 * number of `model` rows deleted.
 */
export async function destroyAllForWorkspaceInBatches<
  M extends WorkspaceAwareModel,
>(
  model: ModelStaticWorkspaceAware<M>,
  { workspaceModelId }: { workspaceModelId: ModelId }
): Promise<number> {
  const localLogger = logger.child({
    workspaceId: workspaceModelId,
    tableName: model.tableName,
  });
  let deletedCount = 0;

  for (;;) {
    const batch = await model.findAll({
      attributes: ["id"],
      where: { workspaceId: workspaceModelId } as WhereOptions<M>,
      limit: DESTROY_BATCH_SIZE,
    });

    if (batch.length === 0) {
      break;
    }

    deletedCount += await model.destroy({
      where: {
        workspaceId: workspaceModelId,
        id: batch.map((row) => row.id),
      } as WhereOptions<M>,
    });

    localLogger.info({ deletedCount }, "Deleted a batch of workspace rows");

    if (batch.length < DESTROY_BATCH_SIZE) {
      break;
    }
  }

  return deletedCount;
}
