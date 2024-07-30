import type { Result } from "@dust-tt/types";
import { Err, getSanitizedHeaders, Ok, slugify } from "@dust-tt/types";
import type { Client } from "@microsoft/microsoft-graph-client";
import { stringify } from "csv-stringify/sync";

import { getClient } from "@connectors/connectors/microsoft";
import {
  getAllPaginatedEntities,
  getDriveItemInternalId,
  getWorksheetContent,
  getWorksheetInternalId,
  getWorksheets,
} from "@connectors/connectors/microsoft/lib/graph_api";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { deleteTable, upsertTableFromCsv } from "@connectors/lib/data_sources";
import type { Logger } from "@connectors/logger/logger";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { MicrosoftNodeResource } from "@connectors/resources/microsoft_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const MAXIMUM_NUMBER_OF_EXCEL_SHEET_ROWS = 50000;

async function upsertSpreadsheetInDb(
  connector: ConnectorResource,
  internalId: string,
  file: microsoftgraph.DriveItem,
  parentInternalId: string
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
    parentInternalId,
  });
}

async function upsertWorksheetInDb(
  connector: ConnectorResource,
  internalId: string,
  worksheet: microsoftgraph.WorkbookWorksheet,
  parentInternalId: string
) {
  return MicrosoftNodeResource.upsert({
    internalId,
    connectorId: connector.id,
    lastSeenTs: new Date(),
    nodeType: "worksheet" as const,
    name: worksheet.name ?? "",
    mimeType: "text/csv",
    lastUpsertedTs: new Date(),
    parentInternalId,
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
  worksheet: microsoftgraph.WorkbookWorksheet,
  spreadsheetId: string
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

    await upsertWorksheetInDb(connector, internalId, worksheet, spreadsheetId);

    return true;
  }

  logger.info(
    loggerArgs,
    "[Spreadsheet] Failed to import sheet. Will be deleted if already synced."
  );

  return false;
}

export async function handleSpreadSheet({
  connectorId,
  file,
  parentInternalId,
  localLogger,
}: {
  connectorId: number;
  file: microsoftgraph.DriveItem;
  parentInternalId: string;
  localLogger: Logger;
}): Promise<Result<null, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);

  if (!connector) {
    throw new Error(`Connector with id ${connectorId} not found`);
  }

  const client = await getClient(connector.connectionId);

  if (!file.file) {
    return new Err(new Error("not_a_file"));
  }

  localLogger.info("[Spreadsheet] Syncing Excel Spreadsheet.");

  try {
    const documentId = getDriveItemInternalId(file);
    const worksheets = await getAllPaginatedEntities((nextLink) =>
      getWorksheets(client, documentId, nextLink)
    );

    const spreadsheet = await upsertSpreadsheetInDb(
      connector,
      documentId,
      file,
      parentInternalId
    );

    // List synced sheets.
    const syncedWorksheets = await spreadsheet.fetchChildren();

    const successfulSheetIdImports: string[] = [];
    for (const worksheet of worksheets) {
      if (worksheet.id) {
        const internalWorkSheetId = getWorksheetInternalId(
          worksheet,
          documentId
        );
        const isImported = await processSheet(
          client,
          connector,
          file,
          internalWorkSheetId,
          worksheet,
          documentId
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
      .filter((syncedId) => successfulSheetIdImports.indexOf(syncedId) === -1);

    if (deletedSyncedSheetIds.length > 0) {
      localLogger.info("[Spreadsheet] Deleting Excel spreadsheet.");
      await MicrosoftNodeResource.batchDelete({
        resourceIds: deletedSyncedSheetIds,
        connectorId,
      });
    }
  } catch (err) {
    localLogger.warn({ error: err }, "Error while parsing spreadsheet");
    return new Err(err as Error);
  }

  return new Ok(null);
}

export async function deleteAllSheets(
  dataSourceConfig: DataSourceConfig,
  spreadsheet: MicrosoftNodeResource
) {
  await concurrentExecutor(
    await spreadsheet.fetchChildren(),
    async (sheet) => {
      await deleteTable({
        dataSourceConfig,
        tableId: sheet.internalId,
        loggerArgs: {
          connectorId: spreadsheet.connectorId,
          sheetId: sheet.internalId,
          spreadsheetId: spreadsheet.internalId,
        },
      });
      await sheet.delete();
    },
    { concurrency: 5 }
  );
}
