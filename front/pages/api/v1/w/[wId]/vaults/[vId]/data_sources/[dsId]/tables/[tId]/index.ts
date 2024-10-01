import type { CoreAPITablePublic, WithAPIErrorResponse } from "@dust-tt/types";
import { assertNever, CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { deleteTable } from "@app/lib/api/tables";
import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetTableResponseBody = {
  table: CoreAPITablePublic;
};

/**
 * @swagger
 * /api/v1/w/{wId}/vaults/{vId}/data_sources/{dsId}/tables/{tId}:
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
 *               $ref: '#/components/schemas/Datasource'
 *       404:
 *         description: The table was not found
 *       405:
 *         description: Method not supported
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
 *       405:
 *         description: Method not supported
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetTableResponseBody>>,
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

  switch (req.method) {
    case "GET":
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const tableRes = await coreAPI.getTable({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        tableId: tId,
      });
      if (tableRes.isErr()) {
        if (tableRes.error.code === "table_not_found") {
          return apiError(req, res, {
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
          timestamp: table.timestamp,
          tags: table.tags,
          parents: table.parents,
        },
      });

    case "DELETE":
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "The data source you requested was not found.",
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
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: delRes.error.notFoundError.type,
                message: delRes.error.notFoundError.message,
              },
            });
          case "invalid_request_error":
          case "internal_server_error":
            return apiError(req, res, {
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

      res.status(200).end();
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or DELETE is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);
