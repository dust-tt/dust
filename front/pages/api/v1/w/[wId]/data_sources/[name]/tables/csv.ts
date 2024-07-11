import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getAPIKey } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";
import { handlePostTableCsvUpsertRequest } from "@app/pages/api/w/[wId]/data_sources/[name]/tables/csv";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};

/**
 * @swagger
 * /api/v1/w/{wId}/data_sources/{name}/tables/csv:
 *   post:
 *     summary: Upsert CSV to table
 *     description: Upsert CSV data to a table in the data source identified by {name} in the workspace identified by {wId}.
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
 *       - in: query
 *         name: table_id
 *         description: ID of the table
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: CSV file to be uploaded
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
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
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
  const isSystemKey = keyRes.value.isSystem;
  if (!owner || !plan || !auth.isBuilder() || !isSystemKey) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      return handlePostTableCsvUpsertRequest(auth, req, res);

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
