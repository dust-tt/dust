import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import {
  getConnectorsReplicaDbConnection,
  getCorePrimaryDbConnection,
} from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 128;

async function backfillDataSource(
  frontDataSource: DataSourceModel,
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing data source");

  // get datasource id from core
  const rows: { id: number }[] = await coreSequelize.query(
    `SELECT id FROM data_sources WHERE data_source_id = :dataSourceId;`,
    {
      replacements: { dataSourceId: frontDataSource.dustAPIDataSourceId },
      type: QueryTypes.SELECT,
    }
  );

  if (rows.length === 0) {
    logger.error(`Data source ${frontDataSource.id} not found in core`);
    return;
  }

  const dataSourceId = rows[0].id;

  await backfillFolders(
    frontDataSource,
    dataSourceId,
    coreSequelize,
    connectorsSequelize,
    execute,
    logger.child({ type: "folders" })
  );

  await backfillSpreadsheets(
    frontDataSource,
    dataSourceId,
    coreSequelize,
    connectorsSequelize,
    execute,
    logger.child({ type: "spreadsheets" })
  );
}

async function backfillSpreadsheets(
  frontDataSource: DataSourceModel,
  dataSourceId: number,
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing spreadsheets");

  // processing the spreadsheets chunk by chunk
  let lastId = 0;
  let rows: { id: number; driveFileId: string; driveSheetId: number }[] = [];

  do {
    // querying connectors for the next batch of spreadsheets

    rows = await connectorsSequelize.query(
      `SELECT id, "driveFileId", "driveSheetId"
       FROM google_drive_sheets
       WHERE id > :lastId
         AND "connectorId" = :connectorId
       ORDER BY id
       LIMIT :batchSize;`,
      {
        replacements: {
          batchSize: BATCH_SIZE,
          lastId,
          connectorId: frontDataSource.connectorId,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (rows.length === 0) {
      break;
    }
    // reconstructing the URLs and node IDs
    const urls = rows.map((row) =>
      getSourceUrlForGoogleDriveSheet(row.driveFileId, row.driveSheetId)
    );
    const nodeIds = rows.map((row) =>
      getGoogleSheetTableId(row.driveFileId, row.driveSheetId)
    );

    if (execute) {
      // updating on core on the nodeIds
      await coreSequelize.query(
        `UPDATE data_sources_nodes
         SET source_url = urls.url
         FROM (SELECT unnest(ARRAY [:nodeIds]::text[]) as node_id,
                      unnest(ARRAY [:urls]::text[])    as url) urls
         WHERE data_sources_nodes.data_source = :dataSourceId AND data_sources_nodes.node_id = urls.node_id;`,
        { replacements: { urls, nodeIds, dataSourceId } }
      );
      logger.info(
        `Updated ${rows.length} spreadsheets from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    } else {
      logger.info(
        `Would update ${rows.length} spreadsheets from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    }

    lastId = rows[rows.length - 1].id;
  } while (rows.length === BATCH_SIZE);
}

async function backfillFolders(
  frontDataSource: DataSourceModel,
  dataSourceId: number,
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing folders");

  // processing the folders chunk by chunk
  let lastId = 0;
  let rows: {
    id: number;
    driveFileId: string;
    dustFileId: string;
    mimeType: string;
  }[] = [];

  do {
    // querying connectors for the next batch of folders

    rows = await connectorsSequelize.query(
      `SELECT id, "driveFileId", "dustFileId", "mimeType"
       FROM google_drive_files
       WHERE id > :lastId
         AND "connectorId" = :connectorId
         AND "mimeType" = 'application/vnd.google-apps.folder'
       ORDER BY id
       LIMIT :batchSize;`,
      {
        replacements: {
          batchSize: BATCH_SIZE,
          lastId,
          connectorId: frontDataSource.connectorId,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (rows.length === 0) {
      break;
    }
    // reconstructing the URLs and node IDs
    const urls = rows.map((row) =>
      getSourceUrlForGoogleDriveFiles(row.driveFileId, row.mimeType)
    );
    const nodeIds = rows.map((row) => row.dustFileId);

    if (execute) {
      // updating on core on the nodeIds
      await coreSequelize.query(
        `UPDATE data_sources_nodes
         SET source_url = urls.url
         FROM (SELECT unnest(ARRAY [:nodeIds]::text[]) as node_id,
                      unnest(ARRAY [:urls]::text[])    as url) urls
         WHERE data_sources_nodes.data_source = :dataSourceId AND data_sources_nodes.node_id = urls.node_id;`,
        { replacements: { urls, nodeIds, dataSourceId } }
      );
      logger.info(
        `Updated ${rows.length} folders from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    } else {
      logger.info(
        `Would update ${rows.length} folders from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    }

    lastId = rows[rows.length - 1].id;
  } while (rows.length === BATCH_SIZE);
}

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();
  const connectorsSequelize = getConnectorsReplicaDbConnection();
  const frontDataSources = await DataSourceModel.findAll({
    where: { connectorProvider: "google_drive" },
  });
  logger.info(`Found ${frontDataSources.length} Google Drive data sources`);

  for (const frontDataSource of frontDataSources) {
    await backfillDataSource(
      frontDataSource,
      coreSequelize,
      connectorsSequelize,
      execute,
      logger.child({
        dataSourceId: frontDataSource.id,
        connectorId: frontDataSource.connectorId,
        name: frontDataSource.name,
      })
    );
  }
});

// Copy-pasted from connectors/src/connectors/google_drive/index.ts
function getSourceUrlForGoogleDriveFiles(
  driveFileId: string,
  mimeType: string
): string {
  if (isGoogleDriveSpreadSheetFile(mimeType)) {
    return `https://docs.google.com/spreadsheets/d/${driveFileId}/edit`;
  } else if (isGoogleDriveFolder(mimeType)) {
    return `https://drive.google.com/drive/folders/${driveFileId}`;
  }

  return `https://drive.google.com/file/d/${driveFileId}/view`;
}

function isGoogleDriveFolder(mimeType: string) {
  return mimeType === "application/vnd.google-apps.folder";
}

function isGoogleDriveSpreadSheetFile(mimeType: string) {
  return mimeType === "application/vnd.google-apps.spreadsheet";
}

function getSourceUrlForGoogleDriveSheet(
  driveFileId: string,
  driveSheetId: number
): string {
  return `https://docs.google.com/spreadsheets/d/${driveFileId}/edit#gid=${driveSheetId}`;
}

// Copy-pasted from types/src/connectors/google_drive.ts
export function getGoogleSheetTableId(
  googleFileId: string,
  googleSheetId: number
): string {
  return `google-spreadsheet-${googleFileId}-sheet-${googleSheetId}`;
}
