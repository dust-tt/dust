import config from "@app/lib/api/config";
import { resolveLegacyDataSourceSpaceId } from "@app/lib/api/data_sources";
import { deleteTable } from "@app/lib/api/tables";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { GetTableResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsBuilder } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import parents from "./parents";
import rows from "./rows";

const ParamsSchema = z.object({
  dsId: z.string(),
  tId: z.string(),
  spaceId: z.string().optional(),
});

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/data_sources/{dsId}/tables/{tId}:
 *   get:
 *     summary: Get a table
 *     description: Get a table in the data source identified by {dsId} in the workspace identified by {wId}.
 *     tags:
 *       - Datasources
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: spaceId
 *         required: true
 *         description: ID of the space
 *         schema:
 *           type: string
 *       - in: path
 *         name: dsId
 *         required: true
 *         description: ID of the data source
 *         schema:
 *           type: string
 *       - in: path
 *         name: tId
 *         required: true
 *         description: ID of the table
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The table
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Table'
 *       404:
 *         description: The table was not found
 *   delete:
 *     summary: Delete a table
 *     description: Delete a table in the data source identified by {dsId} in the workspace identified by {wId}.
 *     tags:
 *       - Datasources
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: spaceId
 *         required: true
 *         description: ID of the space
 *         schema:
 *           type: string
 *       - in: path
 *         name: dsId
 *         required: true
 *         description: ID of the data source
 *         schema:
 *           type: string
 *       - in: path
 *         name: tId
 *         required: true
 *         description: ID of the table
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The table was deleted
 *       404:
 *         description: The table was not found
 */
const app = publicApiApp();

app.route("/parents", parents);
app.route("/rows", rows);

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetTableResponseType> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const { dsId, tId, spaceId: spaceIdParam } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchByNameOrId(
      auth,
      dsId,
      // TODO(DATASOURCE_SID): Clean-up
      { origin: "v1_data_sources_tables" }
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

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const tableRes = await coreAPI.getTable({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      tableId: tId,
    });
    if (tableRes.isErr()) {
      if (tableRes.error.code === "table_not_found") {
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "table_not_found",
            message: "Failed to get table.",
          },
        });
      }
      logger.error(
        {
          dataSourceId: dataSource.sId,
          workspaceId: owner.id,
          error: tableRes.error,
        },
        "Failed to get table."
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
        timestamp: table.timestamp,
        tags: table.tags,
        parents: table.parents,
        parent_id: table.parent_id,
        mime_type: table.mime_type,
        title: table.title,
      },
    });
  }
);

app.delete(
  "/",
  ensureIsBuilder(),
  validate("param", ParamsSchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const { dsId, tId, spaceId: spaceIdParam } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchByNameOrId(
      auth,
      dsId,
      // TODO(DATASOURCE_SID): Clean-up
      { origin: "v1_data_sources_tables" }
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

    const delRes = await deleteTable({
      owner,
      dataSource,
      tableId: tId,
    });

    if (delRes.isErr()) {
      switch (delRes.error.type) {
        case "not_found_error":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: delRes.error.notFoundError.type,
              message: delRes.error.notFoundError.message,
            },
          });
        case "invalid_request_error":
        case "internal_server_error":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Failed to delete table.",
            },
          });
        default:
          assertNever(delRes.error);
      }
    }

    return ctx.body(null, 200);
  }
);

export default app;
