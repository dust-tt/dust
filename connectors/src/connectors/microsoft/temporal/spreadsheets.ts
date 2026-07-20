// biome-ignore lint/suspicious/noImportCycles: ignored using `--suppress`
import { getMicrosoftClient } from "@connectors/connectors/microsoft";
import { MicrosoftThrottlingError } from "@connectors/connectors/microsoft/lib/errors";
import {
  getAllPaginatedEntities,
  getDriveItemInternalId,
  getWorksheetInternalId,
  getWorksheetRangeText,
  getWorksheets,
  getWorksheetUsedRangeMetadata,
  wrapMicrosoftGraphAPIWithResult,
} from "@connectors/connectors/microsoft/lib/graph_api";
import type { DriveItem } from "@connectors/connectors/microsoft/lib/types";
import {
  getColumnsFromListItem,
  markInternalIdAsSkipped,
} from "@connectors/connectors/microsoft/lib/utils";
// biome-ignore lint/suspicious/noImportCycles: ignored using `--suppress`
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
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { Client } from "@microsoft/microsoft-graph-client";
import { GraphError } from "@microsoft/microsoft-graph-client";
import type { WorkbookWorksheet } from "@microsoft/microsoft-graph-types";
import { stringify } from "csv-stringify/sync";

const MAXIMUM_NUMBER_OF_EXCEL_SHEET_ROWS = 50000;

// ≈50k rows × 60 cols equivalent. Checked on used-range metadata at probe time,
// before any cell values are fetched.
const MAXIMUM_NUMBER_OF_EXCEL_SHEET_CELLS = 3_000_000;

// Per-request cell budget: keeps each range response to ~1-2MB of JSON so parse
// transients stay in the single-digit MB per in-flight file.
const MAXIMUM_EXCEL_CELLS_PER_RANGE_REQUEST = 100_000;

// Rows-per-chunk ceiling so narrow sheets still heartbeat regularly and
// individual Graph reads stay fast.
const MAXIMUM_EXCEL_CHUNK_ROWS = 5_000;

// Aligned with MAX_CSV_SIZE (50MB) enforced by upsertDataSourceTableFromCsv;
// checked incrementally during accumulation so we abort before building an
// oversized CSV in memory.
const MAXIMUM_EXCEL_CSV_BYTES = 50 * 1024 * 1024;

// 0-based column index -> A1 letters (0 -> "A", 25 -> "Z", 26 -> "AA").
export function columnIndexToLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

