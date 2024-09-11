import type { ModelId } from "@dust-tt/types";
import {
  getGoogleSheetTableId,
  InvalidStructuredDataHeaderError,
  slugify,
} from "@dust-tt/types";
import { Context } from "@temporalio/activity";
import { stringify } from "csv-stringify/sync";
import tracer from "dd-trace";
import type { sheets_v4 } from "googleapis";
import { google } from "googleapis";
import type { OAuth2Client } from "googleapis-common";

import { getFileParentsMemoized } from "@connectors/connectors/google_drive/lib/hierarchy";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { MAX_FILE_SIZE_TO_DOWNLOAD } from "@connectors/lib/data_sources";
import { deleteTable, upsertTableFromCsv } from "@connectors/lib/data_sources";
import { ProviderWorkflowError } from "@connectors/lib/error";
import type { GoogleDriveFiles } from "@connectors/lib/models/google_drive";
import { GoogleDriveSheet } from "@connectors/lib/models/google_drive";
import type { Logger } from "@connectors/logger/logger";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { GoogleDriveObjectType } from "@connectors/types/google_drive";

const MAXIMUM_NUMBER_OF_GSHEET_ROWS = 50000;

type Sheet = sheets_v4.Schema$ValueRange & {
  id: number;
  spreadsheet: {
    id: string;
    title: string;
  };
  title: string;
};

async function upsertSheetInDb(connector: ConnectorResource, sheet: Sheet) {
  await GoogleDriveSheet.upsert({
    connectorId: connector.id,
    driveFileId: sheet.spreadsheet.id,
    driveSheetId: sheet.id,
    name: sheet.title,
  });
}

async function upsertTable(
  connector: ConnectorResource,
  sheet: Sheet,
  parents: string[],
  rows: string[][],
  loggerArgs: object
) {
  const dataSourceConfig = await dataSourceConfigFromConnector(connector);

  const { id, spreadsheet, title } = sheet;
  const tableId = getGoogleSheetTableId(spreadsheet.id, id);

  const tableName = slugify(
    `${spreadsheet.title.substring(0, 16)}-${title.substring(0, 16)}`
  );

  const tableDescription = `Structured data from the Google Spreadsheet (${spreadsheet.title}) and sheet (${title}`;

  const csv = stringify(rows);

  // Upserting is safe: Core truncates any previous table with the same Id before
  // the operation. Note: Renaming a sheet in Google Drive retains its original Id.
  await upsertTableFromCsv({
    dataSourceConfig,
    tableId,
    tableName,
    tableDescription,
    tableCsv: csv,
    loggerArgs: {
      connectorId: connector.id,
      sheetId: id,
      spreadsheetId: spreadsheet.id,
    },
    truncate: true,
    parents: [tableId, ...parents],
    useAppForHeaderDetection: true,
  });

  logger.info(loggerArgs, "[Spreadsheet] Table upserted.");
}

function findDataRangeAndSelectRows(allRows: string[][]): string[][] {
  // Find the first row with data to determine the range.
  const firstNonEmptyRow = allRows.find((row) =>
    row.some((cell) => cell.trim() !== "")
  );
  if (!firstNonEmptyRow) {
    return []; // No data found.
  }

  // Identify the range of data: Start at the first non-empty cell and end at the nearest following empty cell or row end.
  const startIndex = firstNonEmptyRow.findIndex((cell) => cell.trim() !== "");
  let endIndex = firstNonEmptyRow.findIndex(
    (cell, idx) => idx > startIndex && cell.trim() === ""
  );
  if (endIndex === -1) {
    endIndex = firstNonEmptyRow.length;
  }

  // Select only rows and columns within the data range.
  return allRows
    .map((row) => row.slice(startIndex, endIndex))
    .filter((row) => row.some((cell) => cell.trim() !== ""));
}

