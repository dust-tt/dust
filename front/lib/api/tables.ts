import type {
  CoreAPIError,
  CoreAPIRow,
  CoreAPIRowValue,
  CoreAPITable,
  DataSourceType,
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
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { cloneBaseConfig, DustProdActionRegistry } from "@app/lib/registry";
import logger from "@app/logger/logger";

type CsvParsingError = {
  type:
    | "invalid_delimiter"
    | "invalid_header"
    | "duplicate_header"
    | "invalid_record_length"
    | "empty_csv"
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
  dataSource: DataSourceType;
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
  await AgentTablesQueryConfigurationTable.destroy({
    where: {
      dataSourceWorkspaceId: owner.sId,
      // TODO(DATASOURCE_SID); state storing the datasource name
      dataSourceId: dataSource.name,
      tableId,
    },
  });

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
}: {
  auth: Authenticator;
  dataSource: DataSourceType;
  tableName: string;
  tableDescription: string;
  tableId: string;
  tableTimestamp: number | null;
  tableTags: string[];
  tableParents: string[];
  csv: string | null;
  truncate: boolean;
}): Promise<Result<{ table: CoreAPITable }, TableOperationError>> {
  const csvRowsRes = csv ? await rowsFromCsv(auth, csv) : null;

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
    const rowsRes = await coreAPI.upsertTableRows({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      tableId,
      rows: csvRows,
      truncate,
    });

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

export async function rowsFromCsv(
  auth: Authenticator,
  csv: string
): Promise<Result<CoreAPIRow[], CsvParsingError>> {
  const delimiter = await guessDelimiter(csv);
  if (!delimiter) {
    return new Err({
      type: "invalid_delimiter",
      message: `Could not detect delimiter.`,
    });
  }

  const headParser = parse(csv, { delimiter });
  let header: string[] | undefined = undefined;
  const records = [];
  for await (const anyRecord of headParser) {
    // Assert that record is string[].
    if (!Array.isArray(anyRecord)) {
      throw new Error("Record is not an array");
    }
    if (anyRecord.some((r) => typeof r !== "string")) {
      throw new Error("Record contains non-string values");
    }

    const record = anyRecord as string[];
    records.push(record);

    if (records.length === 10) {
      break;
    }
  }
  headParser.destroy();

  const action = DustProdActionRegistry["table-header-parser"];

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

  logger.info({ res }, "Header detection result");

  if (res.isErr()) {
    return new Err({
      type: "invalid_record_length",
      message: `Cannot detect headers.`,
    });
  }

  header = getSanitizedHeaders(res.value.headers);
  const rowIndex = res.value.rowIndex;

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
