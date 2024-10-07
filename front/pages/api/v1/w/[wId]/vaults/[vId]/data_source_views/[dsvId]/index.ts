import type {
  DataSourceViewType,
  Result,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { PatchDataSourceViewSchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";

export type GetOrPostDataSourceViewsResponseBody = {
  dataSourceView: DataSourceViewType;
};

export type PatchDataSourceViewResponseBody = {
  dataSourceView: DataSourceViewType;
};

/**
 * @swagger
 * /api/v1/w/{wId}/vaults/{vId}/data_source_views/{dsvId}:
 *   get:
 *     summary: Get a data source view
 *     parameters:
 *       - name: wId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: vId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: dsvId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dataSourceView:
 *                   $ref: '#/components/schemas/DataSourceViewType'
 *       '404':
 *         description: Data source view not found
 *       '405':
 *         description: Method not allowed
 *   patch:
 *     summary: Update a data source view
 *     parameters:
 *       - name: wId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: vId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: dsvId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PatchDataSourceViewSchema'
 *     responses:
 *       '200':
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dataSourceView:
 *                   $ref: '#/components/schemas/DataSourceViewType'
 *       '400':
 *         description: Invalid request body
 *       '403':
 *         description: Unauthorized
 *       '404':
 *         description: Data source view not found
 *       '405':
 *         description: Method not allowed
 *       '500':
 *         description: Internal server error
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetOrPostDataSourceViewsResponseBody | PatchDataSourceViewResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const dataSourceView = await DataSourceViewResource.fetchById(
    auth,
    req.query.dsvId as string
  );

  switch (req.method) {
    case "GET":
      return res.status(200).json({
        dataSourceView: dataSourceView.toJSON(),
      });

    case "PATCH":
      const patchBodyValidation = PatchDataSourceViewSchema.decode(req.body);
      if (isLeft(patchBodyValidation)) {
        const pathError = reporter.formatValidationErrors(
          patchBodyValidation.left
        );
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `invalid request body: ${pathError}`,
          },
        });
      }

      const { right: body } = patchBodyValidation;

      let updateResultRes: Result<undefined, Error>;
      if ("parentsIn" in body) {
        const { parentsIn } = body;
        updateResultRes = await dataSourceView.setParents(parentsIn);
      } else {
        const { parentsToAdd, parentsToRemove } = body;
        updateResultRes = await dataSourceView.updateParents(
          parentsToAdd ?? [],
          parentsToRemove ?? []
        );
      }

      if (updateResultRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "The data source view cannot be updated.",
          },
        });
      }

      return res.status(200).json({
        dataSourceView: dataSourceView.toJSON(),
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "the method passed is not supported, GET or PATCH is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);
