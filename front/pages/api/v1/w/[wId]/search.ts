import type { PostWorkspaceSearchResponseBodyType } from "@dust-tt/client";
import { SearchRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { handleSearch } from "@app/lib/api/search";
import type { Authenticator } from "@app/lib/auth";
import { streamToolFiles } from "@app/lib/search/tools/search";
import type { ToolSearchResult } from "@app/lib/search/tools/types";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type {
  ContentNodeWithParent,
  DataSourceType,
  DataSourceViewType,
  SearchWarningCode,
  WithAPIErrorResponse,
} from "@app/types";
import { isString } from "@app/types";

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

async function handleStreamingSearch(
  req: NextApiRequest,
  res: NextApiResponse,
  auth: Authenticator
): Promise<void> {
  const {
    query,
    limit: limitParam,
    cursor,
    viewType = "all",
    spaceIds: spaceIdsParam,
    includeDataSources = "true",
    searchSourceUrls,
    includeTools = "true",
  } = req.query;

  // Transform query parameters to match SearchRequestBodySchema format
  const limit = isString(limitParam) ? parseInt(limitParam, 10) : 25;

  // Validate limit range
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return apiError(req, res, {
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
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: fromError(r.error).toString(),
      },
    });
  }

  const searchParams = r.data;

  try {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();

    // Create an AbortController to handle client disconnection
    const controller = new AbortController();
    const { signal } = controller;

    // Handle client disconnection
    req.on("close", () => {
      controller.abort();
    });

    logger.info(
      {
        workspaceId: auth.workspace()?.sId,
        params: searchParams,
      },
      "Search knowledge (streaming - v1 API)"
    );

    // First, stream knowledge results
    const searchResult = await handleSearch(req, auth, searchParams);

    if (searchResult.isErr()) {
      return apiError(req, res, {
        status_code: searchResult.error.status,
        api_error: searchResult.error.error,
      });
    }

    // If the client disconnected, stop streaming
    if (signal.aborted) {
      return;
    }

    // Send knowledge results
    const knowledgeChunk: UnifiedSearchStreamChunk = {
      knowledgeResults: searchResult.value,
    };
    res.write(`data: ${JSON.stringify(knowledgeChunk)}\n\n`);
    // @ts-expect-error - We need it for streaming but it does not exist in the types.
    res.flush();

    // Stream tool results if enabled and not paginating
    // Tool results are only included on the first page (no cursor)
    if (
      includeTools === "true" &&
      !cursor &&
      !signal.aborted &&
      isString(searchParams.query)
    ) {
      for await (const results of streamToolFiles({
        auth,
        query: searchParams.query,
        pageSize: searchParams.limit,
      })) {
        // If the client disconnected, stop streaming
        if (signal.aborted) {
          break;
        }

        const toolChunk: UnifiedSearchStreamChunk = {
          toolResults: results,
        };
        res.write(`data: ${JSON.stringify(toolChunk)}\n\n`);
        // @ts-expect-error - We need it for streaming but it does not exist in the types.
        res.flush();
      }
    }

    res.status(200).end();
    return;
  } catch (error) {
    logger.error(
      {
        error,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Error in unified search (v1 API)"
    );
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to search: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    });
  }
}

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
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostWorkspaceSearchResponseBodyType>
  >,
  auth: Authenticator
): Promise<void> {
  // Support both GET (streaming) and POST (legacy) methods
  if (req.method === "GET") {
    return handleStreamingSearch(req, res, auth);
  }

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET or POST is expected.",
      },
    });
  }

  const r = SearchRequestBodySchema.safeParse(req.body);

  if (r.error) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: fromError(r.error).toString(),
      },
      status_code: 400,
    });
  }

  const searchResult = await handleSearch(req, auth, r.data);

  if (searchResult.isErr()) {
    return apiError(req, res, {
      status_code: searchResult.error.status,
      api_error: searchResult.error.error,
    });
  }

  return res.status(200).json(searchResult.value);
}

export default withPublicAPIAuthentication(handler);
