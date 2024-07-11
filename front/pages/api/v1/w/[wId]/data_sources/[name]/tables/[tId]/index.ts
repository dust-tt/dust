import type { CoreAPITableSchema, WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import { handleDeleteTableByIdRequest } from "@app/pages/api/w/[wId]/data_sources/[name]/tables/[tId]";

export type GetTableResponseBody = {
  table: {
    name: string;
    table_id: string;
    description: string;
    schema: CoreAPITableSchema | null;
  };
};

/**
 * @swagger
 * /api/v1/w/{wId}/data_sources/{name}/tables/{tId}:
 *   get:
 *     summary: Get a table
 *     description: Get a table in the data source identified by {name} in the workspace identified by {wId}.
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
 *     description: Delete a table in the data source identified by {name} in the workspace identified by {wId}.
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
  res: NextApiResponse<WithAPIErrorResponse<GetTableResponseBody>>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }

  const { auth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const plan = auth.plan();
  if (!owner || !plan || !auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const dataSource = await getDataSource(auth, req.query.name as string);
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

  switch (req.method) {
    case "GET":
      const coreAPI = new CoreAPI(logger);
      const tableRes = await coreAPI.getTable({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        tableId,
      });
      if (tableRes.isErr()) {
        logger.error(
          {
            dataSourcename: dataSource.name,
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
        },
      });

    case "DELETE":
      return handleDeleteTableByIdRequest(req, res, {
        owner,
        dataSource,
        tableId,
      });

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
