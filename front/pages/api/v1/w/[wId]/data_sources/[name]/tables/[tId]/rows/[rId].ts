import type { CoreAPIRow, WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI, getFilterFromQuery } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

type GetTableRowsResponseBody = {
  row: CoreAPIRow;
};

/**
 * @swagger
 * /api/v1/w/{wId}/data_sources/{name}/tables/{tId}/rows/{rId}:
 *   get:
 *     summary: Get a row
 *     description: Get a row in the table identified by {tId} in the data source identified by {name} in the workspace identified by {wId}.
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
 *     description: Delete a row in the table identified by {tId} in the data source identified by {name} in the workspace identified by {wId}.
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
  >
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }

  const { workspaceAuth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  const owner = workspaceAuth.workspace();
  const plan = workspaceAuth.plan();
  if (!owner || !plan || !workspaceAuth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const dataSource = await getDataSource(
    workspaceAuth,
    req.query.name as string
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

  const tableId = req.query.tId;
  if (!tableId || typeof tableId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The table id is missing.",
      },
    });
  }

  const rowId = req.query.rId;
  if (!rowId || typeof rowId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The row id is missing.",
      },
    });
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  switch (req.method) {
    case "GET":
      const rowRes = await coreAPI.getTableRow({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        tableId,
        rowId,
        filter: getFilterFromQuery(req.query),
      });

      if (rowRes.isErr()) {
        logger.error(
          {
            dataSourceName: dataSource.name,
            workspaceId: owner.id,
            tableId: tableId,
            rowId: rowId,
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
        dataSourceName: dataSource.name,
        tableId,
        rowId,
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
            dataSourceName: dataSource.name,
            workspaceId: owner.id,
            tableId: tableId,
            rowId: rowId,
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

export default withLogging(handler);
