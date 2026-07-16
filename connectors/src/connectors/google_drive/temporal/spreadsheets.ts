import {
  getSourceUrlForGoogleDriveFiles,
  getSourceUrlForGoogleDriveSheet,
  // biome-ignore lint/suspicious/noImportCycles: ignored using `--suppress`
} from "@connectors/connectors/google_drive";
import { getFileParentsMemoized } from "@connectors/connectors/google_drive/lib/hierarchy";
import { getInternalId } from "@connectors/connectors/google_drive/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  deleteDataSourceFolder,
  deleteDataSourceTable,
  ignoreTablesError,
  MAX_CSV_SIZE,
  MAX_FILE_SIZE_TO_DOWNLOAD,
  upsertDataSourceFolder,
  upsertDataSourceTableFromCsv,
} from "@connectors/lib/data_sources";
import { ProviderWorkflowError, TablesError } from "@connectors/lib/error";
import type { GoogleDriveFilesModel } from "@connectors/lib/models/google_drive";
import { GoogleDriveSheetModel } from "@connectors/lib/models/google_drive";
import { heartbeat } from "@connectors/lib/temporal";
import type { Logger } from "@connectors/logger/logger";
import { getActivityLogger, getLoggerArgs } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { GoogleDriveObjectType, ModelId } from "@connectors/types";
import {
  getGoogleSheetTableId,
  INTERNAL_MIME_TYPES,
  slugify,
} from "@connectors/types";
import { assertNever } from "@dust-tt/client";
import { Context } from "@temporalio/activity";
import { stringify } from "csv-stringify/sync";
import tracer from "dd-trace";
import type { sheets_v4 } from "googleapis";
import { google } from "googleapis";
import type { OAuth2Client } from "googleapis-common";
import { GaxiosError } from "googleapis-common";
import type { Readable } from "stream";
import { pipeline } from "stream/promises";
import { parser } from "stream-json";
import { pick } from "stream-json/filters/Pick";
import { streamArray } from "stream-json/streamers/StreamArray";

const MAXIMUM_NUMBER_OF_GSHEET_ROWS = 50000;
const MAXIMUM_NUMBER_OF_SHEETS_PER_SPREADSHEET = 50;
// Rows per "rows" event handed to the consumer: amortizes heartbeats and CSV-builder calls while
// keeping the largest buffered unit small.
const STREAM_ROWS_PER_CHUNK = 1000;

export type Sheet = {
  id: number;
  spreadsheet: {
    id: string;
    title: string;
  };
  title: string;
  gridRowCount: number;
};

export type SheetRowsEvent =
  // One chunk of parsed rows (at most STREAM_ROWS_PER_CHUNK), in sheet order, each row in
  // column order with trailing empty cells trimmed by the API.
  | { kind: "rows"; rows: string[][] }
  // The sheet's values could not be read (e.g. the sheet was renamed mid-sync and the range no
  // longer parses); the sheet is skipped and deleted if previously synced.
  | { kind: "sheet_not_readable" }
  // Google consistently returns 500s on an activity that already retried 20+ times; the whole
  // file is skipped.
  | { kind: "skip_file"; skipReason: string };

export type StreamSheetRows = (
  sheet: Sheet
) => AsyncGenerator<SheetRowsEvent, void>;

type SheetContent =
  | { outcome: "csv"; csv: string; rowCount: number }
  | { outcome: "no_content" }
  | { outcome: "too_large" };

export type SheetContentEvent =
  | { type: "sheet"; sheet: Sheet; content: SheetContent }
  | { type: "skip_file"; skipReason: string };

function getSpreadsheetLoggerArgs(fileId: string) {
  return {
    documentId: getInternalId(fileId),
    fileId,
    spreadsheetId: fileId,
  };
}

