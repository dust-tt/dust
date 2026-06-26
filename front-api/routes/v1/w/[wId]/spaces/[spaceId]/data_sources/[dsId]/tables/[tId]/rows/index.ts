import config from "@app/lib/api/config";
import { resolveLegacyDataSourceSpaceId } from "@app/lib/api/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { isSlugified } from "@app/types/shared/utils/string_utils";
import type {
  CellValueType,
  ListTableRowsResponseType,
  UpsertTableRowsResponseType,
} from "@dust-tt/client";
import { UpsertTableRowsRequestSchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import rId from "./[rId]";

const ParamsSchema = z.object({
  dsId: z.string(),
  tId: z.string(),
  spaceId: z.string().optional(),
});

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/data_sources/{dsId}/tables/{tId}/rows:
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
 *        name: spaceId
 *        required: true
 *        description: ID of the space
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
 *      400:
 *        description: Bad Request. Missing or invalid parameters.
 *      401:
 *        description: Unauthorized. Invalid or missing authentication token.
 *      404:
 *        description: Table, data source or workspace not found.
 *      500:
 *        description: Internal Server Error.
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
 *        name: spaceId
 *        required: true
 *        description: ID of the space
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
 *      429:
 *        description: Too many pending table updates are queued for this table. Retry later.
 *      500:
 *        description: Internal Server Error.
 *      404:
 *        description: Data source or workspace not found.
 */
const app = publicApiApp();

app.route("/:rId", rId);

const QuerySchema = z.object({
  limit: z.coerce.number().int().nonnegative().optional().default(10),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});

app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", QuerySchema),
  async (ctx): HandlerResult<ListTableRowsResponseType> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const { dsId, tId, spaceId: spaceIdParam } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchByNameOrId(
      auth,
      dsId,
      // TODO(DATASOURCE_SID): Clean-up
      { origin: "v1_data_sources_tables_table_rows" }
    );

    const spaceId = await resolveLegacyDataSourceSpaceId(
      auth,
      spaceIdParam,
      dataSource
    );

    if (
      !dataSource ||
      dataSource.space.sId !== spaceId ||
      !dataSource.canRead(auth)
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      });
    }

    if (dataSource.space.kind === "conversations") {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "The space you're trying to access was not found",
        },
      });
    }

    const { limit, offset } = ctx.req.valid("query");

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
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

      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to list database rows.",
        },
      });
    }

    const { rows: rowsList, total } = listRes.value;
    return ctx.json({ rows: rowsList, offset, limit, total });
  }
);

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", UpsertTableRowsRequestSchema),
  async (ctx): HandlerResult<UpsertTableRowsResponseType> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const { dsId, tId, spaceId: spaceIdParam } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchByNameOrId(
      auth,
      dsId,
      // TODO(DATASOURCE_SID): Clean-up
      { origin: "v1_data_sources_tables_table_rows" }
    );

    const spaceId = await resolveLegacyDataSourceSpaceId(
      auth,
      spaceIdParam,
      dataSource
    );

    if (
      !dataSource ||
      dataSource.space.sId !== spaceId ||
      !dataSource.canRead(auth)
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      });
    }

    if (dataSource.space.kind === "conversations") {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "The space you're trying to access was not found",
        },
      });
    }

    // To write we must have canWrite or be a systemAPIKey
    if (!(dataSource.canWrite(auth) || auth.isSystemKey())) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message: "You are not allowed to update data in this data source.",
        },
      });
    }

    const body = ctx.req.valid("json");
    const { truncate } = body;
    let { rows: rowsToUpsert } = body;

    // Make sure every key in the rows are lowercase
    const allKeys = new Set(
      rowsToUpsert.map((row) => Object.keys(row.value)).flat()
    );
    if (!Array.from(allKeys).every(isSlugified)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid request body: keys must be lowercase alphanumeric.",
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

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const upsertRes = await coreAPI.upsertTableRows({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      tableId: tId,
      rows: rowsToUpsert,
      truncate,
    });

    if (upsertRes.isErr()) {
      if (upsertRes.error.code === "too_many_pending_upserts") {
        return apiError(ctx, {
          status_code: 429,
          api_error: {
            type: "rate_limit_error",
            message:
              "Too many pending table updates are queued for this table. " +
              "Please retry later.",
          },
        });
      }

      logger.error(
        {
          dataSourceId: dataSource.sId,
          workspaceId: owner.id,
          tableId: tId,
          error: upsertRes.error,
        },
        "Failed to upsert database rows."
      );

      return apiError(ctx, {
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
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to get table.",
        },
      });
    }

    const { table } = tableRes.value;

    return ctx.json({
      table: {
        name: table.name,
        table_id: table.table_id,
        description: table.description,
        schema: table.schema,
      },
    });
  }
);

export default app;
