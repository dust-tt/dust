import type { DocumentType, WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetDocumentsResponseBody = {
  documents: Array<DocumentType>;
  total: number;
};

/**
 * @swagger
 * /api/v1/w/{wId}/vaults/{vId}/data_sources/{dsId}/documents:
 *   get:
 *     summary: Get documents
 *     description: Get documents in the data source identified by {dsId} in the workspace identified by {wId}.
 *     tags:
 *       - Datasources
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
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
 *       - in: query
 *         name: limit
 *         description: Limit the number of documents returned
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         description: Offset the returned documents
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: The documents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 documents:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Document'
 *                 total:
 *                   type: integer
 *       404:
 *         description: The data source was not found
 *       405:
 *         description: Method not supported
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetDocumentsResponseBody>>,
  auth: Authenticator
): Promise<void> {
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
    { origin: "v1_data_sources_documents" }
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
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const offset = req.query.offset
        ? parseInt(req.query.offset as string)
        : 0;

      const documents = await coreAPI.getDataSourceDocuments(
        {
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
        },
        { limit, offset }
      );
      if (documents.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "data_source_error",
            message: "There was an error retrieving the data source documents.",
            data_source_error: documents.error,
          },
        });
      }

      res.status(200).json({
        documents: documents.value.documents,
        total: documents.value.total,
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

export default withPublicAPIAuthentication(handler);
