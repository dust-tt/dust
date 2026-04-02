import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { CoreAPI } from "@app/types/core/core_api";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { PostParentsResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/data_sources/{dsId}/documents/{documentId}/parents:
 *   post:
 *     summary: Update the parents of a document
 *     description: Update the parents of a document in the data source identified by {dsId} in the workspace identified by {wId}.
 *     tags:
 *       - Datasources
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: spaceId
 *         required: true
 *         description: ID of the space
 *         schema:
 *           type: string
 *       - in: path
 *         name: dsId
 *         required: true
 *         description: ID of the data source
 *         schema:
 *           type: string
 *       - in: path
 *         name: documentId
 *         required: true
 *         description: ID of the document
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               parent_id:
 *                 type: string
 *                 description: Direct parent ID of the document
 *               parents:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 'Document and ancestor ids, with the following convention: parents[0] === documentId, parents[1] === parentId, and then ancestors ids in order'
 *     responses:
 *       200:
 *         description: The parents were updated
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       500:
 *         description: Internal Server Error.
 *       404:
 *         description: Data source or workspace not found.
 *       405:
 *         description: Method not supported.
 */

async function handler(
  req: NextApiRequest,

  res: NextApiResponse<WithAPIErrorResponse<PostParentsResponseType>>,
  auth: Authenticator,
  { dataSource }: { dataSource: DataSourceResource }
): Promise<void> {
  switch (req.method) {
    case "POST":
      // To write we must have canWrite or be a systemAPIKey
      if (!(dataSource.canWrite(auth) || auth.isSystemKey())) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You are not allowed to update data in this data source.",
          },
        });
      }

      if (
        !req.body ||
        !Array.isArray(req.body.parents) ||
        !req.body.parents.every((p: any) => typeof p === "string")
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body, `parents` (string[]) is required.",
          },
        });
      }

      // Enforce parents consistency: parents[0] === documentId, parents[1] === parentId (or there is no parents[1] and parentId is null).
      if (req.body.parents.length === 0) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid parents: parents must have at least one element.`,
          },
        });
      }
      if (req.body.parents[0] !== req.query.documentId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid parents: parents[0] should be equal to document_id.`,
          },
        });
      }
      if (
        (req.body.parents.length >= 2 || req.body.parent_id !== null) &&
        req.body.parents[1] !== req.body.parent_id
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid parent id: parents[1] and parent_id should be equal.`,
          },
        });
      }

      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const updateRes = await coreAPI.updateDataSourceDocumentParents({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        documentId: req.query.documentId as string,
        parentId: req.body.parent_id ?? null,
        parents: req.body.parents,
      });

      if (updateRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "There was an error updating the `parents` field.",
            data_source_error: updateRes.error,
          },
        });
      }

      res.status(200).json({ updated: true });
      return;

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

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, {
    dataSource: { requireCanRead: true },
  })
);
