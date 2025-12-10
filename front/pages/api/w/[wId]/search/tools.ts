import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import {
  searchToolFiles,
  streamToolFiles,
} from "@app/lib/search/tools/search";
import type { ToolSearchResult } from "@app/lib/search/tools/types";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

interface ToolSearchResponse {
  results: ToolSearchResult[];
  resultsCount: number;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ToolSearchResponse>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only GET method is supported.",
      },
    });
  }

  const { query, pageSize: pageSizeParam, stream } = req.query;
  if (typeof query !== "string" || query.length < 1) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Query parameter is required.",
      },
    });
  }
  if (typeof pageSizeParam !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "pageSize parameter is required.",
      },
    });
  }

  const pageSize = parseInt(pageSizeParam, 10);
  if (isNaN(pageSize) || pageSize < 10 || pageSize > 100) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "pageSize must be a number between 10 and 100.",
      },
    });
  }

  try {
    // Handle streaming mode
    if (stream === "true") {
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

      let totalCount = 0;

      for await (const results of streamToolFiles({ auth, query, pageSize })) {
        // If the client disconnected, stop streaming
        if (signal.aborted) {
          break;
        }

        totalCount += results.length;
        res.write(
          `data: ${JSON.stringify({ results, resultsCount: results.length })}\n\n`
        );
        // @ts-expect-error - We need it for streaming but it does not exist in the types.
        res.flush();
      }

      res.write(`data: ${JSON.stringify({ done: true, totalCount })}\n\n`);
      // @ts-expect-error - We need it for streaming but it does not exist in the types.
      res.flush();
      res.status(200).end();
      return;
    }

    // Non-streaming mode (existing behavior)
    const results = await searchToolFiles({ auth, query, pageSize });

    return res.status(200).json({
      results,
      resultsCount: results.length,
    });
  } catch (error) {
    logger.error(
      {
        error,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Error in attachment search"
    );
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to search for attachments: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