function getValidRows(allRows: string[][], loggerArgs: object): string[][] {
  const filteredRows = findDataRangeAndSelectRows(allRows);

  // We assume that the first row is always the headers.
  // Headers are used to assert the number of cells per row.
  const [rawHeaders] = filteredRows;
  if (!rawHeaders || rawHeaders.length === 0) {
    logger.info(
      loggerArgs,
      "[Spreadsheet] Skipping due to empty initial rows."
    );
    return [];
  }

  try {
    const headers = rawHeaders;

    const validRows: string[][] = filteredRows.map((row, index) => {
      // Return raw headers.
      if (index === 0) {
        return headers;
      }

      // If a row has less cells than headers, we fill the gap with empty strings.
      if (row.length < headers.length) {
        const shortfall = headers.length - row.length;
        return [...row, ...Array(shortfall).fill("")];
      }

      // If a row has more cells than headers we truncate the row.
      if (row.length > headers.length) {
        return row.slice(0, headers.length);
      }

      return row;
    });

    if (validRows.length > MAXIMUM_NUMBER_OF_GSHEET_ROWS) {
      logger.info(
        { ...loggerArgs, rowCount: validRows.length },
        `[Spreadsheet] Found sheet with more than ${MAXIMUM_NUMBER_OF_GSHEET_ROWS}, skipping further processing.`
      );

      // If the sheet has too many rows, return an empty array to ignore it.
      return [];
    }

    return validRows;
  } catch (err) {
    logger.info(
      { ...loggerArgs, err },
      `[Spreadsheet] Failed to retrieve valid rows.`
    );

    // If the headers are invalid, return an empty array to ignore it.
    if (err instanceof InvalidStructuredDataHeaderError) {
      return [];
    }

    throw err;
  }
}

async function processSheet(
  connector: ConnectorResource,
  sheet: Sheet,
  parents: string[]
): Promise<boolean> {
  if (!sheet.values) {
    return false;
  }

  const { id, spreadsheet, title } = sheet;
  const loggerArgs = {
    connectorType: "google_drive",
    connectorId: connector.id,
    sheet: {
      id,
      spreadsheet,
      title,
    },
  };

  logger.info(
    loggerArgs,
    "[Spreadsheet] Processing sheet in Google Spreadsheet."
  );

  const rows = await getValidRows(sheet.values, loggerArgs);
  // Assuming the first line as headers, at least one additional data line is required.
  if (rows.length > 1) {
    await upsertTable(connector, sheet, parents, rows, loggerArgs);

    await upsertSheetInDb(connector, sheet);

    return true;
  }

  logger.info(
    loggerArgs,
    "[Spreadsheet] Failed to import sheet. Will be deleted if already synced."
  );

  return false;
}

async function batchGetSheets(
  sheetsAPI: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetRanges: Map<string, Sheet>,
  localLogger: Logger
) {
  const maxCharacters = 1500;
  const sheetRangeKeys = [...sheetRanges.keys()].map((k) => `'${k}'`);
  const allRanges: sheets_v4.Schema$ValueRange[] = [];

  // Chunk sheet ranges into groups such that the concatenated length of each group doesn't exceed the maxCharacters limit (1500).
  const chunks = sheetRangeKeys.reduce<string[][]>((acc, key) => {
    const lastChunk = acc.at(-1);

    if (!lastChunk || lastChunk.join("").length + key.length > maxCharacters) {
      acc.push([key]);
    } else {
      lastChunk.push(key);
    }

    return acc;
  }, []);

  localLogger.info(
    {
      chunkCount: chunks.length,
      sheetCount: sheetRangeKeys.length,
    },
    "[Spreadsheet] Chunked sheet ranges into groups to respect URL character limit."
  );

  for (const chunk of chunks) {
    // Query the API using the previously constructed sheet ranges to fetch
    // the desired data from each corresponding sheet range.
    const sheetRanges = await sheetsAPI.spreadsheets.values.batchGet({
      ranges: chunk,
      spreadsheetId,
      valueRenderOption: "FORMATTED_VALUE",
    });

    const { valueRanges } = sheetRanges.data;
    if (!valueRanges) {
      localLogger.info(
        "[Spreadsheet] No data ranges found in the spreadsheet, skipping further processing."
      );
      continue;
    }

    allRanges.push(...valueRanges);
  }

  return allRanges;
}

