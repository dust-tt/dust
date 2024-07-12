import type { DataSourceType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetDataSourcesResponseBody = {
  data_sources: Array<DataSourceType>;
};

/**
 * @swagger
 * /api/v1/w/{wId}/data_sources:
 *   get:
 *     summary: Get data sources
 *     description: Get data sources in the workspace identified by {wId}.
 *     tags:
 *       - Datasources
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: The data sources
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data_sources:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Datasource'
 *       404:
 *         description: The workspace was not found
 *       405:
 *         description: Method not supported
 */


async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetDataSourcesResponseBody>>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }
  const { auth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you requested was not found.",
      },
    });
  }

  const dataSources = await getDataSources(auth);

  switch (req.method) {
    case "GET":
      res.status(200).json({
        data_sources: dataSources,
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withLogging(handler);
