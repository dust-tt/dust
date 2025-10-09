import type { DataSourceSearchResponseType } from "@dust-tt/client";
import { DataSourceSearchQuerySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { handleDataSourceSearch } from "@app/lib/api/data_sources";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { assertNever } from "@app/types";

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/data_source_views/{dsvId}/search:
 *   get:
 *     summary: Search the data source view
 *     description: Search the data source view identified by {dsvId} in the workspace identified by {wId}.
 *     tags:
 *       - DatasourceViews
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
 *         name: spaceId
 *         required: true
 *         description: ID of the space
 *         schema:
 *           type: string
 *       - in: path
 *         name: dsvId
 *         required: true
 *         description: ID of the data source view
 *         schema:
 *           type: string
 *       - in: query
 *         name: query
 *         required: true
 *         description: The search query
 *         schema:
 *           type: string
 *       - in: query
 *         name: top_k
 *         required: true
 *         description: The number of results to return
 *         schema:
 *           type: number
 *       - in: query
 *         name: full_text
 *         required: true
 *         description: Whether to return the full document content
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: target_document_tokens
 *         required: false
 *         description: The number of tokens in the target document
 *         schema:
 *           type: number
 *       - in: query
 *         name: timestamp_gt
 *         required: false
 *         description: The timestamp to filter by
 *         schema:
 *           type: number
 *       - in: query
 *         name: timestamp_lt
 *         required: false
 *         description: The timestamp to filter by
 *         schema:
 *           type: number
 *       - in: query
 *         name: tags_in
 *         required: false
 *         description: The tags to filter by
 *         schema:
 *           type: string
 *       - in: query
 *         name: tags_not
 *         required: false
 *         description: The tags to filter by
 *         schema:
 *           type: string
 *       - in: query
 *         name: parents_in
 *         required: false
 *         description: The parents to filter by
 *         schema:
 *           type: string
 *       - in: query
 *         name: parents_not
 *         required: false
 *         description: The parents to filter by
 *         schema:
 *           type: string
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
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: ID of the document
 *                       title:
 *                         type: string
 *                         description: Title of the document
 *                       content:
 *                         type: string
 *                         description: Content of the document
 *                       tags:
 *                         type: array
 *                         items:
 *                           type: string
 *                         description: Tags of the document
 *                       parents:
 *                         type: array
 *                         items:
 *                           type: string
 *                         description: Parents of the document
 *                       timestamp:
 *                         type: number
 *                         description: Timestamp of the document
 *                       data:
 *                         type: object
 *                         description: Data of the document
 *                       score:
 *                         type: number
 *                         description: Score of the document
 *       400:
 *         description: Invalid request error
 *       405:
 *         description: Method not supported error
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<DataSourceSearchResponseType>>,
  auth: Authenticator,
  { dataSourceView }: { dataSourceView: DataSourceViewResource }
): Promise<void> {
  if (!dataSourceView.canRead(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      // I could not find a way to make the query params be an array if there is only one tag.
      if (req.query.tags_in && typeof req.query.tags_in === "string") {
        req.query.tags_in = [req.query.tags_in];
      }
      if (req.query.tags_not && typeof req.query.tags_not === "string") {
        req.query.tags_not = [req.query.tags_not];
      }
      if (req.query.parents_in && typeof req.query.parents_in === "string") {
        req.query.parents_in = [req.query.parents_in];
      }
      if (req.query.parents_not && typeof req.query.parents_not === "string") {
        req.query.parents_not = [req.query.parents_not];
      }

      const r = DataSourceSearchQuerySchema.safeParse(req.query);

      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
        });
      }
      const searchQuery = r.data;
      const s = await handleDataSourceSearch({
        searchQuery,
        dataSource: dataSourceView.dataSource,
        dataSourceView,
        auth,
      });
      if (s.isErr()) {
        switch (s.error.code) {
          case "data_source_error":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "data_source_error",
                message: s.error.message,
              },
            });
          default:
            assertNever(s.error.code);
        }
      }

      return res.status(200).json(s.value);
    }

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

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, {
    dataSourceView: { requireCanRead: true },
  })
);
