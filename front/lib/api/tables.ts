import type {
  CoreAPIError,
  CoreAPIRow,
  CoreAPIRowValue,
  CoreAPITable,
  Result,
  WorkspaceType,
} from "@dust-tt/types";
import { CoreAPI, Err, isSlugified, Ok } from "@dust-tt/types";
import { parse } from "csv-parse";
import { DateTime } from "luxon";

import { guessDelimiter } from "@app/lib/api/csv";
import type { Authenticator } from "@app/lib/auth";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
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
  projectId,
  dataSourceName,
  tableId,
}: {
  owner: WorkspaceType;
  projectId: string;
  dataSourceName: string;
  tableId: string;
}): Promise<Result<null, TableOperationError>> {
  const coreAPI = new CoreAPI(logger);

  const deleteRes = await coreAPI.deleteTable({
    projectId,
    dataSourceName,
    tableId,
  });
  if (deleteRes.isErr()) {
    logger.error(
      {
        dataSourceName,
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
      dataSourceId: dataSourceName,
      tableId,
    },
  });

  return new Ok(null);
}

export async function upsertTableFromCsv({
  auth,
  projectId,
  dataSourceName,
  tableName,
  tableDescription,
  tableId,
  csv,
  truncate,
}: {
  auth: Authenticator;
  projectId: string;
  dataSourceName: string;
  tableName: string;
  tableDescription: string;
  tableId: string;
  csv: string | null;
  truncate: boolean;
}): Promise<Result<{ table: CoreAPITable }, TableOperationError>> {
  const csvRowsRes = csv ? await rowsFromCsv(csv) : null;

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
          dataSourceName,
          tableName,
          tableId,
          projectId,
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
        dataSourceName,
        tableName,
        tableId,
        projectId,
      },
      "CSV input validation error: too many rows."
    );
    return new Err(errorDetails);
  }

  const coreAPI = new CoreAPI(logger);
  const tableRes = await coreAPI.upsertTable({
    projectId,
    dataSourceName,
    description: tableDescription,
    name: tableName,
    tableId,
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
        dataSourceName,
        workspaceId: owner.id,
        tableId,
        tableName,
        projectId,
      },
      "Error upserting table in CoreAPI."
    );
    return new Err(errorDetails);
  }

  if (csvRows) {
    const rowsRes = await coreAPI.upsertTableRows({
      projectId,
      dataSourceName,
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
          dataSourceName,
          workspaceId: owner.id,
          tableId,
          tableName,
          projectId,
        },
        "Error upserting rows in CoreAPI."
      );

      const delRes = await coreAPI.deleteTable({
        projectId,
        dataSourceName,
        tableId,
      });

      if (delRes.isErr()) {
        logger.error(
          {
            type: "internal_server_error",
            coreAPIError: delRes.error,
            dataSourceName,
            workspaceId: owner.id,
            tableId,
            tableName,
            projectId,
          },
          "Failed to delete table after failed row upsert."
        );
      }
      return new Err(errorDetails);
    }
  }

  return tableRes;
}

async function rowsFromCsv(
  csv: string
): Promise<Result<CoreAPIRow[], CsvParsingError>> {
  const delimiter = await guessDelimiter(csv);
  if (!delimiter) {
    return new Err({
      type: "invalid_delimiter",
      message: `Could not detect delimiter.`,
    });
  }

  const parser = parse(csv, { delimiter });
  let header: string[] | undefined = undefined;
  const valuesByCol: Record<string, string[]> = {};

  for await (const anyRecord of parser) {
    // Assert that record is string[].
    if (!Array.isArray(anyRecord)) {
      throw new Error("Record is not an array");
    }
    if (anyRecord.some((r) => typeof r !== "string")) {
      throw new Error("Record contains non-string values");
    }

    const record = anyRecord as string[];

    if (!header) {
      header = [];
      const firstRecordCells = record.map((h) => h.trim().toLocaleLowerCase());
      const firstEmptyCellIndex = firstRecordCells.indexOf("");
      if (firstEmptyCellIndex !== -1) {
        // Ensure there are no non-empty cells after the first empty cell.
        if (firstRecordCells.slice(firstEmptyCellIndex).some((c) => c !== "")) {
          return new Err({
            type: "invalid_header",
            message: `Invalid header: found non-empty cell after empty cell.`,
          });
        }
      }
      header = firstRecordCells.slice(
        0,
        firstEmptyCellIndex === -1 ? undefined : firstEmptyCellIndex
      );
      const headerSet = new Set<string>();
      for (const h of header) {
        if (!isSlugified(h)) {
          return new Err({
            type: "invalid_header",
            message: `Header '${h}' is not a valid slug. A header should only contain lowercase letters, numbers, or underscores.`,
          });
        }

        if (headerSet.has(h)) {
          return new Err({
            type: "duplicate_header",
            message: `Duplicate header: ${h}.`,
          });
        }
        headerSet.add(h);
      }
      continue;
    }

    for (const [i, h] of header.entries()) {
      const col = record[i];
      if (col === undefined) {
        return new Err({
          type: "invalid_record_length",
          message: `Invalid record length at row ${i} (expected ${header.length} columns, got ${record.length})).`,
        });
      }
      if (!valuesByCol[h]) {
        valuesByCol[h] = [col];
      } else {
        (valuesByCol[h] as string[]).push(col);
      }
    }
  }

  if (!header || !Object.values(valuesByCol).some((vs) => vs.length > 0)) {
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
            // Google Spreadsheet date format parsers.
            (text: string) => DateTime.fromFormat(text, "d-MMM-yyyy"),
            // Default Google Spreadsheet format - US date format.
            (text: string) => DateTime.fromFormat(text, "M/d/yyyy"),
            // Default Google Spreadsheet format - EU date format.
            (text: string) => DateTime.fromFormat(text, "d/M/yyyy"),
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
