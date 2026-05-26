import config from "@app/lib/api/config";
import { resolveLegacyDataSourceSpaceId } from "@app/lib/api/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { PostParentsResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

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
const app = publicApiApp();

const ParamsSchema = z.object({
  dsId: z.string(),
  documentId: z.string(),
});

const PostParentsBodySchema = z.object({
  parents: z.array(z.string()),
  parent_id: z.string().nullable().optional(),
});

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PostParentsBodySchema),
  async (ctx): HandlerResult<PostParentsResponseType> => {
    const auth = ctx.get("auth");
    const { dsId, documentId } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchByNameOrId(
      auth,
      dsId,
      // TODO(DATASOURCE_SID): Clean-up
      { origin: "v1_data_sources_documents_document_parents" }
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

    // To write we must have canWrite or be a systemAPIKey
    if (!(dataSource.canWrite(auth) || auth.isSystemKey())) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message: "You are not allowed to update data in this data source.",
        },
      });
    }

    const body = ctx.req.valid("json");
    const parentId = body.parent_id ?? null;
    const { parents } = body;

    // Enforce parents consistency: parents[0] === documentId, parents[1] === parentId (or there is no parents[1] and parentId is null).
    if (parents.length === 0) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid parents: parents must have at least one element.`,
        },
      });
    }
    if (parents[0] !== documentId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid parents: parents[0] should be equal to document_id.`,
        },
      });
    }
    if ((parents.length >= 2 || parentId !== null) && parents[1] !== parentId) {
      return apiError(ctx, {
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
      documentId,
      parentId,
      parents,
    });

    if (updateRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "There was an error updating the `parents` field.",
          data_source_error: updateRes.error,
        },
      });
    }

    return ctx.json({ updated: true });
  }
);

export default app;
