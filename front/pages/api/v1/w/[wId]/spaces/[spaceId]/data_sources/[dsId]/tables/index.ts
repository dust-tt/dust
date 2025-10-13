import type {
  ListTablesResponseType,
  UpsertTableResponseType,
} from "@dust-tt/client";
import { UpsertDatabaseTableRequestSchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { UNTITLED_TITLE } from "@app/lib/api/content_nodes";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { cleanTimestamp } from "@app/lib/utils/timestamps";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { CoreAPI } from "@app/types";

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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<ListTablesResponseType | UpsertTableResponseType>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  const { dsId } = req.query;
  if (typeof dsId !== "string") {
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
    { origin: "v1_data_sources_tables" }
  );

  // Handling the case where `spaceId` is undefined to keep support for the legacy endpoint (not under
  // space, global space assumed for the auth (the authenticator associated with the app, not the
  // user)).
  let { spaceId } = req.query;
  if (typeof spaceId !== "string") {
    if (auth.isSystemKey()) {
      // We also handle the legacy usage of connectors that taps into connected data sources which
      // are not in the global space. If this is a system key we trust it and set the `spaceId` to the
      // dataSource.space.sId.
      spaceId = dataSource?.space.sId;
    } else {
      spaceId = (await SpaceResource.fetchWorkspaceGlobalSpace(auth)).sId;
    }
  }

  if (
    !dataSource ||
    dataSource.space.sId !== spaceId ||
    !dataSource.canRead(auth)
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (dataSource.space.kind === "conversations") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you're trying to access was not found",
      },
    });
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  switch (req.method) {
    case "GET":
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
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to retrieve tables.",
            data_source_error: tablesRes.error,
          },
        });
      }

      const { tables } = tablesRes.value;

      return res.status(200).json({
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

    case "POST":
      // To write we must have canWrite or be a systemAPIKey
      if (!(dataSource.canWrite(auth) || auth.isSystemKey())) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You are not allowed to update data in this data source.",
          },
        });
      }

      const r = UpsertDatabaseTableRequestSchema.safeParse(req.body);

      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
        });
      }

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
      } = r.data;

      let mimeType: string;
      if (auth.isSystemKey()) {
        // If the request is from a system key, the request must provide both title and mimeType.
        if (!r.data.mime_type) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Invalid request body: mimeType must be provided.",
            },
          });
        }
        if (!r.data.title) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Invalid request body: title must be provided.",
            },
          });
        }

        mimeType = r.data.mime_type;
      } else {
        // If the request is from a regular API key, the request must not provide mimeType.
        if (r.data.mime_type) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Invalid request body: mimeType must not be provided.",
            },
          });
        }
        mimeType = "application/vnd.dust.table";
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
        r.data.title?.trim() || titleInTags || name.trim() || UNTITLED_TITLE;

      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const tableId = maybeTableId || generateRandomModelSId();

      // Prohibit passing parents when not coming from connectors.
      if (!auth.isSystemKey() && parents) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Setting a custom hierarchy is not supported yet. Please omit the parents field.",
          },
        });
      }
      if (!auth.isSystemKey() && parentId) {
        return apiError(req, res, {
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
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid parents: parents must have at least one element.`,
            },
          });
        }
        if (parents[0] !== tableId) {
          return apiError(req, res, {
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
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid parent id: parents[1] and parent_id should be equal.`,
          },
        });
      }

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

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to upsert table (table names must be unique).",
            data_source_error: upsertRes.error,
          },
        });
      }

      const { table } = upsertRes.value;

      return res.status(200).json({
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
