import type { Logger } from "pino";
import { Op } from "sequelize";

import {
  deleteDataSourceDocument,
  deleteDataSourceFolder,
} from "@connectors/lib/data_sources";
import {
  GithubCodeDirectoryModel,
  GithubCodeFileModel,
} from "@connectors/lib/models/github";
import { heartbeat } from "@connectors/lib/temporal";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types";
import { concurrentExecutor } from "@connectors/types";

const MAX_CONCURRENCY_DELETE = 10;

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

    await concurrentExecutor(
      filesToDelete,
      async (f) => {
        await heartbeat();

        await deleteDataSourceDocument(
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

    await concurrentExecutor(
      directoriesToDelete,
      async (d) => {
        await deleteDataSourceFolder({
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
