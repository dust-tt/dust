import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { handleSearch, SearchRequestBody } from "@app/lib/api/search";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
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

export type DataSourceContentNode = ContentNodeWithParent & {
  dataSource: DataSourceType;
  dataSourceViews: DataSourceViewType[];
};

export type PostWorkspaceSearchResponseBody = {
  nodes: DataSourceContentNode[];
  warningCode: SearchWarningCode | null;
  nextPageCursor: string | null;
  resultsCount: number | null;
};

interface UnifiedSearchStreamChunk {
  knowledgeResults?: {
    nodes: DataSourceContentNode[];
    nextPageCursor: string | null;
    resultsCount: number | null;
    warningCode: SearchWarningCode | null;
  };
  toolResults?: ToolSearchResult[];
  done?: boolean;
  totalToolCount?: number;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostWorkspaceSearchResponseBody>>,
  auth: Authenticator
): Promise<void> {
  // Handle GET requests with streaming (unified search)
  if (req.method === "GET") {
    return handleStreamingSearch(req, res, auth);
  }

  // Handle POST requests (legacy non-streaming search)
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET or POST is expected.",
      },
    });
  }

  const bodyValidation = SearchRequestBody.decode(req.body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);

    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
      status_code: 400,
    });
  }

  logger.info(
    {
      workspaceId: auth.workspace()?.sId,
      params: bodyValidation.right,
    },
    "Search knowledge (global)"
  );
  const searchResult = await handleSearch(req, auth, bodyValidation.right);

  if (searchResult.isErr()) {
    return apiError(req, res, {
      status_code: searchResult.error.status,
      api_error: searchResult.error.error,
    });
  }

  return res.status(200).json(searchResult.value);
}

async function handleStreamingSearch(
  req: NextApiRequest,
  res: NextApiResponse,
  auth: Authenticator
): Promise<void> {
  const {
    query,
    limit: limitParam,
    viewType = "all",
    spaceIds: spaceIdsParam,
    includeDataSources = "true",
    searchSourceUrls,
    includeTools = "true",
  } = req.query;

  // Validate query parameter
  if (typeof query !== "string" || query.length < 1) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Query parameter is required.",
      },
    });
  }

  // Validate and parse limit
  const limitStr = typeof limitParam === "string" ? limitParam : "25";
  const limit = parseInt(limitStr, 10);
  if (isNaN(limit) || limit < 10 || limit > 100) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "limit must be a number between 10 and 100.",
      },
    });
  }

  // Parse spaceIds if provided
  const spaceIds =
    typeof spaceIdsParam === "string"
      ? spaceIdsParam.split(",").filter((id) => id.length > 0)
      : undefined;

  // Check if viewType is valid
  if (
    typeof viewType !== "string" ||
    !["table", "document", "all"].includes(viewType)
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "viewType must be one of: table, document, all.",
      },
    });
  }

  try {
    // Setup SSE streaming
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

    // First, fetch and stream knowledge results
    const searchBody = {
      query,
      viewType: viewType as "table" | "document" | "all",
      spaceIds,
      includeDataSources: includeDataSources === "true",
      limit,
      searchSourceUrls: searchSourceUrls === "true",
    };

    logger.info(
      {
        workspaceId: auth.workspace()?.sId,
        params: searchBody,
      },
      "Streaming search (knowledge + tools)"
    );

    const searchResult = await handleSearch(req, auth, searchBody);

    if (searchResult.isErr()) {
      res.write(
        `data: ${JSON.stringify({ error: searchResult.error.error.message })}\n\n`
      );
      // @ts-expect-error - We need it for streaming but it does not exist in the types.
      res.flush();
      res.status(500).end();
      return;
    }

    // Stream knowledge results first
    if (signal.aborted) {
      return;
    }

    const knowledgeChunk: UnifiedSearchStreamChunk = {
      knowledgeResults: searchResult.value,
    };
    res.write(`data: ${JSON.stringify(knowledgeChunk)}\n\n`);
    // @ts-expect-error - We need it for streaming but it does not exist in the types.
    res.flush();

    // Then stream tool results if feature flag is enabled and includeTools is true
    const owner = auth.getNonNullableWorkspace();
    const featureFlags = await getFeatureFlags(owner);
    const hasUniversalSearch = featureFlags.includes("universal_search");

    if (includeTools === "true" && hasUniversalSearch) {
      let totalToolCount = 0;

      for await (const results of streamToolFiles({
        auth,
        query,
        pageSize: limit,
      })) {
        // If the client disconnected, stop streaming
        if (signal.aborted) {
          break;
        }

        totalToolCount += results.length;
        const toolChunk: UnifiedSearchStreamChunk = {
          toolResults: results,
        };
        res.write(`data: ${JSON.stringify(toolChunk)}\n\n`);
        // @ts-expect-error - We need it for streaming but it does not exist in the types.
        res.flush();
      }

      // Send final done message with tool count
      const doneChunk: UnifiedSearchStreamChunk = {
        done: true,
        totalToolCount,
      };
      res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
      // @ts-expect-error - We need it for streaming but it does not exist in the types.
      res.flush();
    } else {
      // If feature flag is not enabled or includeTools is false, just send done
      const doneChunk: UnifiedSearchStreamChunk = {
        done: true,
        totalToolCount: 0,
      };
      res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
      // @ts-expect-error - We need it for streaming but it does not exist in the types.
      res.flush();
    }

    res.status(200).end();
    return;
  } catch (error) {
    logger.error(
      {
        error,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Error in unified search"
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

export default withSessionAuthenticationForWorkspace(handler);
