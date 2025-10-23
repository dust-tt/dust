import { Context } from "@temporalio/activity";
import { stringify } from "csv-stringify/sync";
import tracer from "dd-trace";
import type { sheets_v4 } from "googleapis";
import { google } from "googleapis";
import type { GaxiosResponse, OAuth2Client } from "googleapis-common";
import { GaxiosError } from "googleapis-common";

import {
  getSourceUrlForGoogleDriveFiles,
  getSourceUrlForGoogleDriveSheet,
} from "@connectors/connectors/google_drive";
import { getFileParentsMemoized } from "@connectors/connectors/google_drive/lib/hierarchy";
import { getInternalId } from "@connectors/connectors/google_drive/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  deleteDataSourceFolder,
  deleteDataSourceTable,
  ignoreTablesError,
  MAX_FILE_SIZE_TO_DOWNLOAD,
  upsertDataSourceFolder,
  upsertDataSourceTableFromCsv,
} from "@connectors/lib/data_sources";
import { ProviderWorkflowError, TablesError } from "@connectors/lib/error";
import type { GoogleDriveFiles } from "@connectors/lib/models/google_drive";
import { GoogleDriveSheet } from "@connectors/lib/models/google_drive";
import type { Logger } from "@connectors/logger/logger";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import type { GoogleDriveObjectType } from "@connectors/types";
import {
  getGoogleSheetTableId,
  INTERNAL_MIME_TYPES,
  InvalidStructuredDataHeaderError,
  slugify,
} from "@connectors/types";

const MAXIMUM_NUMBER_OF_GSHEET_ROWS = 50000;

export type Sheet = sheets_v4.Schema$ValueRange & {
  id: number;
  spreadsheet: {
    id: string;
    title: string;
  };
  title: string;
};

async function upsertSheetInDb(
  connector: ConnectorResource,
  sheet: Sheet,
  upsertError: TablesError | null
) {
  await GoogleDriveSheet.upsert({
    connectorId: connector.id,
    driveFileId: sheet.spreadsheet.id,
    driveSheetId: sheet.id,
    name: sheet.title,
    notUpsertedReason: upsertError?.type || null,
  });
}

async function upsertGdriveTable(
  connector: ConnectorResource,
  sheet: Sheet,
  parents: string[],
  rows: string[][],
  tags: string[]
): Promise<TablesError | null> {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const { id, spreadsheet, title } = sheet;
  const tableId = getGoogleSheetTableId(spreadsheet.id, id);

  const tableName = slugify(
    `${spreadsheet.title.substring(0, 16)}-${title.substring(0, 16)}`
  );

  const tableDescription = `Structured data from the Google Spreadsheet (${spreadsheet.title}) and sheet (${title}`;

  const csv = stringify(rows);

  // Upserting is safe: Core truncates any previous table with the same Id before
  // the operation. Note: Renaming a sheet in Google Drive retains its original Id.
  return ignoreTablesError("Google Drive GSheet", () =>
    upsertDataSourceTableFromCsv({
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
      parentId: parents[0] || null,
      title: `${spreadsheet.title} - ${title}`,
      mimeType: "application/vnd.google-apps.spreadsheet",
      sourceUrl: getSourceUrlForGoogleDriveSheet(sheet),
      tags,
    })
  );
}

function findDataRangeAndSelectRows(allRows: string[][]): string[][] {
  // Find the first row with data to determine the range.
  const nonEmptyRow = allRows.filter((row) =>
    row.some((cell) => cell.trim() !== "")
  );

  return nonEmptyRow;
}

