import config from "@app/lib/api/config";
import { resolveLegacyDataSourceSpaceId } from "@app/lib/api/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { GetTableRowsResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  dsId: z.string(),
  tId: z.string(),
  rId: z.string(),
  spaceId: z.string().optional(),
});

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/data_sources/{dsId}/tables/{tId}/rows/{rId}:
 *   get:
 *     summary: Get a row
 *     description: Get a row in the table identified by {tId} in the data source identified by {dsId} in the workspace identified by {wId}.
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
 *       - in: path
 *         name: rId
 *         required: true
 *         description: ID of the row
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The row
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Datasource'
 *       404:
 *         description: The row was not found
 *   delete:
 *     summary: Delete a row
 *     description: Delete a row in the table identified by {tId} in the data source identified by {dsId} in the workspace identified by {wId}.
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
 *       - in: path
 *         name: rId
 *         required: true
 *         description: ID of the row
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The row was deleted
 *       404:
 *         description: The row was not found
 *       429:
 *         description: Too many pending table updates are queued for this table. Retry later.
 */
const app = publicApiApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetTableRowsResponseType> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const { dsId, tId, rId, spaceId: spaceIdParam } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchByNameOrId(
      auth,
      dsId,
      // TODO(DATASOURCE_SID): Clean-up
      { origin: "v1_data_sources_tables_table_rows_row" }
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
    const rowRes = await coreAPI.getTableRow({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      tableId: tId,
      rowId: rId,
    });

    if (rowRes.isErr()) {
      logger.error(
        {
          dataSourceId: dataSource.sId,
          workspaceId: owner.id,
          tableId: tId,
          rowId: rId,
          error: rowRes.error,
        },
        "Failed to get row."
      );

      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to get row.",
        },
      });
    }

    const { row } = rowRes.value;
    return ctx.json({ row });
  }
);

app.delete(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<{ success: boolean }> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const { dsId, tId, rId, spaceId: spaceIdParam } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchByNameOrId(
      auth,
      dsId,
      // TODO(DATASOURCE_SID): Clean-up
      { origin: "v1_data_sources_tables_table_rows_row" }
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

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const deleteRes = await coreAPI.deleteTableRow({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      tableId: tId,
      rowId: rId,
      caller: "public-api",
    });

    if (deleteRes.isErr()) {
      if (deleteRes.error.code === "table_not_found") {
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "table_not_found",
            message: "The table you requested was not found.",
          },
        });
      }

      if (deleteRes.error.code === "too_many_pending_upserts") {
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
          rowId: rId,
          error: deleteRes.error,
        },
        "Failed to delete row."
      );

      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to delete row.",
        },
      });
    }

    return ctx.json({ success: true });
  }
);

export default app;