async function getAllSheetsFromSpreadSheet(
  sheetsAPI: sheets_v4.Sheets,
  spreadsheet: sheets_v4.Schema$Spreadsheet,
  loggerArgs: object
): Promise<Sheet[]> {
  const { spreadsheetId, properties } = spreadsheet;
  if (!spreadsheetId || !properties) {
    return [];
  }

  const { title: spreadsheetTitle } = properties;

  const localLogger = logger.child({
    ...loggerArgs,
    spreadsheet: {
      id: spreadsheet.spreadsheetId,
    },
    sheetCount: spreadsheet.sheets?.length,
  });

  localLogger.info("[Spreadsheet] List sheets in spreadsheet.");

  // Construct the sheet ranges using the sheet name. If we do not provide any
  // specific A1 notation, the API will capture the maximum range available on
  // the sheet.
  const sheetRanges = new Map<string, Sheet>();
  for (const sheet of spreadsheet.sheets ?? []) {
    const { properties } = sheet;
    if (!properties) {
      continue;
    }

    const { sheetId, sheetType, title } = properties;
    // We only support "GRID" sheet.
    // For spreadsheet with one unique sheet, sheetId will be zero.
    if (
      sheetType !== "GRID" ||
      !title ||
      sheetId === undefined ||
      sheetId === null
    ) {
      continue;
    }

    sheetRanges.set(title, {
      id: sheetId,
      spreadsheet: {
        id: spreadsheetId,
        title: spreadsheetTitle ?? "Untitled Spreadsheet",
      },
      title,
    });
  }

  const valueRanges = await batchGetSheets(
    sheetsAPI,
    spreadsheetId,
    sheetRanges,
    localLogger
  );

  if (valueRanges.length === 0) {
    localLogger.info(
      "[Spreadsheet] No data ranges found in the spreadsheet, skipping further processing."
    );
    return [];
  }

  const sheets: Sheet[] = [];
  for (const [sheetName, sheet] of sheetRanges) {
    // To locate the value range for the current sheet within the batch get response,
    // we use the sheet name in the format Sheet1!<range> or 'Details-View'!<range>. This notation helps us
    // match and extract the appropriate range from the response for the current sheet.
    const valueRangeForSheet = valueRanges.find(
      (s) =>
        s.range?.startsWith(`'${sheetName}'`) || s.range?.startsWith(sheetName)
    );
    if (!valueRangeForSheet) {
      localLogger.info(
        {
          sheetId: sheet.id,
        },
        "[Spreadsheet] Could not find value range for sheet, skipping further processing."
      );

      continue;
    }

    sheets.push({
      ...valueRangeForSheet,
      ...sheet,
    });
  }

  return sheets;
}

export async function syncSpreadSheet(
  oauth2client: OAuth2Client,
  connectorId: ModelId,
  file: GoogleDriveObjectType,
  startSyncTs: number
): Promise<
  | {
      isSupported: false;
    }
  | {
      isSupported: true;
      skipReason?: string;
    }