function getValidRows(allRows: string[][], loggerArgs: object): string[][] {
  const filteredRows = findDataRangeAndSelectRows(allRows);

  const maxCols = filteredRows.reduce(
    (acc, row) => (row.length > acc ? row.length : acc),
    0
  );

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
    const validRows: string[][] = filteredRows.map((row) => {
      // If a row has less cells than headers, we fill the gap with empty strings.
      if (row.length < maxCols) {
        const shortfall = maxCols - row.length;
        return [...row, ...Array(shortfall).fill("")];
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
  parents: string[],
  tags: string[]
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

  const rows = getValidRows(sheet.values, loggerArgs);
  // Assuming the first line as headers, at least one additional data line is required.
  if (rows.length > 1) {
    let upsertError = null;
    try {
      upsertError = await upsertGdriveTable(
        connector,
        sheet,
        parents,
        rows,
        tags
      );
    } catch (err) {
      if (err instanceof TablesError) {
        logger.warn(
          { ...loggerArgs, error: err },
          "[Spreadsheet] Tables error - skipping (but not failing)."
        );
        upsertError = err;
      } else {
        logger.error(
          { ...loggerArgs, error: err },
          "[Spreadsheet] Failed to upsert table."
        );
        throw err;
      }
    }

    await upsertSheetInDb(connector, sheet, upsertError);

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

    let sheetRanges: GaxiosResponse<sheets_v4.Schema$BatchGetValuesResponse>;
    try {
      sheetRanges = await sheetsAPI.spreadsheets.values.batchGet({
        ranges: chunk,
        spreadsheetId,
        valueRenderOption: "FORMATTED_VALUE",
      });
    } catch (err) {
      if (isStringTooLongError(err)) {
        // Ignore when the string is too long.
        continue;
      } else if (isUnableToParseError(err)) {
        // Ignore when unable to parse the range.
        continue;
      } else {
        throw err;
      }
    }

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
          if (isGAxiosServiceUnavailableError(err)) {
            throw new ProviderWorkflowError(
              "google_drive",
              "503 - Service Unavailable from Google Sheets",
              "transient_upstream_activity_error",
              err
            );
          } else if (isGAxiosInternalServerError(err)) {
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
              // Allow locally retrying the API call.
              continue;
            }
          } else if (isGAxiosNotFoundError(err)) {
            localLogger.info(
              "[Spreadsheet] Consistently getting 404 Not Found from Google Sheets, skipping further processing."
            );
            return {
              isSupported: false,
            };
          } else if (isGAxiosBadRequestError(err)) {
            // We can ignore 400 Bad Request errors as they are not actionable. It's just a malformed content from the spreadsheet, we can't do much
            localLogger.warn(
              { err },
              "[Spreadsheet] Getting 400 Bad Request from Google Sheets, skipping further processing."
            );
            return {
              isSupported: false,
              skipReason: "google_bad_request_error",
            };
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

      const parentGoogleIds = await getFileParentsMemoized(
        connectorId,
        oauth2client,
        file,
        startSyncTs
      );
      const parents = parentGoogleIds.map((parent) => getInternalId(parent));

      // Upsert spreadsheet as a folder, because it is a parent of the sheets.
      await upsertDataSourceFolder({
        dataSourceConfig: dataSourceConfigFromConnector(connector),
        folderId: getInternalId(file.id),
        parents,
        parentId: parents[1] || null,
        title: spreadsheet.data.properties?.title ?? "Untitled Spreadsheet",
        mimeType: INTERNAL_MIME_TYPES.GOOGLE_DRIVE.SPREADSHEET,
        sourceUrl: getSourceUrlForGoogleDriveFiles(file),
      });

      const successfulSheetIdImports: number[] = [];
      for (const sheet of sheets) {
        const isImported = await processSheet(
          connector,
          sheet,
          parents,
          file.labels
        );
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
  await deleteDataSourceTable({
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

  // Delete the spreadsheet folder, that contains the sheets.
  await deleteDataSourceFolder({
    dataSourceConfig: dataSourceConfigFromConnector(connector),
    folderId: getInternalId(file.driveFileId),
    loggerArgs: {
      connectorId: connector.id,
      spreadsheetId: file.driveFileId,
    },
  });

  if (sheetsInSpreadsheet.length > 0) {
    await deleteAllSheets(connector, sheetsInSpreadsheet, file);
  }
}

function isGAxiosServiceUnavailableError(err: unknown): err is Error {
  return err instanceof Error && "code" in err && err.code === 503;
}

function isGAxiosInternalServerError(err: unknown): err is Error {
  return err instanceof Error && "code" in err && err.code === 500;
}

function isGAxiosNotFoundError(err: unknown): err is Error {
  return err instanceof Error && "code" in err && err.code === 404;
}

function isGAxiosBadRequestError(err: unknown): err is Error {
  return err instanceof Error && "code" in err && err.code === 400;
}

function isStringTooLongError(
  err: unknown
): err is Error & { code: "ERR_STRING_TOO_LONG" } {
  return (
    err instanceof Error && "code" in err && err.code === "ERR_STRING_TOO_LONG"
  );
}

function isUnableToParseError(err: unknown): err is GaxiosError {
  return (
    err instanceof GaxiosError &&
    err.response?.status === 400 &&
    err.response?.data &&
    typeof err.response.data === "object" &&
    "error" in err.response.data &&
    "message" in err.response.data.error &&
    typeof err.response.data.error.message === "string" &&
    err.response.data.error.message.includes("Unable to parse range")
  );
}
