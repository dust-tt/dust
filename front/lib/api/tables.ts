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
  getSmallWhitelistedModel,
  guessDelimiter,
  Ok,
} from "@dust-tt/types";
import { parse } from "csv-parse";
import * as t from "io-ts";
import { DateTime } from "luxon";

import { callAction } from "@app/lib/actions/helpers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, DustProdActionRegistry } from "@app/lib/registry";
import logger from "@app/logger/logger";

import type { DataSourceResource } from "../resources/data_source_resource";

const MAX_TABLE_COLUMNS = 512;

type CsvParsingError = {
  type:
    | "invalid_delimiter"
    | "invalid_header"
    | "duplicate_header"
    | "invalid_record_length"
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
  tableParents,
  csv,
  truncate,
  useAppForHeaderDetection,
}: {
  auth: Authenticator;
  dataSource: DataSourceResource;
  tableName: string;
  tableDescription: string;
  tableId: string;
  tableTimestamp: number | null;
  tableTags: string[];
  tableParents: string[];
  csv: string | null;
  truncate: boolean;
  useAppForHeaderDetection: boolean;
}): Promise<Result<{ table: CoreAPITable }, TableOperationError>> {
  const csvRowsRes = csv
    ? await rowsFromCsv({ auth, csv, useAppForHeaderDetection })
    : null;

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

    csvRows = csvRowsRes.value;
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
    parents: tableParents,
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
  useAppForHeaderDetection,
}: {
  auth: Authenticator;
  csv: string;
  useAppForHeaderDetection: boolean;
}): Promise<Result<CoreAPIRow[], CsvParsingError>> {
  const delimiter = await guessDelimiter(csv);
  if (!delimiter) {
    return new Err({
      type: "invalid_delimiter",
      message: `Could not detect delimiter.`,
    });
  }

  const headerRes = await detectHeaders(
    auth,
    csv,
    delimiter,
    useAppForHeaderDetection
  );

  if (useAppForHeaderDetection) {
    // TODO Remove this logs before rolling out to customers has it exposes sensitive data !
    // Enable static header detection for debugging
    const headerResStatic = await detectHeaders(auth, csv, delimiter, false);
    logger.info(
      { headerRes, headerResStatic, useAppForHeaderDetection },
      "Header detection result"
    );
  }

  if (headerRes.isErr()) {
    return headerRes;
  }
  const { header, rowIndex } = headerRes.value;

  let i = 0;
  const parser = parse(csv, { delimiter });
  const valuesByCol: Record<string, string[]> = {};
  for await (const anyRecord of parser) {
    if (i++ >= rowIndex) {
      const record = anyRecord as string[];
      for (const [i, h] of header.entries()) {
        const col = record[i] || "";
        if (!valuesByCol[h]) {
          valuesByCol[h] = [col];
        } else {
          (valuesByCol[h] as string[]).push(col);
        }
      }
    }
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

  return new Ok(rows);
}

async function staticHeaderDetection(
  firstRow: string[]
): Promise<Result<{ header: string[]; rowIndex: number }, CsvParsingError>> {
  const firstRecordCells = firstRow.map(
    (h, i) => h.trim().toLocaleLowerCase() || `col_${i}`
  );
  const header = getSanitizedHeaders(firstRecordCells);

  if (header.isErr()) {
    return new Err({ type: "invalid_header", message: header.error.message });
  }

  return new Ok({ header: header.value, rowIndex: 1 });
}

async function detectHeaders(
  auth: Authenticator,
  csv: string,
  delimiter: string,
  useAppForHeaderDetection: boolean
): Promise<Result<{ header: string[]; rowIndex: number }, CsvParsingError>> {
  const headParser = parse(csv, { delimiter });
  const records = [];
  for await (const anyRecord of headParser) {
    // Assert that record is string[].
    if (!Array.isArray(anyRecord)) {
      throw new Error("Record is not an array.");
    }

    if (anyRecord.some((r) => typeof r !== "string")) {
      throw new Error("Record contains non-string values.");
    }

    const record = anyRecord as string[];

    if (record.length > MAX_TABLE_COLUMNS) {
      return new Err({ type: "too_many_columns", message: "Too many columns" });
    }

    if (!useAppForHeaderDetection) {
      return staticHeaderDetection(record);
    }

    records.push(record);

    if (records.length === 10) {
      break;
    }
  }
  headParser.destroy();

  const action = DustProdActionRegistry["table-header-detection"];

  const model = getSmallWhitelistedModel(auth.getNonNullableWorkspace());
  if (!model) {
    throw new Error("Could not find a whitelisted model for the workspace.");
  }

  const config = cloneBaseConfig(action.config);
  config.MODEL.provider_id = model.providerId;
  config.MODEL.model_id = model.modelId;

  const res = await callAction(auth, {
    action,
    config,
    input: { tableData: records },
    responseValueSchema: t.type({
      headers: t.array(t.string),
      rowIndex: t.Integer,
    }),
  });

  if (res.isErr()) {
    logger.warn("Error when running app for detecting header", res.error);
    // Fallback to statuc header detection.
    return staticHeaderDetection(records[0]);
  }
  const rowIndex = res.value.rowIndex;
  const header = getSanitizedHeaders(res.value.headers);

  if (header.isErr()) {
    return new Err({ type: "invalid_header", message: header.error.message });
  }

  return new Ok({ header: header.value, rowIndex });
}
