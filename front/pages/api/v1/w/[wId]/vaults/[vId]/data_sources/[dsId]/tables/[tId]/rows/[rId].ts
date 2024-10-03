import type { CoreAPIRow, WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

type GetTableRowsResponseBody = {
  row: CoreAPIRow;
};

/**
 * @swagger
 * /api/v1/w/{wId}/vaults/{vId}/data_sources/{dsId}/tables/{tId}/rows/{rId}:
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
 *       405:
 *         description: Method not supported
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
 *       405:
 *         description: Method not supported
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetTableRowsResponseBody | { success: boolean }>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  const { dsId, tId, rId } = req.query;
  if (
    typeof dsId !== "string" ||
    typeof tId !== "string" ||
    typeof rId !== "string"
  ) {
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
    { origin: "v1_data_sources_tables_table_rows_row" }
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

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to get row.",
          },
        });
      }

      const { row } = rowRes.value;
      return res.status(200).json({ row });

    case "DELETE":
      const deleteRes = await coreAPI.deleteTableRow({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        tableId: tId,
        rowId: rId,
      });

      if (deleteRes.isErr()) {
        if (deleteRes.error.code === "table_not_found") {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "table_not_found",
              message: "The table you requested was not found.",
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

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to delete row.",
          },
        });
      }

      return res.status(200).json({ success: true });

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
