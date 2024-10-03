import type {
  CoreAPIRow,
  CoreAPITableSchema,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { CoreAPI, isSlugified } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

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

/**
 * @swagger
 * /api/v1/w/{wId}/vaults/{vId}/data_sources/{dsId}/tables/{tId}/rows:
 *  get:
 *    summary: List rows
 *    description: List rows in the table identified by {tId} in the data source identified by {dsId} in the workspace identified by {wId}.
 *    tags:
 *      - Datasources
 *    security:
 *      - BearerAuth: []
 *    parameters:
 *      - in: path
 *        name: wId
 *        required: true
 *        description: Unique string identifier for the workspace
 *        schema:
 *          type: string
 *      - in: path
 *        name: vId
 *        required: true
 *        description: ID of the vault
 *        schema:
 *          type: string
 *      - in: path
 *        name: dsId
 *        required: true
 *        description: ID of the data source
 *        schema:
 *          type: string
 *      - in: path
 *        name: tId
 *        required: true
 *        description: ID of the table
 *        schema:
 *          type: string
 *      - in: query
 *        name: limit
 *        description: Limit the number of rows returned
 *        schema:
 *          type: integer
 *      - in: query
 *        name: offset
 *        description: Offset the returned rows
 *        schema:
 *          type: integer
 *    responses:
 *      200:
 *        description: The rows
 *        content:
 *          application/json:
 *            schema:
 *              type: array
 *              items:
 *                $ref: '#/components/schemas/Datasource'
 *      405:
 *        description: Method not supported
 *  post:
 *    summary: Upsert rows
 *    description: Upsert rows in the table identified by {tId} in the data source identified by {dsId} in the workspace identified by {wId}.
 *    tags:
 *      - Datasources
 *    security:
 *      - BearerAuth: []
 *    parameters:
 *      - in: path
 *        name: wId
 *        required: true
 *        description: Unique string identifier for the workspace
 *        schema:
 *          type: string
 *      - in: path
 *        name: vId
 *        required: true
 *        description: ID of the vault
 *        schema:
 *          type: string
 *      - in: path
 *        name: dsId
 *        required: true
 *        description: ID of the data source
 *        schema:
 *          type: string
 *      - in: path
 *        name: tId
 *        required: true
 *        description: ID of the table
 *        schema:
 *          type: string
 *    requestBody:
 *      required: true
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            properties:
 *              rows:
 *                type: array
 *                items:
 *                  type: object
 *                  properties:
 *                    row_id:
 *                      type: string
 *                      description: Unique identifier for the row
 *                    value:
 *                      type: object
 *                      additionalProperties:
 *                        oneOf:
 *                          - type: string
 *                          - type: number
 *                          - type: boolean
 *                          - type: object
 *                            properties:
 *                              type:
 *                                type: string
 *                                enum:
 *                                  - datetime
 *                              epoch:
 *                                type: number
 *              truncate:
 *                type: boolean
 *                description: Whether to truncate existing rows
 *    responses:
 *      200:
 *        description: The table
 *        content:
 *          application/json:
 *            schema:
 *              $ref: '#/components/schemas/Datasource'
 *      400:
 *        description: Bad Request. Missing or invalid parameters.
 *      401:
 *        description: Unauthorized. Invalid or missing authentication token.
 *      500:
 *        description: Internal Server Error.
 *      404:
 *        description: Data source or workspace not found.
 *      405:
 *        description: Method not supported.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      UpsertTableRowsResponseBody | ListTableRowsResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  const { dsId, tId } = req.query;
  if (typeof dsId !== "string" || typeof tId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchByNameOrId(
    auth,
    dsId,
    // TODO(DATASOURCE_SID): Clean-up
    { origin: "v1_data_sources_tables_table_rows" }
  );

  // Handling the case where vId is undefined to keep support for the legacy endpoint (not under
  // vault, global vault assumed for the auth (the authenticator associated with the app, not the
  // user)).
  let { vId } = req.query;
  if (typeof vId !== "string") {
    if (auth.isSystemKey()) {
      // We also handle the legacy usage of connectors that taps into connected data sources which
      // are not in the global vault. If this is a system key we trust it and set the vId to the
      // dataSource.vault.sId.
      vId = dataSource?.vault.sId;
    } else {
      vId = (await VaultResource.fetchWorkspaceGlobalVault(auth)).sId;
    }
  }

  if (!dataSource || dataSource.vault.sId !== vId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  switch (req.method) {
    case "GET":
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const offset = req.query.offset
        ? parseInt(req.query.offset as string)
        : 0;

      const listRes = await coreAPI.getTableRows({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        tableId: tId,
        offset,
        limit,
      });

      if (listRes.isErr()) {
        logger.error(
          {
            dataSourceId: dataSource.sId,
            workspaceId: owner.id,
            tableId: tId,
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
        dataSourceId: dataSource.dustAPIDataSourceId,
        tableId: tId,
        rows: rowsToUpsert,
        truncate,
      });

      if (upsertRes.isErr()) {
        logger.error(
          {
            dataSourceId: dataSource.sId,
            workspaceId: owner.id,
            tableId: tId,
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
        dataSourceId: dataSource.dustAPIDataSourceId,
        tableId: tId,
      });
      if (tableRes.isErr()) {
        logger.error(
          {
            dataSourceId: dataSource.sId,
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

export default withPublicAPIAuthentication(handler);