// Bounded A1 window addresses covering the used range, top to bottom. The used
// range may not start at A1: rowIndex/columnIndex are the 0-based coordinates
// of its first cell, while A1 rows are 1-based.
export function computeRangeChunkAddresses({
  rowIndex,
  columnIndex,
  rowCount,
  columnCount,
}: {
  rowIndex: number;
  columnIndex: number;
  rowCount: number;
  columnCount: number;
}): string[] {
  const effectiveColumnCount = Math.max(1, columnCount);
  const chunkRowCount = Math.min(
    MAXIMUM_EXCEL_CHUNK_ROWS,
    Math.max(
      1,
      Math.floor(MAXIMUM_EXCEL_CELLS_PER_RANGE_REQUEST / effectiveColumnCount)
    )
  );
  const firstColumnLetter = columnIndexToLetter(columnIndex);
  const lastColumnLetter = columnIndexToLetter(
    columnIndex + effectiveColumnCount - 1
  );
  const addresses: string[] = [];
  for (let start = 0; start < rowCount; start += chunkRowCount) {
    const firstRow = rowIndex + start + 1;
    const lastRow = rowIndex + Math.min(start + chunkRowCount, rowCount);
    addresses.push(
      `${firstColumnLetter}${firstRow}:${lastColumnLetter}${lastRow}`
    );
  }
  return addresses;
}

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
  csv: string,
  tags: string[]
) {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const tableName = slugify(
    `${spreadsheet.name?.substring(0, 16)}-${worksheet.name?.substring(0, 16)}`
  );

  const tableDescription = `Structured data from the Excel Spreadsheet (${spreadsheet.name}) and sheet (${worksheet.name}`;

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

// Persist the skip reason (honored via knownSkippedWorksheetIds on subsequent
// syncs) and drop any table a previous sync may have upserted so agents don't
// keep querying stale data. deleteDataSourceTable tolerates missing tables.
async function skipOversizedWorksheet({
  connector,
  spreadsheet,
  spreadsheetInternalId,
  worksheetInternalId,
  reason,
}: {
  connector: ConnectorResource;
  spreadsheet: DriveItem;
  spreadsheetInternalId: string;
  worksheetInternalId: string;
  reason: "too_many_rows" | "too_many_cells" | "csv_too_large";
}): Promise<void> {
  await markInternalIdAsSkipped({
    internalId: worksheetInternalId,
    connectorId: connector.id,
    parentInternalId: spreadsheetInternalId,
    reason,
    file: spreadsheet,
  });
  await deleteDataSourceTable({
    dataSourceConfig: dataSourceConfigFromConnector(connector),
    tableId: worksheetInternalId,
    loggerArgs: {
      connectorId: connector.id,
      sheetId: worksheetInternalId,
      spreadsheetId: spreadsheetInternalId,
    },
  });
}

// Shared error handling for the used-range probe and each chunked range read.
async function handleSheetFetchError({
  error,
  connector,
  spreadsheet,
  spreadsheetInternalId,
  worksheetInternalId,
  localLogger,
  loggerArgs,
}: {
  error: Error;
  connector: ConnectorResource;
  spreadsheet: DriveItem;
  spreadsheetInternalId: string;
  worksheetInternalId: string;
  localLogger: Logger;
  loggerArgs: Record<string, unknown>;
}): Promise<Result<null, Error>> {
  localLogger.error(
    { ...loggerArgs, error },
    "[Spreadsheet] Failed to fetch sheet content."
  );

  // Rethrow throttling so the activity interceptor converts it into an
  // ApplicationFailure honoring Retry-After, instead of silently dropping the
  // sheet for the whole sync.
  if (error instanceof MicrosoftThrottlingError) {
    throw error;
  }

  if (error instanceof GraphError && error.statusCode === 504) {
    await markInternalIdAsSkipped({
      internalId: worksheetInternalId,
      connectorId: connector.id,
      parentInternalId: spreadsheetInternalId,
      reason: "error_fetching_content",
      file: spreadsheet,
    });
    // Ok so the freshly-written skip row survives the stale-sheet deletion
    // pass in handleSpreadSheet and is honored on the next sync.
    return new Ok(null);
  }

  return new Err(error);
}

export async function processSheet({
  client,
  connector,
  spreadsheet,
  spreadsheetInternalId,
  worksheet,
  worksheetInternalId,
  localLogger,
  startSyncTs,
  heartbeat,
}: {
  client: Client;
  connector: ConnectorResource;
  spreadsheet: DriveItem;
  spreadsheetInternalId: string;
  worksheet: WorkbookWorksheet;
  worksheetInternalId: string;
  localLogger: Logger;
  startSyncTs: number;
  heartbeat: () => Promise<void>;
}): Promise<Result<null, Error>> {
  if (!worksheet.id) {
    return new Err(new Error("Worksheet has no id"));
  }

  const loggerArgs = {
    sheet: {
      documentId: spreadsheetInternalId,
      worksheetId: worksheet.id,
      name: worksheet.name,
    },
  };

  // Probe the used range's dimensions before fetching any cell values, so
  // oversized sheets are rejected without ever materializing their content.
  const metadataRes = await wrapMicrosoftGraphAPIWithResult(() =>
    getWorksheetUsedRangeMetadata(localLogger, client, worksheetInternalId)
  );

  if (metadataRes.isErr()) {
    return handleSheetFetchError({
      error: metadataRes.error,
      connector,
      spreadsheet,
      spreadsheetInternalId,
      worksheetInternalId,
      localLogger,
      loggerArgs,
    });
  }

  const rowIndex = metadataRes.value.rowIndex ?? 0;
  const columnIndex = metadataRes.value.columnIndex ?? 0;
  const rowCount = metadataRes.value.rowCount ?? 0;
  const columnCount = metadataRes.value.columnCount ?? 0;
  // cellCount may be missing; never trust it alone.
  const cellCount = Math.max(
    metadataRes.value.cellCount ?? 0,
    rowCount * columnCount
  );

  localLogger.info(
    { ...loggerArgs, rowCount, columnCount, cellCount },
    "[Spreadsheet] Processing sheet in Microsoft Excel."
  );

  if (rowCount > MAXIMUM_NUMBER_OF_EXCEL_SHEET_ROWS) {
    localLogger.info(
      { ...loggerArgs, rowCount },
      `[Spreadsheet] Found sheet with more than ${MAXIMUM_NUMBER_OF_EXCEL_SHEET_ROWS} rows, skipping.`
    );
    await skipOversizedWorksheet({
      connector,
      spreadsheet,
      spreadsheetInternalId,
      worksheetInternalId,
      reason: "too_many_rows",
    });
    return new Ok(null);
  }

  if (cellCount > MAXIMUM_NUMBER_OF_EXCEL_SHEET_CELLS) {
    localLogger.info(
      { ...loggerArgs, rowCount, columnCount, cellCount },
      `[Spreadsheet] Found sheet with more than ${MAXIMUM_NUMBER_OF_EXCEL_SHEET_CELLS} cells, skipping.`
    );
    await skipOversizedWorksheet({
      connector,
      spreadsheet,
      spreadsheetInternalId,
      worksheetInternalId,
      reason: "too_many_cells",
    });
    return new Ok(null);
  }

  // Assuming the first line as headers, at least one additional data line is
  // required. An empty sheet probes as a single A1 cell (rowCount 1).
  if (rowCount <= 1) {
    localLogger.info(
      loggerArgs,
      "[Spreadsheet] Failed to import sheet. Will be deleted if already synced."
    );
    return new Err(new Error(`Table ${worksheet.id} is empty`));
  }

  // Fetch the used range in bounded windows, strictly sequentially (Microsoft
  // advises against parallel requests to the same workbook), and build the CSV
  // chunk by chunk so the full cell matrix is never resident in memory. If the
  // sheet changes between the probe and the reads, removed cells come back as
  // "" and rows added below the probed range are picked up on the next sync.
  const csvParts: string[] = [];
  let csvByteLength = 0;
  const addresses = computeRangeChunkAddresses({
    rowIndex,
    columnIndex,
    rowCount,
    columnCount,
  });
  for (const address of addresses) {
    await heartbeat();

    const chunkRes = await wrapMicrosoftGraphAPIWithResult(() =>
      getWorksheetRangeText(localLogger, client, worksheetInternalId, address)
    );

    if (chunkRes.isErr()) {
      return handleSheetFetchError({
        error: chunkRes.error,
        connector,
        spreadsheet,
        spreadsheetInternalId,
        worksheetInternalId,
        localLogger,
        loggerArgs,
      });
    }

    const chunkRows: string[][] | null | undefined = chunkRes.value.text;
    if (!chunkRows || chunkRows.length === 0) {
      localLogger.info(
        { ...loggerArgs, address },
        "[Spreadsheet] Cannot get any row from sheet."
      );

      return new Err(
        new Error(
          `Cannot get any row from sheet ${worksheet.id} (range ${address}) in document ${spreadsheet.id}`
        )
      );
    }

    const csvPart = stringify(chunkRows);
    csvByteLength += Buffer.byteLength(csvPart);
    if (csvByteLength > MAXIMUM_EXCEL_CSV_BYTES) {
      localLogger.info(
        { ...loggerArgs, csvByteLength, address },
        `[Spreadsheet] Sheet CSV exceeds ${MAXIMUM_EXCEL_CSV_BYTES} bytes, skipping.`
      );
      await skipOversizedWorksheet({
        connector,
        spreadsheet,
        spreadsheetInternalId,
        worksheetInternalId,
        reason: "csv_too_large",
      });
      return new Ok(null);
    }
    csvParts.push(csvPart);
  }

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
    await getMicrosoftClient(connector.connectionId),
    localLogger
  );

  try {
    await upsertMSTable(
      connector,
      worksheetInternalId,
      spreadsheet,
      worksheet,
      parents,
      csvParts.join(""),
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

  const client = await getMicrosoftClient(connector.connectionId);

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

  // Worksheets we already know are permanently unserviceable (e.g. Microsoft Graph
  // returned a 504 on a previous attempt) so we don't repeatedly pay for a Graph
  // call we already know will fail. See connectors #9623.
  const knownSkippedWorksheetIds = new Set(
    syncedWorksheets
      .filter((synced) => !!synced.skipReason)
      .map((synced) => synced.internalId)
  );

  const successfulSheetIdImports: string[] = [];
  for (const worksheet of worksheetsRes.value) {
    await heartbeat();
    if (worksheet.id) {
      const worksheetInternalId = getWorksheetInternalId(worksheet, documentId);

      if (knownSkippedWorksheetIds.has(worksheetInternalId)) {
        localLogger.info(
          { worksheetId: worksheet.id, name: worksheet.name },
          "[Spreadsheet] Skipping worksheet with a previously persisted skip reason."
        );
        // Keep it out of the deletion pass below, the skip reason should be preserved.
        successfulSheetIdImports.push(worksheetInternalId);
        continue;
      }

      const importResult = await processSheet({
        client,
        connector,
        spreadsheet: file,
        spreadsheetInternalId: documentId,
        worksheet,
        worksheetInternalId,
        localLogger,
        startSyncTs,
        heartbeat,
      });
      if (importResult.isOk()) {
        successfulSheetIdImports.push(worksheetInternalId);
      }
    }
  }

  // Delete any previously synced sheets that no longer exist in the current spreadsheet
  // or came back empty. Oversized or unfetchable sheets are marked skipped and kept.
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
