import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { Client } from "@microsoft/microsoft-graph-client";
import { GraphError } from "@microsoft/microsoft-graph-client";
import type { WorkbookWorksheet } from "@microsoft/microsoft-graph-types";
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
import type { DriveItem } from "@connectors/connectors/microsoft/lib/types";
import {
  getColumnsFromListItem,
  markInternalIdAsSkipped,
} from "@connectors/connectors/microsoft/lib/utils";
import { getParents } from "@connectors/connectors/microsoft/temporal/file";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  deleteDataSourceTable,
  ignoreTablesError,
  upsertDataSourceFolder,
  upsertDataSourceTableFromCsv,
} from "@connectors/lib/data_sources";
import { ProviderWorkflowError, TablesError } from "@connectors/lib/error";
import type { Logger } from "@connectors/logger/logger";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { MicrosoftNodeResource } from "@connectors/resources/microsoft_resource";
import type { DataSourceConfig } from "@connectors/types";
import { INTERNAL_MIME_TYPES, slugify } from "@connectors/types";

const MAXIMUM_NUMBER_OF_EXCEL_SHEET_ROWS = 50000;

async function upsertSpreadsheetInDb(
  connector: ConnectorResource,
  internalId: string,
  file: DriveItem,
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
    webUrl: file.webUrl ?? null,
  });
}

async function upsertWorksheetInDb(
  connector: ConnectorResource,
  internalId: string,
  worksheet: WorkbookWorksheet,
  spreadsheet: DriveItem
) {
  return MicrosoftNodeResource.upsert({
    internalId,
    connectorId: connector.id,
    lastSeenTs: new Date(),
    nodeType: "worksheet" as const,
    name: worksheet.name ?? "",
    mimeType: "text/csv",
    lastUpsertedTs: new Date(),
    parentInternalId: getDriveItemInternalId(spreadsheet),
    // At our current comprehension, there are no easily findable source url to
    // directly access the worksheet, so we link to the parent spreadsheet
    webUrl: spreadsheet.webUrl ?? null,
  });
}

async function upsertMSTable(
  connector: ConnectorResource,
  internalId: string,
  spreadsheet: DriveItem,
  worksheet: WorkbookWorksheet,
  parents: [string, string, ...string[]],
  rows: string[][],
  tags: string[]
) {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const tableName = slugify(
    `${spreadsheet.name?.substring(0, 16)}-${worksheet.name?.substring(0, 16)}`
  );

  const tableDescription = `Structured data from the Excel Spreadsheet (${spreadsheet.name}) and sheet (${worksheet.name}`;

  const csv = stringify(rows);

  // Upserting is safe: Core truncates any previous table with the same Id before
  // the operation. Note: Renaming a sheet in Google Drive retains its original Id.
  await ignoreTablesError("Microsoft Excel", () =>
    upsertDataSourceTableFromCsv({
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
      parentId: parents[1],
      title: `${spreadsheet.name} - ${worksheet.name}`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // At our current comprehension, there are no easily findable source url to
      // directly access the worksheet, so we link to the parent spreadsheet
      sourceUrl: spreadsheet.webUrl ?? undefined,
      tags,
    })
  );
}

