import type {
  CoreAPIError,
  CoreAPIRow,
  CoreAPIRowValue,
  CoreAPITable,
  Result,
  WorkspaceType,
} from "@dust-tt/types";
import {
  CoreAPI,
  Err,
  getSanitizedHeaders,
  guessDelimiter,
  Ok,
} from "@dust-tt/types";
import { CsvError, parse } from "csv-parse";
import { DateTime } from "luxon";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";

import type { DataSourceResource } from "../resources/data_source_resource";

const MAX_TABLE_COLUMNS = 512;
const MAX_COLUMN_NAME_LENGTH = 1024;

type CsvParsingError = {
  type:
    | "invalid_delimiter"
    | "invalid_header"
    | "duplicate_header"
    | "invalid_record_length"
    | "invalid_csv"
    | "empty_csv"
    | "too_many_columns"
    | "invalid_row_id";
  message: string;
};

type InputValidationError = {
  type: "too_many_rows";
  message: string;
};

type NotFoundError = {
  type: "table_not_found";
  message: string;
};

type DetectedHeadersType = { header: string[]; rowIndex: number };

export type TableOperationError =
  | {
      type: "internal_server_error";
      coreAPIError: CoreAPIError;
      message: string;
    }
  | {
      type: "invalid_request_error";
      csvParsingError: CsvParsingError;
    }
  | {
      type: "invalid_request_error";
      inputValidationError: InputValidationError;
    }
  | {
      type: "invalid_request_error";
      message: string;
    }
  | {
      type: "not_found_error";
      notFoundError: NotFoundError;
    };

export async function deleteTable({
  owner,
  dataSource,
  tableId,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceResource;
  tableId: string;
}): Promise<Result<null, TableOperationError>> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const deleteRes = await coreAPI.deleteTable({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    tableId,
  });
  if (deleteRes.isErr()) {
    logger.error(
      {
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        dataSourceName: dataSource.name,
        workspaceId: owner.id,
        error: deleteRes.error,
      },
      "Failed to delete table."
    );
    if (deleteRes.error.code === "table_not_found") {
      return new Err({
        type: "not_found_error",
        notFoundError: {
          type: "table_not_found",
          message: "The table you requested was not found.",
        },
      });
    }
    return new Err({
      type: "internal_server_error",
      coreAPIError: deleteRes.error,
      message: "Failed to delete table.",
    });
  }
  // We do not delete the related AgentTablesQueryConfigurationTable entry if any.
  // This is because the table might be created again with the same name and we want to keep the configuration.
  // The Assistant Builder displays an error on the action card if it misses a table.

  return new Ok(null);
}

