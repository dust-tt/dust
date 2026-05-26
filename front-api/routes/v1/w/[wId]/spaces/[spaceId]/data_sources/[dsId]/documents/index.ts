import config from "@app/lib/api/config";
import { resolveLegacyDataSourceSpaceId } from "@app/lib/api/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { GetDocumentsResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import documentId from "./[documentId]";

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/data_sources/{dsId}/documents:
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
 *       - in: query
 *         name: document_ids
 *         description: The IDs of the documents to fetch (optional)
 *         schema:
 *           type: array
 *           items:
 *             type: string
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
const app = publicApiApp();

app.route("/:documentId", documentId);

const QuerySchema = z.object({
  limit: z.coerce.number().int().nonnegative().optional().default(10),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});

app.get(
  "/",
  validate("query", QuerySchema),
  async (ctx): HandlerResult<GetDocumentsResponseType> => {
    const auth = ctx.get("auth");
    const dsId = ctx.req.param("dsId");
    if (!dsId) {
      return apiError(ctx, {
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

    const spaceId = await resolveLegacyDataSourceSpaceId(
      auth,
      ctx.req.param("spaceId"),
      dataSource
    );

    if (
      !dataSource ||
      dataSource.space.sId !== spaceId ||
      !dataSource.canRead(auth)
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      });
    }

    if (dataSource.space.kind === "conversations") {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "The space you're trying to access was not found",
        },
      });
    }

    const { limit, offset } = ctx.req.valid("query");

    const documentIdsParam = ctx.req.queries("document_ids");
    const documentIds =
      documentIdsParam && documentIdsParam.length > 0
        ? documentIdsParam
        : undefined;

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const documents = await coreAPI.getDataSourceDocuments(
      {
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        documentIds,
      },
      { limit, offset }
    );
    if (documents.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "data_source_error",
          message: "There was an error retrieving the data source documents.",
          data_source_error: documents.error,
        },
      });
    }

    return ctx.json({
      documents: documents.value.documents,
      total: documents.value.total,
    });
  }
);

export default app;
