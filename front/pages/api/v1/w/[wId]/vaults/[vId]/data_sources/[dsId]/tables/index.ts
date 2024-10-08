import type { CoreAPITablePublic, WithAPIErrorResponse } from "@dust-tt/types";
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
import { VaultResource } from "@app/lib/resources/vault_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type ListTablesResponseBody = {
  tables: CoreAPITablePublic[];
};

const UpsertDatabaseTableRequestBodySchema = t.intersection([
  t.type({
    table_id: t.union([t.string, t.undefined]),
    name: t.string,
    description: t.string,
    timestamp: t.union([t.number, t.undefined, t.null]),
    tags: t.union([t.array(t.string), t.undefined, t.null]),
    parents: t.union([t.array(t.string), t.undefined, t.null]),
  }),
  t.partial({
    remote_database_table_id: t.union([t.string, t.null]),
    remote_database_secret_id: t.union([t.string, t.null]),
  }),
]);

type UpsertTableResponseBody = {
  table: CoreAPITablePublic;
};

/**
 * @swagger
 * /api/v1/w/{wId}/vaults/{vId}/data_sources/{dsId}/tables:
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
 *         name: vId
 *         required: true
 *         description: ID of the vault
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
 *                 $ref: '#/components/schemas/Datasource'
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
 *         name: vId
 *         required: true
 *         description: ID of the vault
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
 *               table_id:
 *                 type: string
 *                 description: Unique identifier for the table
 *               description:
 *                 type: string
 *                 description: Description of the table
 *               timestamp:
 *                 type: number
 *                 description: Timestamp of the table
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Tags associated with the table
 *               parents:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Parent tables of this table
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
        remote_database_table_id: remoteDatabaseTableId,
        remote_database_secret_id: remoteDatabaseSecretId,
      } = bodyValidation.right;

      const tableId = maybeTableId || generateLegacyModelSId();

      const tRes = await coreAPI.getTables({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
      });

      if (tRes.isErr()) {
        logger.error(
          {
            dataSourceId: dataSource.sId,
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
        remoteDatabaseTableId: remoteDatabaseTableId ?? null,
        remoteDatabaseSecretId: remoteDatabaseSecretId ?? null,
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
