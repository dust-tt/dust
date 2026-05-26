import config from "@app/lib/api/config";
import { UNTITLED_TITLE } from "@app/lib/api/content_nodes";
import { resolveLegacyDataSourceSpaceId } from "@app/lib/api/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { cleanTimestamp } from "@app/lib/utils/timestamps";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type {
  ListTablesResponseType,
  UpsertTableResponseType,
} from "@dust-tt/client";
import {
  DUST_TABLE_MIME_TYPE,
  UpsertDatabaseTableRequestSchema,
} from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import tId from "./[tId]";
import csv from "./csv";

const ParamsSchema = z.object({
  dsId: z.string(),
});

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/data_sources/{dsId}/tables:
 *   get:
 *     summary: Get tables
 *     description: Get tables in the data source identified by {dsId} in the workspace identified by {wId}.
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
 *     responses:
 *       200:
 *         description: The tables
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Table'
 *       400:
 *         description: Invalid request
 *   post:
 *     summary: Upsert a table
 *     description: Upsert a table in the data source identified by {dsId} in the workspace identified by {wId}.
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the table
 *               title:
 *                 type: string
 *                 description: Title of the table
 *               table_id:
 *                 type: string
 *                 description: Unique identifier for the table
 *               description:
 *                 type: string
 *                 description: Description of the table
 *               timestamp:
 *                 type: number
 *                 description: Unix timestamp (in milliseconds) for the table (e.g. 1736365559000).
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Tags associated with the table
 *               mime_type:
 *                 type: string
 *                 description: 'Reserved for internal use, should not be set. Mime type of the table'
 *     responses:
 *       200:
 *         description: The table
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Table'
 *       400:
 *         description: Invalid request
 *       405:
 *         description: Method not supported
 */
const app = publicApiApp();

// `/csv` must be mounted before `/:tId` so the literal segment isn't
// swallowed as a table id.
app.route("/csv", csv);
app.route("/:tId", tId);

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<ListTablesResponseType> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const { dsId } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchByNameOrId(
      auth,
      dsId,
      // TODO(DATASOURCE_SID): Clean-up
      { origin: "v1_data_sources_tables" }
    );

    const spaceId = await resolveLegacyDataSourceSpaceId(
      auth,
      ctx.req.param("spaceId"),
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

    const tablesRes = await coreAPI.getTables({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
    });

    if (tablesRes.isErr()) {
      logger.error(
        {
          workspaceId: owner.id,
          dataSourceId: dataSource.sId,
          error: tablesRes.error,
        },
        "Failed to get tables."
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to retrieve tables.",
          data_source_error: tablesRes.error,
        },
      });
    }

    const { tables } = tablesRes.value;

    return ctx.json({
      tables: tables.map((table) => {
        return {
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
        };
      }),
    });
  }
);

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", UpsertDatabaseTableRequestSchema),
  async (ctx): HandlerResult<UpsertTableResponseType> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const { dsId } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchByNameOrId(
      auth,
      dsId,
      // TODO(DATASOURCE_SID): Clean-up
      { origin: "v1_data_sources_tables" }
    );

    const spaceId = await resolveLegacyDataSourceSpaceId(
      auth,
      ctx.req.param("spaceId"),
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

    const data = ctx.req.valid("json");

    const {
      name,
      description,
      table_id: maybeTableId,
      timestamp,
      tags,
      parents,
      parent_id: parentId,
      remote_database_table_id: remoteDatabaseTableId,
      remote_database_secret_id: remoteDatabaseSecretId,
      source_url: sourceUrl,
    } = data;

    let mimeType: string;
    if (auth.isSystemKey()) {
      // If the request is from a system key, the request must provide both title and mimeType.
      if (!data.mime_type) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body: mimeType must be provided.",
          },
        });
      }
      if (!data.title) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body: title must be provided.",
          },
        });
      }

      mimeType = data.mime_type;
    } else {
      // If the request is from a regular API key, the request must not provide mimeType.
      if (data.mime_type) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body: mimeType must not be provided.",
          },
        });
      }
      mimeType = DUST_TABLE_MIME_TYPE;
    }
    // If the title is provided, we use it.
    // Otherwise, we default to either:
    // - the title tag if any
    // - the name of the table
    const titleInTags = tags
      ?.find((t) => t.startsWith("title:"))
      ?.substring(6)
      ?.trim();
    const title =
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      data.title?.trim() || titleInTags || name.trim() || UNTITLED_TITLE;

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const tableId = maybeTableId || generateRandomModelSId();

    // Prohibit passing parents when not coming from connectors.
    if (!auth.isSystemKey() && parents) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Setting a custom hierarchy is not supported yet. Please omit the parents field.",
        },
      });
    }
    if (!auth.isSystemKey() && parentId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Setting a custom hierarchy is not supported yet. Please omit the parent_id field.",
        },
      });
    }

    // Enforce parents consistency: we expect users to either not pass them (recommended) or pass them correctly.
    if (parents) {
      if (parents.length === 0) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid parents: parents must have at least one element.`,
          },
        });
      }
      if (parents[0] !== tableId) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid parents: parents[0] should be equal to table_id.`,
          },
        });
      }
    }
    if (
      parents &&
      (parents.length >= 2 || parentId !== null) &&
      parents[1] !== parentId
    ) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid parent id: parents[1] and parent_id should be equal.`,
        },
      });
    }

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

    // Enforce that the table is a parent of itself by default.
    const upsertRes = await coreAPI.upsertTable({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      tableId,
      name,
      description,
      timestamp: cleanTimestamp(timestamp),
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      tags: tags || [],
      // Table is a parent of itself by default.
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      parents: parents || [tableId],
      parentId: parentId ?? null,
      remoteDatabaseTableId: remoteDatabaseTableId ?? null,
      remoteDatabaseSecretId: remoteDatabaseSecretId ?? null,
      title,
      mimeType,
      sourceUrl: sourceUrl ?? null,
      checkNameUniqueness: true,
    });

    if (upsertRes.isErr()) {
      logger.error(
        {
          dataSourceId: dataSource.sId,
          workspaceId: owner.id,
          databaseName: name,
          tableId,
          tableName: name,
          error: upsertRes.error,
        },
        "Failed to upsert table."
      );

      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to upsert table (table names must be unique).",
          data_source_error: upsertRes.error,
        },
      });
    }

    const { table } = upsertRes.value;

    return ctx.json({
      table: {
        name: table.name,
        table_id: table.table_id,
        description: table.description,
        schema: table.schema,
        timestamp: table.timestamp,
        tags: table.tags,
        parents: table.parents,
        mime_type: table.mime_type,
        title: table.title,
      },
    });
  }
);

export default app;
