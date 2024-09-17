import type { CoreAPITableSchema, WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { generateLegacyModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type ListTablesResponseBody = {
  tables: {
    name: string;
    table_id: string;
    description: string;
    schema: CoreAPITableSchema | null;
  }[];
};

const UpsertDatabaseTableRequestBodySchema = t.type({
  table_id: t.union([t.string, t.undefined]),
  name: t.string,
  description: t.string,
  timestamp: t.union([t.number, t.undefined, t.null]),
  tags: t.union([t.array(t.string), t.undefined, t.null]),
  parents: t.union([t.array(t.string), t.undefined, t.null]),
});

type UpsertTableResponseBody = {
  table: {
    name: string;
    table_id: string;
    description: string;
    schema: CoreAPITableSchema | null;
  };
};

/**
 * @swagger
 * /api/v1/w/{wId}/data_sources/{name}/tables:
 *   get:
 *     summary: Get tables
 *     description: Get tables in the data source identified by {name} in the workspace identified by {wId}.
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
 *         name: name
 *         required: true
 *         description: Name of the data source
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
 *                 $ref: '#/components/schemas/Datasource'
 *   post:
 *     summary: Upsert a table
 *     description: Upsert a table in the data source identified by {name} in the workspace identified by {wId}.
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
 *         name: name
 *         required: true
 *         description: Name of the data source
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
 *               table_id:
 *                 type: string
 *                 description: Unique identifier for the table
 *               description:
 *                 type: string
 *                 description: Description of the table
 *     responses:
 *       200:
 *         description: The table
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Datasource'
 *       400:
 *         description: Invalid request
 *       405:
 *         description: Method not supported
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<ListTablesResponseBody | UpsertTableResponseBody>
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
  if (!dataSource) {
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
      const tablesRes = await coreAPI.getTables({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
      });

      if (tablesRes.isErr()) {
        logger.error(
          {
            dataSourcename: dataSource.name,
            workspaceId: owner.id,
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
          };
        }),
      });

    case "POST":
      const bodyValidation = UpsertDatabaseTableRequestBodySchema.decode(
        req.body
      );
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
      const {
        name,
        description,
        table_id: maybeTableId,
        timestamp,
        tags,
        parents,
      } = bodyValidation.right;

      const tableId = maybeTableId || generateLegacyModelSId();

      const tRes = await coreAPI.getTables({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
      });

      if (tRes.isErr()) {
        logger.error(
          {
            dataSourcename: dataSource.name,
            workspaceId: owner.id,
            error: tRes.error,
          },
          "Failed to retrieve tables."
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to retrieve tables.",
            data_source_error: tRes.error,
          },
        });
      }

      const tableWithSameName = tRes.value.tables.find((t) => t.name === name);
      if (tableWithSameName && tableWithSameName.table_id !== tableId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Tables names must be unique within a data source.",
          },
        });
      }

      const upsertRes = await coreAPI.upsertTable({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        tableId,
        name,
        description,
        timestamp: timestamp ?? null,
        tags: tags || [],
        parents: parents || [],
      });

      if (upsertRes.isErr()) {
        logger.error(
          {
            dataSourceName: dataSource.name,
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
