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

  if (typeof query !== "string" || query.length < 3) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Query must be at least 3 characters.",
      },
    });
  }

  const limit = parseInt((limitParam as string) || "25", 10);
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "limit must be a number between 1 and 100.",
      },
    });
  }

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

    // Parse spaceIds from query parameter
    const spaceIds =
      typeof spaceIdsParam === "string" && spaceIdsParam.length > 0
        ? spaceIdsParam.split(",")
        : undefined;

    // Prepare search params for handleSearch
    const searchParams = {
      query,
      viewType: viewType as "all" | "document" | "table",
      spaceIds,
      includeDataSources: includeDataSources === "true",
      searchSourceUrls: searchSourceUrls === "true",
      limit,
    };

    logger.info(
      {
        workspaceId: auth.workspace()?.sId,
        params: searchParams,
      },
      "Search knowledge (streaming)"
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

    // Check feature flag for universal search (tool search)
    const owner = auth.getNonNullableWorkspace();
    const featureFlags = await getFeatureFlags(owner);
    const hasUniversalSearch = featureFlags.includes("universal_search");

    // Stream tool results if enabled and not paginating
    // Tool results are only included on the first page (no cursor)
    if (
      includeTools === "true" &&
      hasUniversalSearch &&
      !cursor &&
      !signal.aborted
    ) {
      for await (const results of streamToolFiles({
        auth,
        query,
        pageSize: limit,
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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostWorkspaceSearchResponseBody>>,
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

export default withSessionAuthenticationForWorkspace(handler);
