import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import config from "@app/lib/api/config";
import {
  getConnectorsReplicaDbConnection,
  getCorePrimaryDbConnection,
} from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { CoreAPI } from "@app/types/core/core_api";

const BATCH_SIZE = 100;

interface TableRow {
  node_id: string;
}

async function deleteOrphanedTablesForDataSource(
  dataSource: DataSourceModel,
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing data source");

  if (!dataSource.connectorId) {
    logger.info("Skipping - no connector");
    return;
  }

  // Get the internal data source ID from Core
  const coreDataSourceRows: { id: number }[] = await coreSequelize.query(
    `SELECT id FROM data_sources WHERE data_source_id = :dataSourceId;`,
    {
      replacements: { dataSourceId: dataSource.dustAPIDataSourceId },
      type: QueryTypes.SELECT,
    }
  );

  if (coreDataSourceRows.length === 0) {
    logger.error("Data source not found in Core");
    return;
  }

  const coreDataSourceId = coreDataSourceRows[0].id;

  // Query all tables from Core for this data source
  const tableRows: TableRow[] = await coreSequelize.query(
    `SELECT node_id
     FROM data_sources_nodes
     WHERE data_source = :dataSourceId
       AND "table" is not null
       AND mime_type = 'text/csv'
     ORDER BY node_id;`,
    {
      replacements: { dataSourceId: coreDataSourceId },
      type: QueryTypes.SELECT,
    }
  );

  logger.info({ tableCount: tableRows.length }, "Found CSV tables in Core");

  if (tableRows.length === 0) {
    return;
  }

  const tableIds = tableRows.map((row) => row.node_id);

  // Check which tables exist as CSV files in the connectors database
  // For CSV files, the dustFileId should match the table ID
  const existingCsvFiles: { dustFileId: string }[] =
    await connectorsSequelize.query(
      `SELECT "dustFileId"
       FROM google_drive_files
       WHERE "connectorId" = :connectorId
         AND "mimeType" = 'text/csv'
         AND "dustFileId" IN (:tableIds);`,
      {
        replacements: {
          connectorId: dataSource.connectorId,
          tableIds,
        },
        type: QueryTypes.SELECT,
      }
    );

  const existingTableIds = new Set(
    existingCsvFiles.map((file) => file.dustFileId)
  );

  // Find orphaned tables (tables that don't have a corresponding CSV file)
  const orphanedTableIds = tableIds.filter(
    (tableId) => !existingTableIds.has(tableId)
  );

  logger.info(
    {
      totalTables: tableIds.length,
      existingCsvFiles: existingCsvFiles.length,
      orphanedTables: orphanedTableIds.length,
    },
    "Table analysis complete"
  );

  if (orphanedTableIds.length === 0) {
    logger.info("No orphaned tables found");
    return;
  }

  logger.info(
    { orphanedTableIds: orphanedTableIds.slice(0, 10) },
    "Sample of orphaned table IDs (showing first 10)"
  );

  if (execute) {
    logger.info("Deleting orphaned tables via Core API");

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

    // Delete tables in batches to avoid overwhelming the API
    for (let i = 0; i < orphanedTableIds.length; i += BATCH_SIZE) {
      const batch = orphanedTableIds.slice(i, i + BATCH_SIZE);

      for (const tableId of batch) {
        try {
          const result = await coreAPI.deleteTable({
            projectId: dataSource.dustAPIProjectId,
            dataSourceId: dataSource.dustAPIDataSourceId,
            tableId,
          });

          if (result.isErr()) {
            logger.error(
              { tableId, error: result.error },
              "Failed to delete table"
            );
          } else {
            logger.info({ tableId }, "Successfully deleted table");
          }
        } catch (error) {
          logger.error({ tableId, error }, "Error deleting table");
        }
      }

      logger.info(
        {
          processed: Math.min(i + BATCH_SIZE, orphanedTableIds.length),
          total: orphanedTableIds.length,
        },
        "Batch deletion progress"
      );

      // Small delay between batches to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    logger.info(
      { deletedCount: orphanedTableIds.length },
      "Finished deleting orphaned tables"
    );
  } else {
    logger.info(
      { orphanedCount: orphanedTableIds.length },
      "Dry run - would delete these orphaned tables"
    );
  }
}

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();
  const connectorsSequelize = getConnectorsReplicaDbConnection();

  logger.info("Fetching Google Drive data sources");
  const dataSources = await DataSourceModel.findAll({
    where: { connectorProvider: "google_drive" },
  });

  logger.info({ count: dataSources.length }, "Found Google Drive data sources");

  for (const dataSource of dataSources) {
    await deleteOrphanedTablesForDataSource(
      dataSource,
      coreSequelize,
      connectorsSequelize,
      execute,
      logger.child({
        dataSourceId: dataSource.id,
        connectorId: dataSource.connectorId,
        workspaceId: dataSource.workspaceId,
      })
    );
  }

  logger.info("Migration complete");
});
