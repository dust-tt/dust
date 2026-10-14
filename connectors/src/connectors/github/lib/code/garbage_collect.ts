import {
  deleteDataSourceDocument,
  deleteDataSourceFolder,
} from "@connectors/lib/data_sources";
import {
  GithubCodeDirectoryModel,
  GithubCodeFileModel,
} from "@connectors/lib/models/github";
import { heartbeat } from "@connectors/lib/temporal";
import type { Logger } from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types";
import { concurrentExecutor, withRetries } from "@connectors/types";
import { Op } from "sequelize";

const MAX_CONCURRENCY_DELETE = 10;

// Large garbage collections issue thousands of deletes: a single slow one must not fail the whole
// activity attempt and restart the collection.
const DELETE_RETRIES = 3;
const DELETE_DELAY_BETWEEN_RETRIES_MS = 5_000;

export async function garbageCollectCodeSync(
  dataSourceConfig: DataSourceConfig,
  connector: ConnectorResource,
  repoId: number,
  codeSyncStartedAt: Date,
  logger: Logger
) {
  const filesToDelete = await GithubCodeFileModel.findAll({
    where: {
      connectorId: connector.id,
      repoId: repoId.toString(),
      lastSeenAt: {
        [Op.lt]: codeSyncStartedAt,
      },
    },
  });

  if (filesToDelete.length > 0) {
    logger.info(
      { filesToDelete: filesToDelete.length },
      "GarbageCollectCodeSync: deleting files"
    );

    const deleteDocumentWithRetries = withRetries(
      logger,
      deleteDataSourceDocument,
      {
        retries: DELETE_RETRIES,
        delayBetweenRetriesMs: DELETE_DELAY_BETWEEN_RETRIES_MS,
      }
    );

    await concurrentExecutor(
      filesToDelete,
      async (f) => {
        await heartbeat();

        await deleteDocumentWithRetries(
          dataSourceConfig,
          f.documentId,
          logger.bindings()
        );

        // Only destroy once we succesfully removed from the data source. This is
        // idempotent and will work as expected when retried.
        await f.destroy();
      },
      { concurrency: MAX_CONCURRENCY_DELETE }
    );
  }

  const directoriesToDelete = await GithubCodeDirectoryModel.findAll({
    where: {
      connectorId: connector.id,
      repoId: repoId.toString(),
      lastSeenAt: {
        [Op.lt]: codeSyncStartedAt,
      },
    },
  });

  if (directoriesToDelete.length > 0) {
    logger.info(
      {
        directoriesToDelete: directoriesToDelete.length,
      },
      "GarbageCollectCodeSync: deleting directories"
    );

    const deleteFolderWithRetries = withRetries(
      logger,
      deleteDataSourceFolder,
      {
        retries: DELETE_RETRIES,
        delayBetweenRetriesMs: DELETE_DELAY_BETWEEN_RETRIES_MS,
      }
    );

    await concurrentExecutor(
      directoriesToDelete,
      async (d) => {
        await heartbeat();

        await deleteFolderWithRetries({
          dataSourceConfig,
          folderId: d.internalId,
        });
      },
      { concurrency: MAX_CONCURRENCY_DELETE }
    );

    await GithubCodeDirectoryModel.destroy({
      where: {
        connectorId: connector.id,
        repoId: repoId.toString(),
        lastSeenAt: {
          [Op.lt]: codeSyncStartedAt,
        },
      },
    });
  }
}