async function processSheet({
  client,
  connector,
  spreadsheet,
  spreadsheetInternalId,
  worksheet,
  worksheetInternalId,
  localLogger,
  startSyncTs,
}: {
  client: Client;
  connector: ConnectorResource;
  spreadsheet: DriveItem;
  spreadsheetInternalId: string;
  worksheet: WorkbookWorksheet;
  worksheetInternalId: string;
  localLogger: Logger;
  startSyncTs: number;
}): Promise<Result<null, Error>> {
  if (!worksheet.id) {
    return new Err(new Error("Worksheet has no id"));
  }
  const content = await wrapMicrosoftGraphAPIWithResult(() =>
    getWorksheetContent(localLogger, client, worksheetInternalId)
  );

  const loggerArgs = {
    sheet: {
      documentId: spreadsheetInternalId,
      worksheetId: worksheet.id,
      name: worksheet.name,
    },
  };

  if (content.isErr()) {
    localLogger.error(
      { ...loggerArgs, error: content.error },
      "[Spreadsheet] Failed to fetch sheet content."
    );

    if (
      content.error instanceof GraphError &&
      content.error.statusCode === 504
    ) {
      await markInternalIdAsSkipped({
        internalId: worksheetInternalId,
        connectorId: connector.id,
        parentInternalId: spreadsheetInternalId,
        reason: "error_fetching_content",
        file: spreadsheet,
      });
    }

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

  // Assuming the first line as headers, at least one additional data line is required.
  if (rows.length > 1) {
    const parents: [string, string, ...string[]] = [
      worksheetInternalId,
      ...(await getParents({
        connectorId: connector.id,
        internalId: spreadsheetInternalId,
        startSyncTs,
      })),
    ];

    if (!spreadsheet.listItem?.fields) {
      localLogger.warn("Unexpected missing fields for spreadsheet");
    }

    const tags = await getColumnsFromListItem(
      spreadsheet,
      spreadsheet.listItem?.fields,
      await getClient(connector.connectionId),
      localLogger
    );

    try {
      await upsertMSTable(
        connector,
        worksheetInternalId,
        spreadsheet,
        worksheet,
        parents,
        rows,
        tags
      );
    } catch (err) {
      logger.error(
        { ...loggerArgs, error: err },
        "[Spreadsheet] Failed to upsert table."
      );
      if (err instanceof TablesError) {
        localLogger.warn(
          { ...loggerArgs, error: err },
          "[Spreadsheet] Tables error - skipping (but not failing)."
        );
        return new Ok(null);
      }
      if (err instanceof Error) {
        throw new ProviderWorkflowError(
          "microsoft",
          `Spreadsheet failed to upsert (possibly transient): ${err.message}`,
          "transient_upstream_activity_error",
          err
        );
      } else {
        throw err;
      }
    }

    await upsertWorksheetInDb(
      connector,
      worksheetInternalId,
      worksheet,
      spreadsheet
    );

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
  heartbeat,
}: {
  connectorId: number;
  file: DriveItem;
  parentInternalId: string;
  localLogger: Logger;
  startSyncTs: number;
  heartbeat: () => Promise<void>;
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
    getAllPaginatedEntities(async (nextLink) => {
      await heartbeat();
      return getWorksheets(localLogger, client, documentId, nextLink);
    })
  );

  if (worksheetsRes.isErr()) {
    localLogger.error(
      { error: worksheetsRes.error },
      "[Spreadsheet] Failed to fetch worksheets."
    );

    if (
      worksheetsRes.error instanceof GraphError &&
      worksheetsRes.error.statusCode === 504
    ) {
      await markInternalIdAsSkipped({
        internalId: documentId,
        connectorId,
        parentInternalId,
        reason: "error_fetching_worksheets",
        file,
      });
    }

    return worksheetsRes;
  }

  localLogger.info(
    { worksheets: worksheetsRes.value.length },
    "[Spreadsheet] Found worksheets."
  );

  const spreadsheet = await upsertSpreadsheetInDb(
    connector,
    documentId,
    file,
    parentInternalId
  );

  const parents = await getParents({
    connectorId,
    internalId: documentId,
    startSyncTs,
  });

  await upsertDataSourceFolder({
    dataSourceConfig: dataSourceConfigFromConnector(connector),
    folderId: documentId,
    title: file.name ?? "Untitled spreadsheet",
    parents,
    parentId: parentInternalId,
    mimeType: INTERNAL_MIME_TYPES.MICROSOFT.SPREADSHEET,
    sourceUrl: file.webUrl ?? undefined,
  });

  // List synced sheets.
  const syncedWorksheets = await spreadsheet.fetchChildren();

  const successfulSheetIdImports: string[] = [];
  for (const worksheet of worksheetsRes.value) {
    await heartbeat();
    if (worksheet.id) {
      const worksheetInternalId = getWorksheetInternalId(worksheet, documentId);
      const importResult = await processSheet({
        client,
        connector,
        spreadsheet: file,
        spreadsheetInternalId: documentId,
        worksheet,
        worksheetInternalId,
        localLogger,
        startSyncTs,
      });
      if (importResult.isOk()) {
        successfulSheetIdImports.push(worksheetInternalId);
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

  localLogger.info("[Spreadsheet] Done.");

  return new Ok(null);
}

export async function deleteAllSheets(
  dataSourceConfig: DataSourceConfig,
  spreadsheet: MicrosoftNodeResource
) {
  await concurrentExecutor(
    await spreadsheet.fetchChildren(),
    async (sheet) => {
      await deleteDataSourceTable({
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
