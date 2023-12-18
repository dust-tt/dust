import { CoreAPI, CoreAPIDatabaseRow } from "@dust-tt/types";
import { Err, Ok, Result } from "@dust-tt/types";
import { APIError } from "@dust-tt/types";
import { parse } from "csv-parse";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { generateModelSId } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

const CreateDatabaseFromCsvSchema = t.type({
  name: t.string,
  description: t.string,
  csv: t.string,
});

type RowValue =
  | number
  | boolean
  | string
  | { type: "datetime"; epoch: number }
  | null;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const plan = auth.plan();
  if (!owner || !plan || !auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you requested was not found.",
      },
    });
  }

  if (!isDevelopmentOrDustWorkspace(owner)) {
    res.status(404).end();
    return;
  }

  const dataSource = await getDataSource(auth, req.query.name as string);
  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }
  const coreAPI = new CoreAPI(logger);
  switch (req.method) {
    case "POST":
      const bodyValidation = CreateDatabaseFromCsvSchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
          status_code: 400,
        });
      }

      const { name, description, csv } = bodyValidation.right;
      const csvRowsRes = await rowsFromCsv(csv);
      if (csvRowsRes.isErr()) {
        return apiError(req, res, {
          api_error: csvRowsRes.error,
          status_code: 400,
        });
      }

      const csvRows = csvRowsRes.value;
      if (csvRows.length > 2000) {
        return apiError(req, res, {
          api_error: {
            type: "invalid_request_error",
            message: `CSV has too many rows: ${csvRows.length} (max 2000).`,
          },
          status_code: 400,
        });
      }

      const id = generateModelSId();

      const dbRes = await coreAPI.createDatabase({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        databaseId: id,
        name,
      });
      if (dbRes.isErr()) {
        logger.error(
          {
            dataSourceName: dataSource.name,
            workspaceId: owner.id,
            databaseName: name,
            databaseId: id,
            error: dbRes.error,
          },
          "Failed to create database."
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to create database.",
          },
        });
      }

      const { database } = dbRes.value;

      const tableId = generateModelSId();
      const tableRes = await coreAPI.upsertDatabaseTable({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        databaseId: id,
        description,
        name: name,
        tableId,
      });

      if (tableRes.isErr()) {
        logger.error(
          {
            dataSourceName: dataSource.name,
            workspaceId: owner.id,
            databaseName: name,
            databaseId: id,
            tableId,
            tableName: name,
            error: tableRes.error,
          },
          "Failed to upsert database table."
        );

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to upsert database table.",
          },
        });
      }

      const rowsRes = await coreAPI.upsertDatabaseRows({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        databaseId: id,
        tableId,
        rows: csvRows,
      });

      if (rowsRes.isErr()) {
        logger.error(
          {
            dataSourceName: dataSource.name,
            workspaceId: owner.id,
            databaseName: name,
            databaseId: id,
            tableId,
            tableName: name,
            error: rowsRes.error,
          },
          "Failed to upsert database rows."
        );

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to upsert database rows.",
          },
        });
      }

      return res.status(200).json({ database });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withLogging(handler);

async function rowsFromCsv(
  csv: string
): Promise<Result<CoreAPIDatabaseRow[], APIError>> {
  // Detect the delimiter: try to parse the first 2 lines with different delimiters,
  // keep the one that works for both lines and has the most columns.
  let delimiter: string | undefined = undefined;
  let delimiterColsCount = 0;
  for (const d of [",", ";", "\t"]) {
    const records: unknown[][] = [];
    try {
      const parser = parse(csv, { delimiter: d });
      for await (const record of parser) {
        records.push(record);
        if (records.length == 2) {
          break;
        }
      }
    } catch (e) {
      // Ignore error.
      continue;
    }

    const [firstRecord, secondRecord] = records;
    if (!!firstRecord.length && firstRecord.length === secondRecord.length) {
      if (firstRecord.length > delimiterColsCount) {
        delimiterColsCount = firstRecord.length;
        delimiter = d;
      }
    }
  }

  if (!delimiter) {
    return new Err({
      type: "invalid_request_error",
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
      header = record;
      continue;
    }

    for (const [i, h] of header.entries()) {
      const col = record[i];
      if (col === undefined) {
        return new Err({
          type: "invalid_request_error",
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
      type: "invalid_request_error",
      message: `CSV is empty.`,
    });
  }

  // Parse values and infer types for each column.
  const parsedValuesByCol: Record<string, RowValue[]> = {};
  for (const [col, values] of Object.entries(valuesByCol)) {
    if (values.every((v) => v === "")) {
      // All values are empty, we skip this column.
      continue;
    }

    // We keep the parsed values from the first parser that succeeds for all non-null values in the column.
    parsedValuesByCol[col] = (() => {
      for (const parser of [
        // number
        (v: string) => (isNaN(parseFloat(v)) ? undefined : parseFloat(v)),
        // date/datetime
        (v: string) => {
          const date = new Date(v);
          const epoch = date.getTime();
          return isNaN(epoch)
            ? undefined
            : {
                type: "datetime" as const,
                epoch,
              };
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
  const rows: CoreAPIDatabaseRow[] = [];
  for (let i = 0; i < nbRows; i++) {
    const record = header.reduce((acc, h) => {
      const parsedValues = parsedValuesByCol[h];
      acc[h] = parsedValues && parsedValues[i] ? parsedValues[i] : "";
      return acc;
    }, {} as Record<string, RowValue>);

    rows.push({ row_id: i.toString(), value: record });
  }

  return new Ok(rows);
}
