import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { searchToolNodes } from "@app/lib/search/tools/search";
import type { ToolSeachResults } from "@app/lib/search/tools/types";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ToolSeachResults>>,
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

  const { query, pageSize: pageSizeParam } = req.query;
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
    const nodes = await searchToolNodes({ auth, query, pageSize });

    return res.status(200).json({
      nodes,
      resultsCount: nodes.length,
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
