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
  wrapMicrosoftGraphAPIWithResult,
} from "@connectors/connectors/microsoft/lib/graph_api";
import { getParents } from "@connectors/connectors/microsoft/temporal/file";
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
  parents: string[],
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
    parents,
  });

  logger.info(loggerArgs, "[Spreadsheet] Table upserted.");
}

async function processSheet(
  client: Client,
  connector: ConnectorResource,
  spreadsheet: microsoftgraph.DriveItem,
  internalId: string,
  worksheet: microsoftgraph.WorkbookWorksheet,
  spreadsheetId: string,
  localLogger: Logger,
  startSyncTs: number
): Promise<Result<null, Error>> {
  if (!worksheet.id) {
    return new Err(new Error("Worksheet has no id"));
  }
  const content = await wrapMicrosoftGraphAPIWithResult(() =>
    getWorksheetContent(client, internalId)
  );

  const loggerArgs = {
    sheet: {
      id: worksheet.id,
      name: worksheet.name,
    },
  };

  if (content.isErr()) {
    localLogger.error(
      { ...loggerArgs, error: content.error },
      "[Spreadsheet] Failed to fetch sheet content."
    );
    return content;
  }

  localLogger.info(
    { loggerArgs },
    "[Spreadsheet] Processing sheet in Microsoft Excel."
  );

  // Content.text is guaranteed to be a 2D array with each row of the same length.
  const rows: string[][] = content?.value?.text;
  if (!rows) {
    localLogger.info(`[Spreadsheet] Cannot get any row from sheet.`);

    return new Err(
      new Error(
        `Cannot get any row from sheet ${worksheet.id} in document ${spreadsheet.id}`
      )
    );
  }

  if (rows.length > MAXIMUM_NUMBER_OF_EXCEL_SHEET_ROWS) {
    localLogger.info(
      { ...loggerArgs, rowCount: rows.length },
      `[Spreadsheet] Found sheet with more than ${MAXIMUM_NUMBER_OF_EXCEL_SHEET_ROWS}, skipping further processing.`
    );

    // If the sheet has too many rows, return an empty array to ignore it.
    return new Err(
      new Error(
        `Too many rows in sheet ${worksheet.name}, rows=${rows.length}, max=${MAXIMUM_NUMBER_OF_EXCEL_SHEET_ROWS}`
      )
    );
  }

  const [rawHeaders, ...rest] = rows;

  // Assuming the first line as headers, at least one additional data line is required.
  if (rawHeaders && rows.length > 1) {
    const headers = getSanitizedHeaders(rawHeaders);

    const parents = [
      internalId,
      ...(await getParents({
        connectorId: connector.id,
        internalId: spreadsheetId,
        startSyncTs,
      })),
    ];

    await upsertTable(
      connector,
      internalId,
      spreadsheet,
      worksheet,
      parents,
      [headers, ...rest],
      loggerArgs
    );

    await upsertWorksheetInDb(connector, internalId, worksheet, spreadsheetId);

    return new Ok(null);
  }

  localLogger.info(
    loggerArgs,
    "[Spreadsheet] Failed to import sheet. Will be deleted if already synced."
  );

  return new Err(new Error(`Table ${worksheet.id} is empty`));
}

export async function handleSpreadSheet({
  connectorId,
  file,
  parentInternalId,
  localLogger,
  startSyncTs,
}: {
  connectorId: number;
  file: microsoftgraph.DriveItem;
  parentInternalId: string;
  localLogger: Logger;
  startSyncTs: number;
}): Promise<Result<null, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);

  if (!connector) {
    throw new Error(`Connector with id ${connectorId} not found`);
  }

  const client = await getClient(connector.connectionId);

  if (!file.file) {
    return new Err(new Error(`Spreadsheet is not a file: ${file.name}`));
  }

  localLogger.info("[Spreadsheet] Syncing Excel Spreadsheet.");

  const documentId = getDriveItemInternalId(file);

  const worksheetsRes = await wrapMicrosoftGraphAPIWithResult(() =>
    getAllPaginatedEntities((nextLink) =>
      getWorksheets(client, documentId, nextLink)
    )
  );

  if (worksheetsRes.isErr()) {
    localLogger.error(
      { error: worksheetsRes.error },
      "[Spreadsheet] Failed to fetch worksheets."
    );
    return worksheetsRes;
  }

  const spreadsheet = await upsertSpreadsheetInDb(
    connector,
    documentId,
    file,
    parentInternalId
  );

  // List synced sheets.
  const syncedWorksheets = await spreadsheet.fetchChildren();

  const successfulSheetIdImports: string[] = [];
  for (const worksheet of worksheetsRes.value) {
    if (worksheet.id) {
      const internalWorkSheetId = getWorksheetInternalId(worksheet, documentId);
      const importResult = await processSheet(
        client,
        connector,
        file,
        internalWorkSheetId,
        worksheet,
        documentId,
        localLogger,
        startSyncTs
      );
      if (importResult.isOk()) {
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
