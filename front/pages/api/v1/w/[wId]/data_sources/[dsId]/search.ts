import type { DocumentType, WithAPIErrorResponse } from "@dust-tt/types";
import { dustManagedCredentials } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { JSONSchemaType } from "ajv";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { parse_payload } from "@app/lib/http_utils";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type DatasourceSearchQuery = {
  query: string;
  top_k: number;
  full_text: boolean;
  target_document_tokens?: number;
  timestamp_gt?: number;
  timestamp_lt?: number;
  tags_in?: string[];
  tags_not?: string[];
  parents_in?: string[];
  parents_not?: string[];
};

const searchQuerySchema: JSONSchemaType<DatasourceSearchQuery> = {
  type: "object",
  properties: {
    query: { type: "string" },
    top_k: { type: "number" },
    full_text: { type: "boolean" },
    target_document_tokens: { type: "number", nullable: true },
    timestamp_gt: { type: "number", nullable: true },
    timestamp_lt: { type: "number", nullable: true },
    tags_in: { type: "array", items: { type: "string" }, nullable: true },
    tags_not: { type: "array", items: { type: "string" }, nullable: true },
    parents_in: { type: "array", items: { type: "string" }, nullable: true },
    parents_not: { type: "array", items: { type: "string" }, nullable: true },
  },
  required: ["query", "top_k", "full_text"],
};

type DatasourceSearchResponseBody = {
  documents: Array<DocumentType>;
};

/**
 * @swagger
 * /api/v1/w/{wId}/data_sources/{dsId}/search:
 *   get:
 *     summary: Search the data source
 *     description: Search the data source identified by {dsId} in the workspace identified by {wId}.
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
 *         name: dsId
 *         required: true
 *         description: ID of the data source
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
 *         description: Whether to perform a full text search
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
  res: NextApiResponse<WithAPIErrorResponse<DatasourceSearchResponseBody>>,
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
    { origin: "v1_data_sources_search" }
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

  switch (req.method) {
    case "GET": {
      if (req.query.tags_in && typeof req.query.tags_in === "string") {
        req.query.tags_in = [req.query.tags_in];
      }
      if (req.query.tags_not && typeof req.query.tags_not === "string") {
        req.query.tags_not = [req.query.tags_not];
      }

      // Data source operations are performed with our credentials.
      const credentials = dustManagedCredentials();

      const queryRes = parse_payload(searchQuerySchema, req.query);
      if (queryRes.isErr()) {
        const err = queryRes.error;
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid body sent: ${err.message}`,
          },
        });
      }
      const query = queryRes.value;

      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const data = await coreAPI.searchDataSource(
        dataSource.dustAPIProjectId,
        dataSource.dustAPIDataSourceId,
        {
          query: query.query,
          topK: query.top_k,
          fullText: query.full_text,
          target_document_tokens: query.target_document_tokens,
          filter: {
            tags: {
              in: query.tags_in ?? null,
              not: query.tags_not ?? null,
            },
            parents: {
              in: query.parents_in ?? null,
              not: query.parents_not ?? null,
            },
            timestamp: {
              gt: query.timestamp_gt ?? null,
              lt: query.timestamp_lt ?? null,
            },
          },
          credentials,
        }
      );

      if (data.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "data_source_error",
            message: "There was an error performing the data source search.",
            data_source_error: data.error,
          },
        });
      }

      res.status(200).json({
        documents: data.value.documents,
      });
      return;
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

export default withPublicAPIAuthentication(handler);
