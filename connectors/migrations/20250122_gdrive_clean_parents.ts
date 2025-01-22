import { getLocalParents } from "@connectors/connectors/google_drive/lib";
import { GoogleDriveFiles } from "@connectors/lib/models/google_drive";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { concurrentExecutor, CoreAPI, EnvironmentConfig } from "@dust-tt/types";
import pino, { LoggerOptions } from "pino";
import { makeScript } from "scripts/helpers";
import { QueryTypes, Sequelize } from "sequelize";

async function migrateConnector(
  coreSequelize: Sequelize,
  connector: ConnectorResource,
  execute: boolean,
  parentLogger: pino.Logger<LoggerOptions & pino.ChildLoggerOptions>
) {
  const logger = parentLogger.child({ connectorId: connector.id });
  logger.info("Starting migration");
  const files = await GoogleDriveFiles.findAll({
    where: {
      connectorId: connector.id,
    },
    attributes: ["id", "dustFileId"],
  });

  // get datasource id from core
  const rows: { id: number }[] = await coreSequelize.query(
    `SELECT id FROM data_sources WHERE data_source_id = :dataSourceId;`,
    {
      replacements: { dataSourceId: connector.dataSourceId },
      type: QueryTypes.SELECT,
    }
  );

  if (rows.length === 0) {
    logger.error(`Data source ${connector.dataSourceId} not found in core`);
    return;
  }

  const dataSourceId = rows[0]?.id;

  concurrentExecutor(
    files,
    async (file) => {
      const parents = await getLocalParents(
        connector.id,
        file.dustFileId,
        "migrate_parents"
      );
      if (execute) {
        coreSequelize.query(
          `UPDATE data_sources_nodes SET parents = :parents WHERE data_source = :dataSourceId AND node_id = :nodeId`,
          {
            replacements: {
              parents: parents,
              dataSourceId,
              nodeId: file.dustFileId,
            },
          }
        );
      }
    },
    { concurrency: 32 }
  );
}

makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("google_drive", {});
  const coreSequelize = getCorePrimaryDbConnection();

  for (const connector of connectors) {
    await migrateConnector(coreSequelize, connector, execute, logger);
  }
});

function getCorePrimaryDbConnection() {
  return new Sequelize(EnvironmentConfig.getEnvVariable("CORE_DATABASE_URI"), {
    logging: false,
  });
}
