import type {
  CoreAPIRow,
  CoreAPITableSchema,
  WithAPIErrorReponse,
} from "@dust-tt/types";
import { CoreAPI, isSlugified } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

const UpsertTableRowsRequestBodySchema = t.type({
  rows: t.array(
    t.type({
      row_id: t.string,
      value: t.record(
        t.string,
        t.union([
          t.string,
          t.null,
          t.number,
          t.boolean,
          t.type({
            type: t.literal("datetime"),
            epoch: t.number,
          }),
        ])
      ),
    })
  ),
  truncate: t.union([t.boolean, t.undefined]),
});

type CellValueType = t.TypeOf<
  typeof UpsertTableRowsRequestBodySchema
>["rows"][number]["value"][string];

type UpsertTableRowsResponseBody = {
  table: {
    name: string;
    table_id: string;
    description: string;
    schema: CoreAPITableSchema | null;
  };
};

type ListTableRowsResponseBody = {
  rows: CoreAPIRow[];
  offset: number;
  limit: number;
  total: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<UpsertTableRowsResponseBody | ListTableRowsResponseBody>
  >
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }

  const { auth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const plan = auth.plan();
  if (!owner || !plan || !auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (
    !owner.flags.includes("structured_data") &&
    !owner.flags.includes("auto_pre_ingest_all_databases")
  ) {
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

  const tableId = req.query.tId;
  if (!tableId || typeof tableId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The table id is missing.",
      },
    });
  }
  const coreAPI = new CoreAPI(logger);
  switch (req.method) {
    case "GET":
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const offset = req.query.offset
        ? parseInt(req.query.offset as string)
        : 0;

      const listRes = await coreAPI.getTableRows({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        tableId,
        offset,
        limit,
      });

      if (listRes.isErr()) {
        logger.error(
          {
            dataSourceName: dataSource.name,
            workspaceId: owner.id,
            tableId: tableId,
            error: listRes.error,
          },
          "Failed to list database rows."
        );

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to list database rows.",
          },
        });
      }

      const { rows: rowsList, total } = listRes.value;
      return res.status(200).json({ rows: rowsList, offset, limit, total });

    case "POST":
      const bodyValidation = UpsertTableRowsRequestBodySchema.decode(req.body);
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
      const { truncate } = bodyValidation.right;
      let { rows: rowsToUpsert } = bodyValidation.right;

      // Make sure every key in the rows are lowercase
      const allKeys = new Set(
        rowsToUpsert.map((row) => Object.keys(row.value)).flat()
      );
      if (!Array.from(allKeys).every(isSlugified)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Invalid request body: keys must be lowercase alphanumeric.",
          },
        });
      }

      rowsToUpsert = rowsToUpsert.map((row) => {
        const value: Record<string, CellValueType> = {};
        for (const [key, val] of Object.entries(row.value)) {
          value[key.toLowerCase()] = val;
        }
        return { row_id: row.row_id, value };
      });
      const upsertRes = await coreAPI.upsertTableRows({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        tableId: tableId,
        rows: rowsToUpsert,
        truncate,
      });

      if (upsertRes.isErr()) {
        logger.error(
          {
            dataSourceName: dataSource.name,
            workspaceId: owner.id,
            tableId: tableId,
            error: upsertRes.error,
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

      // Upsert is succesful, retrieve the updated table.
      const tableRes = await coreAPI.getTable({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        tableId,
      });
      if (tableRes.isErr()) {
        logger.error(
          {
            dataSourcename: dataSource.name,
            workspaceId: owner.id,
            error: tableRes.error,
          },
          "Failed to retrieve updated table."
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to get table.",
          },
        });
      }

      const { table } = tableRes.value;

      return res.status(200).json({
        table: {
          name: table.name,
          table_id: table.table_id,
          description: table.description,
          schema: table.schema,
        },
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET, POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