> {
  return tracer.trace(
    `gdrive`,
    {
      resource: `syncSpreadSheet`,
    },
    async (span) => {
      span?.setTag("connectorId", connectorId);
      span?.setTag("fileId", file.id);

      const connector = await ConnectorResource.fetchById(connectorId);
      if (!connector) {
        throw new Error("Connector not found.");
      }

      const loggerArgs = {
        connectorId,
      };

      const localLogger = logger.child({
        ...loggerArgs,
        spreadsheet: {
          id: file.id,
          size: file.size,
        },
      });

      localLogger.info("[Spreadsheet] Syncing Google Spreadsheet.");

      // Avoid import attempts for sheets exceeding the max size due to Node constraints.
      if (file.size && file.size > MAX_FILE_SIZE_TO_DOWNLOAD) {
        localLogger.info(
          "[Spreadsheet] Spreadsheet size exceeded, skipping further processing."
        );

        return { isSupported: false };
      }

      const sheetsAPI = google.sheets({ version: "v4", auth: oauth2client });

      const getSpreadsheet = (id: string) =>
        sheetsAPI.spreadsheets.get({ spreadsheetId: id });
      let spreadsheet: Awaited<ReturnType<typeof getSpreadsheet>>;
      // We do 3 local retries for 500 Internal Server Error.
      // If we still get 500 Internal Server Error after 3 retries and the activity already
      // has been retried 20 times, we mark the file as skipped.
      let internalErrorsCount = 0;
      const maxInternalErrors = 3;
      for (;;) {
        try {
          spreadsheet = await getSpreadsheet(file.id);
          break;
        } catch (err) {
          if (isGAxiosServiceUnavailablError(err)) {
            throw new ProviderWorkflowError(
              "google_drive",
              "503 - Service Unavailable from Google Sheets",
              "transient_upstream_activity_error",
              err
            );
          } else if (
            err instanceof Error &&
            "code" in err &&
            err.code === 500
          ) {
            internalErrorsCount++;
            if (internalErrorsCount > maxInternalErrors) {
              if (Context.current().info.attempt > 20) {
                localLogger.info(
                  "[Spreadsheet] Consistently getting 500 Internal Server Error from Google Sheets, skipping further processing."
                );
                return {
                  isSupported: true,
                  skipReason: "google_internal_server_error",
                };
              }
            } else {
              // Allow to locally retry the API call.
              continue;
            }
          }

          throw err;
        }
      }

      const sheets = await getAllSheetsFromSpreadSheet(
        sheetsAPI,
        spreadsheet.data,
        loggerArgs
      );

      // List synced sheets.
      const syncedSheets = await GoogleDriveSheet.findAll({
        where: {
          connectorId: connector.id,
          driveFileId: file.id,
        },
      });

      const parents = [
        file.id,
        ...(
          await getFileParentsMemoized(
            connectorId,
            oauth2client,
            file,
            startSyncTs
          )
        ).map((f) => f.id),
      ];

      const successfulSheetIdImports: number[] = [];
      for (const sheet of sheets) {
        const isImported = await processSheet(connector, sheet, parents);
        if (isImported) {
          successfulSheetIdImports.push(sheet.id);
        }
      }

      // Delete any previously synced sheets that no longer exist in the current spreadsheet
      // or have exceeded the maximum number of rows.
      const deletedSyncedSheets = syncedSheets.filter(
        (synced) =>
          // Check for undefined explicitly, avoiding incorrect filtering
          // due to falsy values (0 can be a valid sheet ID).
          successfulSheetIdImports.find(
            (sheetId) => sheetId === synced.driveSheetId
          ) === undefined
      );
      if (deletedSyncedSheets.length > 0) {
        await deleteAllSheets(connector, deletedSyncedSheets, {
          driveFileId: spreadsheet.data.spreadsheetId ?? "",
        });
      }

      return { isSupported: true };
    }
  );
}

async function deleteSheetForSpreadsheet(
  connector: ConnectorResource,
  sheet: GoogleDriveSheet,
  spreadsheetFileId: string
) {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  logger.info(
    {
      connectorId: connector.id,
      sheet,
      spreadsheet: {
        id: spreadsheetFileId,
      },
    },
    "[Spreadsheet] Deleting google drive sheet."
  );

  // First remove the upserted table in core.
  await deleteTable({
    dataSourceConfig,
    tableId: getGoogleSheetTableId(spreadsheetFileId, sheet.driveSheetId),
    loggerArgs: {
      connectorId: connector.id,
      sheetId: sheet.driveSheetId,
      spreadsheetId: spreadsheetFileId,
    },
  });

  // Then delete the row in DB.
  await sheet.destroy();
}

async function deleteAllSheets(
  connector: ConnectorResource,
  sheetsToDelete: GoogleDriveSheet[],
  spreadsheetFile: { driveFileId: string }
) {
  await concurrentExecutor(
    sheetsToDelete,
    async (sheet) =>
      deleteSheetForSpreadsheet(connector, sheet, spreadsheetFile.driveFileId),
    {
      concurrency: 5,
    }
  );
}

export async function deleteSpreadsheet(
  connector: ConnectorResource,
  file: GoogleDriveFiles
) {
  const sheetsInSpreadsheet = await GoogleDriveSheet.findAll({
    where: {
      driveFileId: file.driveFileId,
      connectorId: connector.id,
    },
  });

  logger.info(
    {
      connectorId: connector.id,
      spreadsheet: file,
    },
    "[Spreadsheet] Deleting Google Spreadsheet."
  );

  if (sheetsInSpreadsheet.length > 0) {
    await deleteAllSheets(connector, sheetsInSpreadsheet, file);
  }
}

function isGAxiosServiceUnavailablError(err: unknown): err is Error {
  return err instanceof Error && "code" in err && err.code === 503;
}
