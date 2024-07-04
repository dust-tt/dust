import { getSanitizedHeaders, slugify } from "@dust-tt/types";
import type { Client } from "@microsoft/microsoft-graph-client";
import { stringify } from "csv-stringify/sync";

import {
  getDriveItemApiPath,
  getWorksheetApiPath,
  getWorksheetContent,
  getWorksheets,
  microsoftInternalIdFromNodeData,
} from "@connectors/connectors/microsoft/lib/graph_api";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { upsertTableFromCsv } from "@connectors/lib/data_sources";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { MicrosoftRootResource } from "@connectors/resources/microsoft_resource";
import { MicrosoftNodeResource } from "@connectors/resources/microsoft_resource";

const MAXIMUM_NUMBER_OF_EXCEL_SHEET_ROWS = 50000;

async function upsertSpreadsheetInDb(
  connector: ConnectorResource,
  internalId: string,
  file: microsoftgraph.DriveItem
) {
  return MicrosoftNodeResource.upsert({
    internalId,
    connectorId: connector.id,
    lastSeenTs: new Date(),
    nodeType: "file" as const,
    name: file.name ?? "",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    lastUpsertedTs: new Date(),
  });
}

async function upsertWorksheetInDb(
  connector: ConnectorResource,
  internalId: string,
  worksheet: microsoftgraph.WorkbookWorksheet
) {
  return MicrosoftNodeResource.upsert({
    internalId,
    connectorId: connector.id,
    lastSeenTs: new Date(),
    nodeType: "worksheet" as const,
    name: worksheet.name ?? "",
    mimeType: "text/csv",
    lastUpsertedTs: new Date(),
  });
}

async function upsertTable(
  connector: ConnectorResource,
  internalId: string,
  spreadsheet: microsoftgraph.DriveItem,
  worksheet: microsoftgraph.WorkbookWorksheet,
  rows: string[][],
  loggerArgs: object
) {
  const dataSourceConfig = await dataSourceConfigFromConnector(connector);

  const tableName = slugify(
    `${spreadsheet.name?.substring(0, 16)}-${worksheet.name?.substring(0, 16)}`
  );

  const tableDescription = `Structured data from the Excel Spreadsheet (${spreadsheet.name}) and sheet (${worksheet.name}`;

  const csv = stringify(rows);

  // Upserting is safe: Core truncates any previous table with the same Id before
  // the operation. Note: Renaming a sheet in Google Drive retains its original Id.
  await upsertTableFromCsv({
    dataSourceConfig,
    tableId: internalId,
    tableName,
    tableDescription,
    tableCsv: csv,
    loggerArgs: {
      connectorId: connector.id,
      sheetId: internalId,
      spreadsheetId: spreadsheet.id ?? "",
    },
    truncate: true,
  });

  logger.info(loggerArgs, "[Spreadsheet] Table upserted.");
}

async function processSheet(
  client: Client,
  connector: ConnectorResource,
  spreadsheet: microsoftgraph.DriveItem,
  internalId: string,
  worksheet: microsoftgraph.WorkbookWorksheet
): Promise<boolean> {
  if (!worksheet.id) {
    return false;
  }
  const content = await getWorksheetContent(client, internalId);
  const loggerArgs = {
    connectorType: "microsoft",
    connectorId: connector.id,
    worksheetId: internalId,
    sheet: {
      id: worksheet.id,
      name: worksheet.name,
    },
  };

  logger.info(
    { loggerArgs },
    "[Spreadsheet] Processing sheet in Microsoft Excel."
  );

  // Content.text is guaranteed to be a 2D array with each row of the same length.
  const rows: string[][] = content.text;

  if (rows.length > MAXIMUM_NUMBER_OF_EXCEL_SHEET_ROWS) {
    logger.info(
      { ...loggerArgs, rowCount: rows.length },
      `[Spreadsheet] Found sheet with more than ${MAXIMUM_NUMBER_OF_EXCEL_SHEET_ROWS}, skipping further processing.`
    );

    // If the sheet has too many rows, return an empty array to ignore it.
    return false;
  }

  const [rawHeaders, ...rest] = rows;

  // Assuming the first line as headers, at least one additional data line is required.
  if (rawHeaders && rows.length > 1) {
    const headers = getSanitizedHeaders(rawHeaders);

    await upsertTable(
      connector,
      internalId,
      spreadsheet,
      worksheet,
      [headers, ...rest],
      loggerArgs
    );

    await upsertWorksheetInDb(connector, internalId, worksheet);

    return true;
  }

  logger.info(
    loggerArgs,
    "[Spreadsheet] Failed to import sheet. Will be deleted if already synced."
  );

  return false;
}

export async function syncSpreadSheet(
  client: Client,
  {
    file,
    parent,
  }: {
    file: microsoftgraph.DriveItem;
    parent: MicrosoftRootResource;
  }
): Promise<
  | {
      isSupported: false;
    }
  | {
      isSupported: true;
      skipReason?: string;
    }
> {
  const connectorId = parent.connectorId;
  const connector = await ConnectorResource.fetchById(connectorId);

  if (!connector) {
    throw new Error(`Connector with id ${connectorId} not found`);
  }

  const localLogger = logger.child({
    provider: "microsoft",
    connectorId: connectorId,
    internalId: file.id,
    name: file.name,
  });

  if (!file.file) {
    throw new Error(`Item is not a file: ${JSON.stringify(file)}`);
  }

  localLogger.info("[Spreadsheet] Syncing Excel Spreadsheet.");

  const itemApiPath = getDriveItemApiPath(
    file,
    microsoftInternalIdFromNodeData(parent)
  );

  const documentId = microsoftInternalIdFromNodeData({
    itemApiPath,
    nodeType: "file",
  });

  const worksheets = await getWorksheets(client, documentId);

  const spreadsheet = await upsertSpreadsheetInDb(connector, documentId, file);

  // List synced sheets.
  const syncedWorksheets = await spreadsheet.fetchChildren();

  const successfulSheetIdImports: string[] = [];
  for (const worksheet of worksheets) {
    if (worksheet.id) {
      const internalWorkSheetId = microsoftInternalIdFromNodeData({
        nodeType: "worksheet",
        itemApiPath: getWorksheetApiPath(worksheet, documentId),
      });
      const isImported = await processSheet(
        client,
        connector,
        file,
        internalWorkSheetId,
        worksheet
      );
      if (isImported) {
        successfulSheetIdImports.push(internalWorkSheetId);
      }
    }
  }

  // Delete any previously synced sheets that no longer exist in the current spreadsheet
  // or have exceeded the maximum number of rows.
  const deletedSyncedSheetIds = syncedWorksheets
    .map((synced) => synced.internalId)
    .filter((syncedId) =>
      successfulSheetIdImports.find((sheetId) => sheetId === syncedId)
    );
  if (deletedSyncedSheetIds.length > 0) {
    localLogger.info("[Spreadsheet] Deleting Excel spreadsheet.");
    await MicrosoftNodeResource.batchDelete({
      resourceIds: deletedSyncedSheetIds,
      connectorId,
    });
  }

  return { isSupported: true };
}
