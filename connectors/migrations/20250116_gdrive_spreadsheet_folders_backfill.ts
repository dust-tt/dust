import { makeScript } from "scripts/helpers";
import { QueryTypes } from "sequelize";

import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import { getFileParentsMemoized } from "@connectors/connectors/google_drive/lib/hierarchy";
import {
  getAuthObject,
  getInternalId,
} from "@connectors/connectors/google_drive/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { sequelizeConnection } from "@connectors/resources/storage";

const BATCH_SIZE = 256;
const DRIVE_CONCURRENCY = 10;

interface GoogleDriveSpreadsheetFileRecord {
  driveFileId: string;
  dustFileId: string;
  name: string;
  id: number;
  connectorId: number;
}

async function upsertFoldersForConnector(
  connector: ConnectorResource,
  execute: boolean,
  logger: Logger
) {
  logger.info(`Processing Spreadsheets for connector ${connector.id}`);

  let nextId = 0;
  let updatedRowsCount = 0;
  do {
    const spreadsheetMimeType = "application/vnd.google-apps.spreadsheet";
    const [spreadsheetRows] = (await sequelizeConnection.query<
      GoogleDriveSpreadsheetFileRecord[]
    >(
      `
          SELECT gdf.id, gdf."driveFileId", gdf."dustFileId", gdf."connectorId", gdf."name"
          FROM googleDriveFiles gdf
          WHERE gdf.id > :nextId AND gdf."mimeType" = :spreadsheetMimeType AND gdf."connectorId" = :connectorId
          ORDER BY gdf.id
          LIMIT :batchSize;`,
      {
        replacements: {
          batchSize: BATCH_SIZE,
          nextId,
          spreadsheetMimeType,
          connectorId: connector.id,
        },
        type: QueryTypes.SELECT,
      }
    )) as [GoogleDriveSpreadsheetFileRecord[], unknown];

    if (!spreadsheetRows || spreadsheetRows.length === 0) {
      break;
    }

    nextId = spreadsheetRows[spreadsheetRows.length - 1]!.id;
    updatedRowsCount += spreadsheetRows.length;

    // Upsert spreadsheets as folders
    const startSyncTs = new Date().getTime();
    await concurrentExecutor(
      spreadsheetRows,
      async (spreadsheetRow) => {
        const { connectorId, driveFileId } = spreadsheetRow;
        const authCredentials = await getAuthObject(connectorId.toString());
        const spreadsheet = await getGoogleDriveObject(
          authCredentials,
          driveFileId
        );
        if (!spreadsheet) {
          throw new Error(`Spreadsheet ${driveFileId} not found`);
        }
        const parentGoogleIds = await getFileParentsMemoized(
          connectorId,
          authCredentials,
          spreadsheet,
          startSyncTs
        );
        const parents = parentGoogleIds.map((parent) => getInternalId(parent));
        if (execute) {
          await upsertDataSourceFolder({
            dataSourceConfig: dataSourceConfigFromConnector(connector),
            folderId: getInternalId(spreadsheet.id),
            parents,
            parentId: parents[1] || null,
            title: spreadsheetRow.name,
            mimeType: "application/vnd.google-apps.spreadsheet",
          });
        }
      },
      { concurrency: DRIVE_CONCURRENCY }
    );
  } while (updatedRowsCount === BATCH_SIZE);

  if (execute) {
    logger.info(
      `--> Finished processing ${updatedRowsCount} spreadsheet files for connector ${connector.id}`
    );
  } else {
    logger.info(
      `--> Would have processed ${updatedRowsCount} spreadsheet files for connector ${connector.id}`
    );
  }
}

makeScript({}, async ({ execute }, logger) => {
  // We only have 469 of them, so we can just do them all
  const connectors = await ConnectorResource.listByType("google_drive", {});
  for (const connector of connectors) {
    await upsertFoldersForConnector(connector, execute, logger);
  }
});
