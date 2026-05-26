import { handleDataSourceSearch } from "@app/lib/api/data_sources";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { DataSourceSearchResponseType } from "@dust-tt/client";
import { DataSourceSearchQuerySchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { withDataSourceView } from "@front-api/middlewares/with_data_source_view";
import { withSpace } from "@front-api/middlewares/with_space";
import { fromError } from "zod-validation-error";

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
// Mounted at /api/v1/w/:wId/spaces/:spaceId/data_source_views/:dsvId/search.
const app = publicApiApp();

app.get(
  "/",
  withSpace({ requireCanRead: true }),
  withDataSourceView({ requireCanRead: true }),
  async (ctx): HandlerResult<DataSourceSearchResponseType> => {
    const auth = ctx.get("auth");
    const dataSourceView = ctx.get("dataSourceView");

    // Allow tags_in / tags_not / parents_in / parents_not as either a single
    // string or an array of strings.
    const rawQuery: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(ctx.req.query())) {
      rawQuery[key] = value;
    }
    for (const key of [
      "tags_in",
      "tags_not",
      "parents_in",
      "parents_not",
    ] as const) {
      const all = ctx.req.queries(key);
      if (all && all.length > 0) {
        rawQuery[key] = all;
      }
    }

    const r = DataSourceSearchQuerySchema.safeParse(rawQuery);

    if (r.error) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: fromError(r.error).toString(),
        },
      });
    }
    const searchQuery = r.data;
    const s = await handleDataSourceSearch({
      auth,
      searchQuery,
      dataSource: dataSourceView.dataSource,
      dataSourceView,
    });
    if (s.isErr()) {
      switch (s.error.code) {
        case "data_source_error":
          return apiError(ctx, {
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

    return ctx.json(s.value);
  }
);

export default app;
