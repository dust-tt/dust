/*
// Disabled as CoreAPI is not available, for now, in connectors.

import { makeScript } from "scripts/helpers";
import { Sequelize } from "sequelize";

import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { GoogleDriveFiles } from "@connectors/lib/models/google_drive";
import type Logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { CoreAPI, EnvironmentConfig } from "@connectors/types";

const { FRONT_DATABASE_URI } = process.env;

const BATCH_SIZE = 1000;

async function checkOrphansDocumentsForConnector(
  coreAPI: CoreAPI,
  connector: ConnectorResource,
  dustAPIProjectId: string,
  dustAPIDataSourceId: string,
  execute = false,
  nodeConcurrency: number,
  parentLogger: typeof Logger
) {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const logger = parentLogger.child({
    connectorId: connector.id,
    workspaceId: dataSourceConfig.workspaceId,
    dataSourceId: dataSourceConfig.dataSourceId,
  });

  let offset = 0;
  let count = 0;
  let orphanCount = 0;
  do {
    const coreRes = await coreAPI.getDataSourceDocuments(
      {
        dataSourceId: dustAPIDataSourceId,
        projectId: dustAPIProjectId,
      },
      {
        limit: BATCH_SIZE,
        offset,
      }
    );
    logger.info({ offset, count }, "Fetching documents");

    offset += BATCH_SIZE;

    if (coreRes.isErr()) {
      throw new Error(coreRes.error.message);
    }

    const ids = coreRes.value.documents.map((node) => node.document_id);
    count = ids.length;
    const files = await GoogleDriveFiles.findAll({
      where: {
        dustFileId: ids,
      },
    });
    const found = files.map((f) => f.dustFileId);
    const orphans = ids.filter((id) => !found.includes(id));

    logger.info({ orphans }, "Found orphan nodes");
    orphanCount += orphans.length;
    if (execute) {
      await concurrentExecutor(
        orphans,
        async (orphan) => {
          logger.info({ id: orphan }, "Removing orphan nodes");
          await coreAPI.deleteDataSourceDocument({
            dataSourceId: dustAPIDataSourceId,
            documentId: orphan,
            projectId: dustAPIProjectId,
          });
        },
        { concurrency: nodeConcurrency }
      );
    }
  } while (count === BATCH_SIZE);
  logger.info({ orphanCount }, "DONE");
}

async function checkOrphansFoldersForConnector(
  coreAPI: CoreAPI,
  connector: ConnectorResource,
  dustAPIProjectId: string,
  dustAPIDataSourceId: string,
  execute = false,
  nodeConcurrency: number,
  parentLogger: typeof Logger
) {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const logger = parentLogger.child({
    connectorId: connector.id,
    workspaceId: dataSourceConfig.workspaceId,
    dataSourceId: dataSourceConfig.dataSourceId,
  });

  let offset = 0;
  let count = 0;
  let orphanCount = 0;
  do {
    const coreRes = await coreAPI.getDataSourceFolders(
      {
        dataSourceId: dustAPIDataSourceId,
        projectId: dustAPIProjectId,
      },
      {
        limit: BATCH_SIZE,
        offset,
      }
    );
    logger.info({ offset, count }, "Fetching documents");

    offset += BATCH_SIZE;

    if (coreRes.isErr()) {
      throw new Error(coreRes.error.message);
    }

    const ids = coreRes.value.folders
      .map((node) => node.folder_id)
      .filter((id) => id !== "gdrive-sharedWithMe");

    count = ids.length;
    const files = await GoogleDriveFiles.findAll({
      where: {
        dustFileId: ids,
      },
    });
    const found = files.map((f) => f.dustFileId);
    const orphans = ids.filter((id) => !found.includes(id));

    logger.info({ orphans }, "Found orphan nodes");
    orphanCount += orphans.length;
    if (execute) {
      await concurrentExecutor(
        orphans,
        async (orphan) => {
          logger.info({ id: orphan }, "Removing orphan nodes");
          await coreAPI.deleteDataSourceFolder({
            dataSourceId: dustAPIDataSourceId,
            folderId: orphan,
            projectId: dustAPIProjectId,
          });
        },
        { concurrency: nodeConcurrency }
      );
    }
  } while (count === BATCH_SIZE);
  logger.info({ orphanCount }, "DONE");
}

makeScript(
  {
    connectorConcurrency: {
      type: "number",
      demandOption: false,
      default: 5,
      description: "Number of connectors to process concurrently",
    },
    nodeConcurrency: {
      type: "number",
      demandOption: false,
      default: 8,
      description: "Number of nodes to process concurrently per connector",
    },
  },
  async ({ execute, connectorConcurrency, nodeConcurrency }, logger) => {
    const coreAPI = new CoreAPI(
      {
        url: EnvironmentConfig.getEnvVariable("CORE_API"),
        apiKey:
          EnvironmentConfig.getOptionalEnvVariable("CORE_API_KEY") ?? null,
      },
      logger
    );
    const frontSequelize = new Sequelize(FRONT_DATABASE_URI as string, {
      logging: false,
    });

    const res = await frontSequelize.query(
      `SELECT "dustAPIDataSourceId", "dustAPIProjectId",  "connectorId" FROM data_sources WHERE "connectorProvider" ='google_drive'`
    );
    const dataSources = res[0] as {
      dustAPIDataSourceId: string;
      dustAPIProjectId: string;
      connectorId: string;
    }[];
    logger.info(`Found ${dataSources.length} google_drive datasources`);

    await concurrentExecutor(
      dataSources,
      async (dataSource) => {
        const connector = await ConnectorResource.fetchById(
          dataSource.connectorId
        );

        if (!connector) {
          logger.error(
            { connectorId: dataSource.connectorId },
            "Connector not found"
          );
          return;
        }

        logger.info({ connectorId: connector.id }, "MIGRATE");
        await checkOrphansDocumentsForConnector(
          coreAPI,
          connector,
          dataSource.dustAPIProjectId,
          dataSource.dustAPIDataSourceId,
          execute,
          nodeConcurrency,
          logger
        );
        await checkOrphansFoldersForConnector(
          coreAPI,
          connector,
          dataSource.dustAPIProjectId,
          dataSource.dustAPIDataSourceId,
          execute,
          nodeConcurrency,
          logger
        );
      },
      { concurrency: connectorConcurrency }
    );

    logger.info("Finished processing all connectors");
  }
);
*/
