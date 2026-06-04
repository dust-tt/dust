import { handleSearch } from "@app/lib/api/search";
import { streamToolFiles } from "@app/lib/search/tools/search";
import type { ToolSearchResult } from "@app/lib/search/tools/types";
import logger from "@app/logger/logger";
import type { ContentNodeWithParent } from "@app/types/connectors/connectors_api";
import type { SearchWarningCode } from "@app/types/core/core_api";
import type { DataSourceType } from "@app/types/data_source";
import type { DataSourceViewType } from "@app/types/data_source_view";
import { isString } from "@app/types/shared/utils/general";
import type { PostWorkspaceSearchResponseBodyType } from "@dust-tt/client";
import { SearchRequestBodySchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { setSSEHeaders } from "@front-api/middlewares/streaming";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { stream } from "hono/streaming";
import { fromError } from "zod-validation-error";

import tools from "./tools";

export type DataSourceContentNode = ContentNodeWithParent & {
  dataSource: DataSourceType;
  dataSourceViews: DataSourceViewType[];
};

interface UnifiedSearchStreamChunk {
  knowledgeResults?: {
    nodes: DataSourceContentNode[];
    warningCode: SearchWarningCode | null;
    nextPageCursor: string | null;
    resultsCount: number | null;
  };
  toolResults?: ToolSearchResult[];
}

// Mounted at /api/v1/w/:wId/search. publicApiAuth is applied by the parent
// v1 workspace sub-app, so ctx.get("auth") is always available here.
const app = publicApiApp();

/**
 * @swagger
 * /api/v1/w/{wId}/search:
 *   get:
 *     summary: Search for nodes in the workspace (streaming)
 *     description: Search for nodes in the workspace with SSE streaming
 *     tags:
 *       - Search
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: query
 *         name: query
 *         required: true
 *         description: The search query (minimum 3 characters)
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Number of results per page (1-100, default 25)
 *         schema:
 *           type: integer
 *       - in: query
 *         name: cursor
 *         required: false
 *         description: Cursor for pagination
 *         schema:
 *           type: string
 *       - in: query
 *         name: viewType
 *         required: false
 *         description: Type of view to filter results
 *         schema:
 *           type: string
 *           enum: [all, document, table]
 *       - in: query
 *         name: spaceIds
 *         required: false
 *         description: Comma-separated list of space IDs to search in
 *         schema:
 *           type: string
 *       - in: query
 *         name: includeDataSources
 *         required: false
 *         description: Whether to include data sources
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: searchSourceUrls
 *         required: false
 *         description: Whether to search source URLs
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: includeTools
 *         required: false
 *         description: Whether to include tool results
 *         schema:
 *           type: boolean
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Search results streamed successfully
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       405:
 *         description: Method not allowed
 *   post:
 *     summary: Search for nodes in the workspace
 *     description: Search for nodes in the workspace
 *     tags:
 *       - Search
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
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
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The search query
 *               includeDataSources:
 *                 type: boolean
 *                 description: List of data source IDs to include in search
 *               viewType:
 *                 type: string
 *                 description: Type of view to filter results
 *               spaceIds:
 *                 type: array
 *                 description: List of space IDs to search in
 *                 items:
 *                   type: string
 *               nodeIds:
 *                 type: array
 *                 description: List of specific node IDs to search
 *                 items:
 *                   type: string
 *               searchSourceUrls:
 *                 type: boolean
 *                 description: Whether to search source URLs
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Space not found
 *       405:
 *         description: Method not allowed
 */
app.get("/", async (ctx) => {
  const auth = ctx.get("auth");

  const {
    query,
    limit: limitParam,
    cursor,
    viewType = "all",
    spaceIds: spaceIdsParam,
    includeDataSources = "true",
    searchSourceUrls,
    includeTools = "true",
  } = ctx.req.query();

  // Transform query parameters to match SearchRequestBodySchema format
  const limit = isString(limitParam) ? parseInt(limitParam, 10) : 25;

  // Validate limit range
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "limit must be a number between 1 and 100.",
      },
    });
  }

  const searchParamsInput = {
    query: isString(query) ? query : undefined,
    viewType: isString(viewType) ? viewType : "all",
    spaceIds:
      isString(spaceIdsParam) && spaceIdsParam.length > 0
        ? spaceIdsParam.split(",")
        : [],
    includeDataSources: includeDataSources === "true",
    limit,
    searchSourceUrls: searchSourceUrls === "true" ? true : undefined,
  };

  // Validate using SearchRequestBodySchema
  const r = SearchRequestBodySchema.safeParse(searchParamsInput);

  if (r.error) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: fromError(r.error).toString(),
      },
    });
  }

  const searchParams = r.data;

  setSSEHeaders(ctx);

  return stream(ctx, async (s) => {
    try {
      logger.info(
        {
          workspaceId: auth.workspace()?.sId,
          params: searchParams,
        },
        "Search knowledge (streaming - v1 API)"
      );

      // First, stream knowledge results
      const searchResult = await handleSearch(
        ctx.req.query(),
        auth,
        searchParams
      );

      if (searchResult.isErr()) {
        // Write the error as an SSE event so the client can handle it.
        await s.write(
          `data: ${JSON.stringify({ error: searchResult.error })}\n\n`
        );
        return;
      }

      if (s.aborted) {
        return;
      }

      // Send knowledge results
      const knowledgeChunk: UnifiedSearchStreamChunk = {
        knowledgeResults: searchResult.value,
      };
      await s.write(`data: ${JSON.stringify(knowledgeChunk)}\n\n`);

      // Stream tool results if enabled and not paginating
      // Tool results are only included on the first page (no cursor)
      if (
        includeTools === "true" &&
        !cursor &&
        !s.aborted &&
        isString(searchParams.query)
      ) {
        for await (const results of streamToolFiles({
          auth,
          query: searchParams.query,
          pageSize: searchParams.limit,
        })) {
          if (s.aborted) {
            break;
          }

          const toolChunk: UnifiedSearchStreamChunk = {
            toolResults: results,
          };
          await s.write(`data: ${JSON.stringify(toolChunk)}\n\n`);
        }
      }
    } catch (error) {
      logger.error(
        {
          error,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "Error in unified search (v1 API)"
      );
    }
  });
});

app.post(
  "/",
  validate("json", SearchRequestBodySchema),
  async (ctx): HandlerResult<PostWorkspaceSearchResponseBodyType> => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const searchResult = await handleSearch(ctx.req.query(), auth, body);

    if (searchResult.isErr()) {
      return apiError(ctx, {
        status_code: searchResult.error.status,
        api_error: searchResult.error.error,
      });
    }

    return ctx.json(searchResult.value);
  }
);

app.route("/tools", tools);

export default app;