async function upsertSheetInDb(
  connector: ConnectorResource,
  sheet: Sheet,
  upsertError: TablesError | null
) {
  await GoogleDriveSheetModel.upsert({
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
  csv: string,
  tags: string[]
): Promise<TablesError | null> {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const { id, spreadsheet, title } = sheet;
  const tableId = getGoogleSheetTableId(spreadsheet.id, id);

  const tableName = slugify(
    `${spreadsheet.title.substring(0, 16)}-${title.substring(0, 16)}`
  );

  const tableDescription = `Structured data from the Google Spreadsheet (${spreadsheet.title}) and sheet (${title}`;

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
        ...getSpreadsheetLoggerArgs(spreadsheet.id),
        sheetId: id,
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

type AppendRowsOutcome = "ok" | "no_content" | "too_large";

// Incrementally builds one sheet's CSV: each non-empty row is stringified as soon as it arrives
// and the row arrays are released, so the full sheet contents are never buffered. Padding every
// row to the widest row of the sheet is only possible once all rows have been seen, so each CSV
// line is kept with its column count and the missing empty cells (bare commas) are appended in
// finalize().
class SheetCsvBuilder {
  private csvLines: { line: string; columnCount: number }[] = [];
  private maxColumnCount = 0;
  // Unpadded size: stringified lines plus one newline byte each.
  private csvSizeBytes = 0;
  // Sum of the column counts of all appended lines, to derive the padding size.
  private sumColumnCounts = 0;

  constructor(private readonly localLogger: Logger) {}

  // Exact byte size of the final CSV once every line is padded to maxColumnCount columns with
  // one-byte commas.
  private paddedCsvSizeBytes(): number {
    return (
      this.csvSizeBytes +
      this.maxColumnCount * this.csvLines.length -
      this.sumColumnCounts
    );
  }

  appendRows(rows: string[][]): AppendRowsOutcome {
    for (const row of rows) {
      // Skip rows with no data.
      if (!row.some((cell) => cell.trim() !== "")) {
        continue;
      }

      if (this.csvLines.length >= MAXIMUM_NUMBER_OF_GSHEET_ROWS) {
        this.localLogger.info(
          { rowCount: this.csvLines.length },
          `[Spreadsheet] Found sheet with more than ${MAXIMUM_NUMBER_OF_GSHEET_ROWS}, skipping further processing.`
        );
        return "no_content";
      }

      const line = stringify([row]).slice(0, -1);
      this.csvLines.push({ line, columnCount: row.length });
      this.maxColumnCount = Math.max(this.maxColumnCount, row.length);
      this.csvSizeBytes += Buffer.byteLength(line, "utf8") + 1;
      this.sumColumnCounts += row.length;

      // Check the padded size on every row: a new widest row retroactively inflates the padding
      // of every previous line, so a late wide row can blow the cap even when the unpadded
      // content is tiny.
      const paddedCsvSizeBytes = this.paddedCsvSizeBytes();
      if (paddedCsvSizeBytes > MAX_CSV_SIZE) {
        this.localLogger.info(
          { paddedCsvSizeBytes, rowCount: this.csvLines.length },
          "[Spreadsheet] Sheet CSV exceeds the maximum size, skipping further processing."
        );
        return "too_large";
      }
    }

    return "ok";
  }

  finalize(): SheetContent {
    // We assume that the first row is always the headers.
    if (this.csvLines.length === 0) {
      this.localLogger.info(
        "[Spreadsheet] Skipping due to empty initial rows."
      );
      return { outcome: "no_content" };
    }

    this.localLogger.info(
      {
        paddedCsvSizeBytes: this.paddedCsvSizeBytes(),
        rowCount: this.csvLines.length,
      },
      "[Spreadsheet] Fetched sheet content."
    );

    // If a row has less cells than the widest row, fill the gap with empty cells.
    const csv = `${this.csvLines
      .map(
        ({ line, columnCount }) =>
          line + ",".repeat(this.maxColumnCount - columnCount)
      )
      .join("\n")}\n`;

    return { outcome: "csv", csv, rowCount: this.csvLines.length };
  }
}

// Single quotes in sheet titles are escaped by doubling them in A1 notation. A title-only range
// covers the whole sheet; the API trims trailing empty rows from the response.
// Exported for tests.
export function sheetValuesRange(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

// Incrementally parses a values.get JSON response ({ range, majorDimension, values: [...] }),
// yielding the rows of `values` in chunks of at most chunkRows without ever materializing the
// full array — the reason we stream: a sheet's values can exceed both the heap and Node's
// maximum string length. An absent `values` field (empty sheet) yields nothing. The source
// stream is destroyed on early exit so an aborted consumer closes the underlying socket.
// Exported for tests.
export async function* streamRowsFromValuesJson(
  source: Readable,
  chunkRows: number
): AsyncGenerator<string[][], void> {
  const rows = streamArray();
  const done = pipeline(source, parser(), pick({ filter: "values" }), rows);
  // Any pipeline error also surfaces through the iteration below; this handler only prevents an
  // unhandled rejection when the consumer exits the loop early and the pipeline is torn down.
  done.catch(() => {});

  try {
    let chunk: string[][] = [];
    for await (const entry of rows) {
      // StreamArray emits { key, value } pairs, one per element of `values`.
      const row: unknown = entry.value;
      if (!Array.isArray(row)) {
        throw new Error("Unexpected non-array row in sheet values response");
      }
      chunk.push(row);
      if (chunk.length >= chunkRows) {
        yield chunk;
        chunk = [];
      }
    }
    if (chunk.length > 0) {
      yield chunk;
    }
    await done;
  } finally {
    source.destroy();
    rows.destroy();
  }
}

// Streams the CSV content of every sheet, one sheet at a time: row chunks are folded into the
// CSV builder as they arrive on the wire, so live memory is bounded by one chunk, the CSV being
// built (<= MAX_CSV_SIZE) and the one yielded CSV being upserted. Breaking out of a sheet's
// stream (row cap, size cap) tears down the producer and its HTTP stream.
// Exported for tests.
export async function* fetchSheetContentsAsCsv(
  sheets: Sheet[],
  streamSheetRows: StreamSheetRows,
  spreadsheetLogger: Logger
): AsyncGenerator<SheetContentEvent, void> {
  for (const sheet of sheets) {
    const localLogger = spreadsheetLogger.child({
      sheet: {
        id: sheet.id,
        spreadsheet: sheet.spreadsheet,
        title: sheet.title,
      },
    });

    // A sheet with an empty grid has no values to fetch.
    if (sheet.gridRowCount === 0) {
      yield {
        type: "sheet",
        sheet,
        content: { outcome: "no_content" },
      };
      continue;
    }

    localLogger.info("[Spreadsheet] Processing sheet in Google Spreadsheet.");
    const builder = new SheetCsvBuilder(localLogger);
    let earlyContent: SheetContent | null = null;

    streamLoop: for await (const event of streamSheetRows(sheet)) {
      switch (event.kind) {
        case "rows": {
          const appendOutcome = builder.appendRows(event.rows);
          if (appendOutcome !== "ok") {
            // Stop pulling: exiting the loop closes the sheet's HTTP stream.
            earlyContent = { outcome: appendOutcome };
            break streamLoop;
          }
          break;
        }

        case "sheet_not_readable":
          localLogger.info(
            "[Spreadsheet] Could not read sheet values, skipping further processing."
          );
          earlyContent = { outcome: "no_content" };
          break streamLoop;

        case "skip_file":
          yield { type: "skip_file", skipReason: event.skipReason };
          return;

        default:
          assertNever(event);
      }
    }

    yield {
      type: "sheet",
      sheet,
      content: earlyContent ?? builder.finalize(),
    };
  }
}

async function processSheetContent(
  connector: ConnectorResource,
  sheet: Sheet,
  parents: string[],
  tags: string[],
  content: SheetContent,
  spreadsheetLogger: Logger
): Promise<boolean> {
  const { id, spreadsheet, title } = sheet;
  const localLogger = spreadsheetLogger.child({
    sheet: {
      id,
      spreadsheet,
      title,
    },
  });

  switch (content.outcome) {
    case "no_content":
      localLogger.info(
        "[Spreadsheet] Failed to import sheet. Will be deleted if already synced."
      );
      return false;

    case "too_large":
      // Record the sheet as not upserted, like an upsert attempt rejected by the API, so it is
      // kept in the DB and not deleted.
      await upsertSheetInDb(
        connector,
        sheet,
        new TablesError(
          "file_too_large",
          "The file is too large to be processed."
        )
      );
      return true;

    case "csv":
      break;

    default:
      assertNever(content);
  }

  // Assuming the first line as headers, at least one additional data line is required.
  if (content.rowCount <= 1) {
    localLogger.info(
      "[Spreadsheet] Failed to import sheet. Will be deleted if already synced."
    );
    return false;
  }

  let upsertError = null;
  try {
    upsertError = await upsertGdriveTable(
      connector,
      sheet,
      parents,
      content.csv,
      tags
    );
  } catch (err) {
    if (err instanceof TablesError) {
      localLogger.warn(
        { error: err },
        "[Spreadsheet] Tables error - skipping (but not failing)."
      );
      upsertError = err;
    } else {
      localLogger.error(
        { error: err },
        "[Spreadsheet] Failed to upsert table."
      );
      throw err;
    }
  }

  await upsertSheetInDb(connector, sheet, upsertError);

  return true;
}

function getSheetsFromSpreadsheet(
  spreadsheet: sheets_v4.Schema$Spreadsheet,
  logger: Logger
): Sheet[] {
  const { spreadsheetId, properties } = spreadsheet;
  if (!spreadsheetId || !properties) {
    return [];
  }

  const { title: spreadsheetTitle } = properties;

  const localLogger = logger.child({
    spreadsheet: {
      id: spreadsheetId,
    },
    sheetCount: spreadsheet.sheets?.length,
  });

  localLogger.info("[Spreadsheet] List sheets in spreadsheet.");

  const sheets: Sheet[] = [];
  for (const sheet of spreadsheet.sheets ?? []) {
    const { properties } = sheet;
    if (!properties) {
      continue;
    }

    const { gridProperties, sheetId, sheetType, title } = properties;
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

    sheets.push({
      id: sheetId,
      spreadsheet: {
        id: spreadsheetId,
        title: spreadsheetTitle ?? "Untitled Spreadsheet",
      },
      title,
      gridRowCount: gridProperties?.rowCount ?? 0,
    });
  }

  return sheets;
}

export async function syncSpreadSheet(
  oauth2client: OAuth2Client,
  connectorId: ModelId,
  file: GoogleDriveObjectType,
  startSyncTs: number,
  logger: Logger
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

      const localLogger = logger.child({
        ...getLoggerArgs(connector, {
          ...getSpreadsheetLoggerArgs(file.id),
          fileSize: file.size,
          mimeType: file.mimeType,
        }),
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

      const sheets = getSheetsFromSpreadsheet(spreadsheet.data, localLogger);

      if (sheets.length > MAXIMUM_NUMBER_OF_SHEETS_PER_SPREADSHEET) {
        localLogger.info(
          { sheetCount: sheets.length },
          "[Spreadsheet] Spreadsheet has too many sheets, skipping."
        );
        return { isSupported: false, skipReason: "too_many_sheets" };
      }

      // List synced sheets.
      const syncedSheets = await GoogleDriveSheetModel.findAll({
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

      // Sheet values are streamed with one values.get call per sheet, sharing the same local
      // retry budget on 500 Internal Server Error as getSpreadsheet above: 3 local retries
      // across the file, then skip the file if the activity already has been retried 20+ times.
      internalErrorsCount = 0;
      let valuesGetCallCount = 0;
      const streamSheetRows: StreamSheetRows = async function* (sheet) {
        let stream: Readable;
        for (;;) {
          try {
            // Heartbeat once per Sheets API call (retries included): streamed fetches of large
            // spreadsheets can outlast the activity's heartbeat timeout otherwise.
            await heartbeat();
            valuesGetCallCount++;
            const res = await sheetsAPI.spreadsheets.values.get(
              {
                spreadsheetId: file.id,
                range: sheetValuesRange(sheet.title),
                valueRenderOption: "FORMATTED_VALUE",
              },
              { responseType: "stream" }
            );
            stream = res.data;
            break;
          } catch (err) {
            if (isUnableToParseError(err)) {
              // The range no longer parses (e.g. the sheet was renamed mid-sync).
              yield { kind: "sheet_not_readable" };
              return;
            } else if (isGAxiosServiceUnavailableError(err)) {
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
                  yield {
                    kind: "skip_file",
                    skipReason: "google_internal_server_error",
                  };
                  return;
                }
              } else {
                // Allow locally retrying the API call.
                continue;
              }
            }
            throw err;
          }
        }

        // Mid-body failures (socket resets, malformed JSON) are not retried locally: the
        // sheet's partially-built CSV cannot be safely resumed, so they fail the activity and
        // Temporal retries it.
        for await (const rows of streamRowsFromValuesJson(
          stream,
          STREAM_ROWS_PER_CHUNK
        )) {
          await heartbeat();
          yield { kind: "rows", rows };
        }
      };

      const successfulSheetIdImports: number[] = [];
      for await (const event of fetchSheetContentsAsCsv(
        sheets,
        streamSheetRows,
        localLogger
      )) {
        switch (event.type) {
          case "skip_file":
            return { isSupported: true, skipReason: event.skipReason };

          case "sheet": {
            const isImported = await processSheetContent(
              connector,
              event.sheet,
              parents,
              file.labels,
              event.content,
              localLogger
            );
            if (isImported) {
              successfulSheetIdImports.push(event.sheet.id);
            }
            break;
          }

          default:
            assertNever(event);
        }
      }

      localLogger.info(
        { sheetCount: sheets.length, valuesGetCallCount },
        "[Spreadsheet] Fetched sheet values."
      );

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
  sheet: GoogleDriveSheetModel,
  spreadsheetFileId: string
) {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const localLogger = getActivityLogger(
    connector,
    getSpreadsheetLoggerArgs(spreadsheetFileId)
  );
  localLogger.info(
    {
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
      ...getSpreadsheetLoggerArgs(spreadsheetFileId),
      sheetId: sheet.driveSheetId,
    },
  });

  // Then delete the row in DB.
  await sheet.destroy();
}

async function deleteAllSheets(
  connector: ConnectorResource,
  sheetsToDelete: GoogleDriveSheetModel[],
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
  file: GoogleDriveFilesModel
) {
  const sheetsInSpreadsheet = await GoogleDriveSheetModel.findAll({
    where: {
      driveFileId: file.driveFileId,
      connectorId: connector.id,
    },
  });
  const localLogger = getActivityLogger(
    connector,
    getSpreadsheetLoggerArgs(file.driveFileId)
  );
  localLogger.info(
    {
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
      ...getSpreadsheetLoggerArgs(file.driveFileId),
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

// With responseType "stream", gaxios drains a non-2xx body and attaches it as a raw string
// instead of parsed JSON; normalize before inspecting the payload.
function gaxiosResponseData(data: unknown): unknown {
  if (typeof data !== "string") {
    return data;
  }
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function isUnableToParseError(err: unknown): err is GaxiosError {
  if (!(err instanceof GaxiosError) || err.response?.status !== 400) {
    return false;
  }
  const data = gaxiosResponseData(err.response.data);
  return (
    data !== null &&
    typeof data === "object" &&
    "error" in data &&
    data.error !== null &&
    typeof data.error === "object" &&
    "message" in data.error &&
    typeof data.error.message === "string" &&
    data.error.message.includes("Unable to parse range")
  );
}