export async function upsertTableFromCsv({
  auth,
  dataSource,
  tableName,
  tableDescription,
  tableId,
  tableTimestamp,
  tableTags,
  tableParentId,
  tableParents,
  csv,
  truncate,
  detectedHeaders,
  title,
  mimeType,
  sourceUrl,
}: {
  auth: Authenticator;
  dataSource: DataSourceResource;
  tableName: string;
  tableDescription: string;
  tableId: string;
  tableTimestamp: number | null;
  tableTags: string[];
  tableParentId: string | null;
  tableParents: string[];
  csv: string | null;
  truncate: boolean;
  detectedHeaders?: DetectedHeadersType;
  title: string;
  mimeType: string;
  sourceUrl: string | null;
}): Promise<Result<{ table: CoreAPITable }, TableOperationError>> {
  const owner = auth.workspace();

  if (!owner) {
    logger.error(
      {
        type: "internal_server_error",
        message: "Failed to get workspace.",
      },
      "Failed to get workspace."
    );
    return new Err({
      type: "internal_server_error",
      coreAPIError: {
        code: "workspace_not_found",
        message: "Failed to get workspace.",
      },
      message: "Failed to get workspace.",
    });
  }

  if (tableParentId && tableParents && tableParents[1] !== tableParentId) {
    return new Err({
      type: "invalid_request_error",
      message: "Invalid request body, parents[1] and parent_id should be equal",
    });
  }

  const csvRowsRes = csv
    ? await rowsFromCsv({
        auth,
        csv,
        detectedHeaders,
      })
    : null;

  let csvRows: CoreAPIRow[] | undefined = undefined;
  if (csvRowsRes) {
    if (csvRowsRes.isErr()) {
      const errorDetails = {
        type: "invalid_request_error" as const,
        csvParsingError: csvRowsRes.error,
      };
      logger.error(
        {
          ...errorDetails,
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
          dataSourceName: dataSource.name,
          tableName,
          tableId,
        },
        "CSV parsing error."
      );
      return new Err(errorDetails);
    }

    csvRows = csvRowsRes.value.rows;
  }

  if ((csvRows?.length ?? 0) > 500_000) {
    const errorDetails = {
      type: "invalid_request_error" as const,
      inputValidationError: {
        type: "too_many_rows" as const,
        message: `CSV has too many rows: ${csvRows?.length} (max 500_000).`,
      },
    };
    logger.error(
      {
        ...errorDetails,
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        dataSourceName: dataSource.name,
        tableName,
        tableId,
      },
      "CSV input validation error: too many rows."
    );
    return new Err(errorDetails);
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const tableRes = await coreAPI.upsertTable({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    tableId,
    name: tableName,
    description: tableDescription,
    timestamp: tableTimestamp,
    tags: tableTags,
    parentId: tableParentId,
    parents: tableParents,
    title,
    mimeType,
    sourceUrl,
  });

  if (tableRes.isErr()) {
    const errorDetails = {
      type: "internal_server_error" as const,
      coreAPIError: tableRes.error,
      message: "Failed to upsert table.",
    };
    logger.error(
      {
        ...errorDetails,
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        dataSourceName: dataSource.name,
        workspaceId: owner.id,
        tableId,
        tableName,
      },
      "Error upserting table in CoreAPI."
    );
    return new Err(errorDetails);
  }

  if (csvRows) {
    const now = performance.now();
    const rowsRes = await coreAPI.upsertTableRows({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      tableId,
      rows: csvRows,
      truncate,
    });

    logger.info(
      {
        durationMs: performance.now() - now,
        csvRowsLength: csvRows.length,
        csvColsLength: csvRows[0]?.value
          ? Object.keys(csvRows[0].value).length
          : 0,
        workspaceId: owner.id,
        tableId,
        tableName,
      },
      "Upserting table rows"
    );

    if (rowsRes.isErr()) {
      const errorDetails = {
        type: "internal_server_error" as const,
        coreAPIError: rowsRes.error,
        message: "Failed to upsert rows.",
      };
      logger.error(
        {
          ...errorDetails,
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
          dataSourceName: dataSource.name,
          workspaceId: owner.id,
          tableId,
          tableName,
        },
        "Error upserting rows in CoreAPI."
      );

      const delRes = await coreAPI.deleteTable({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        tableId,
      });

      if (delRes.isErr()) {
        logger.error(
          {
            type: "internal_server_error",
            coreAPIError: delRes.error,
            projectId: dataSource.dustAPIProjectId,
            dataSourceId: dataSource.dustAPIDataSourceId,
            dataSourceName: dataSource.name,
            workspaceId: owner.id,
            tableId,
            tableName,
          },
          "Failed to delete table after failed row upsert."
        );
      }
      return new Err(errorDetails);
    }
  }

  return tableRes;
}

export async function rowsFromCsv({
  auth,
  csv,
  detectedHeaders,
}: {
  auth: Authenticator;
  csv: string;
  detectedHeaders?: DetectedHeadersType;
}): Promise<
  Result<
    { detectedHeaders: DetectedHeadersType; rows: CoreAPIRow[] },
    CsvParsingError
  >
> {
  const now = performance.now();
  const delimiter = await guessDelimiter(csv);
  if (!delimiter) {
    return new Err({
      type: "invalid_delimiter",
      message: `Could not detect delimiter.`,
    });
  }

  // this differs with = {} in that it prevent errors when header values clash with object properties such as toString, constructor, ..
  const valuesByCol: Record<string, string[]> = Object.create(null);
  let header, rowIndex;
  try {
    const headerRes = detectedHeaders
      ? new Ok(detectedHeaders)
      : await detectHeaders(csv, delimiter);

    if (headerRes.isErr()) {
      return headerRes;
    }
    ({ header, rowIndex } = headerRes.value);

    const parser = parse(csv, { delimiter });
    let i = 0;
    for await (const anyRecord of parser) {
      if (i++ >= rowIndex) {
        for (const [i, h] of header.entries()) {
          valuesByCol[h] ??= [];
          valuesByCol[h].push((anyRecord[i] ?? "").toString());
        }
      }
    }
  } catch (e) {
    if (e instanceof CsvError) {
      logger.warn({ error: e });
      return new Err({
        type: "invalid_csv",
        message: `Invalid CSV format: Please check for properly matched quotes in your data. ${e.message}`,
      });
    }
    logger.error({ error: e }, "Error parsing CSV");
    throw e;
  }

  if (!Object.values(valuesByCol).some((vs) => vs.length > 0)) {
    return new Err({
      type: "empty_csv",
      message: `CSV is empty.`,
    });
  }

  // Parse values and infer types for each column.
  const parsedValuesByCol: Record<string, CoreAPIRowValue[]> = {};
  for (const [col, valuesRaw] of Object.entries(valuesByCol)) {
    const values = valuesRaw.map((v) => v.trim());

    if (values.every((v) => v === "")) {
      // All values are empty, we skip this column.
      continue;
    }

    // We keep the parsed values from the first parser that succeeds for all non-null values in the column.
    parsedValuesByCol[col] = (() => {
      for (const parser of [
        // number
        (v: string) =>
          /^-?\d+(\.\d+)?$/.test(v.trim()) ? parseFloat(v.trim()) : undefined,
        // date/datetime
        (v: string) => {
          const dateParsers = [
            DateTime.fromISO,
            DateTime.fromRFC2822,
            DateTime.fromHTTP,
            DateTime.fromSQL,
            // Google Spreadsheet date format parser.
            (text: string) => DateTime.fromFormat(text, "d-MMM-yyyy"),
          ];
          const trimmedV = v.trim();
          for (const parse of dateParsers) {
            const parsedDate = parse(trimmedV);
            if (parsedDate.isValid) {
              return {
                type: "datetime" as const,
                epoch: parsedDate.toMillis(),
                string_value: trimmedV,
              };
            }
          }
          return undefined;
        },
        // bool
        (v: string) => {
          const lowerV = v.toLowerCase();
          return lowerV === "true"
            ? true
            : lowerV === "false"
              ? false
              : undefined;
        },
        // string
        (v: string) => v,
      ]) {
        const parsedValues = [];
        for (const v of values) {
          if (v === "") {
            parsedValues.push(null);
            continue;
          }

          const parsedV = parser(v);

          if (parsedV === undefined) {
            // move onto next parser
            break;
          }

          parsedValues.push(parsedV);
        }

        if (parsedValues.length === values.length) {
          return parsedValues;
        }
      }

      throw new Error(
        `Unreachable: could not infer type for column ${col}. Values: ${JSON.stringify(
          values
        )}`
      );
    })();
  }
  const nbRows = (Object.values(parsedValuesByCol)[0] || []).length;
  const rows: CoreAPIRow[] = [];
  for (let i = 0; i < nbRows; i++) {
    const record = header.reduce(
      (acc, h) => {
        const parsedValues = parsedValuesByCol[h];
        acc[h] =
          parsedValues && parsedValues[i] !== undefined ? parsedValues[i] : "";
        return acc;
      },
      {} as Record<string, CoreAPIRowValue>
    );

    const rowId = record["__dust_id"] ?? i.toString();

    if (typeof rowId !== "string") {
      return new Err({
        type: "invalid_row_id",
        message: `Invalid row id: ${rowId}.`,
      });
    }

    delete record["__dust_id"];

    rows.push({ row_id: rowId, value: record });
  }

  logger.info(
    {
      durationMs: performance.now() - now,
      nbRows,
      nbCols: header.length,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    "Parsing CSV"
  );

  return new Ok({ detectedHeaders: { header, rowIndex }, rows });
}

async function staticHeaderDetection(
  firstRow: string[]
): Promise<Result<DetectedHeadersType, CsvParsingError>> {
  const firstRecordCells = firstRow.map(
    (h, i) => h.trim().toLocaleLowerCase() || `col_${i}`
  );

  if (firstRecordCells.some((h) => h.length > MAX_COLUMN_NAME_LENGTH)) {
    return new Err({
      type: "invalid_header",
      message: `Column name is too long (over ${MAX_COLUMN_NAME_LENGTH} characters).`,
    });
  }

  const header = getSanitizedHeaders(firstRecordCells);

  if (header.isErr()) {
    return new Err({ type: "invalid_header", message: header.error.message });
  }

  return new Ok({ header: header.value, rowIndex: 1 });
}

export async function detectHeaders(
  csv: string,
  delimiter: string
): Promise<Result<DetectedHeadersType, CsvParsingError>> {
  const records = await new Promise<string[][]>((resolve, reject) => {
    parse(
      csv,
      {
        delimiter,
        skipEmptyLines: true,
        to: 1,
      },
      (err, records) => {
        if (err) {
          reject(err);
        }
        resolve(records);
      }
    );
  });

  if (records.length === 0) {
    return new Err({ type: "empty_csv", message: "Empty CSV" });
  }

  const firstRecord = records[0];
  if (
    !Array.isArray(firstRecord) ||
    firstRecord.some((r) => typeof r !== "string")
  ) {
    throw new Error("Invalid record format");
  }

  if (firstRecord.length > MAX_TABLE_COLUMNS) {
    return new Err({ type: "too_many_columns", message: "Too many columns" });
  }

  return staticHeaderDetection(firstRecord);
}
