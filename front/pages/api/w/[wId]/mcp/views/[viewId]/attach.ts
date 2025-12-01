import type { NextApiRequest, NextApiResponse } from "next";

import { getFileToAttach } from "@app/lib/actions/mcp_internal_actions/search/service";
import type { ToolAttachment } from "@app/lib/actions/mcp_internal_actions/search/types";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { normalizeError } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ToolAttachment>>,
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

  const { viewId, fileId } = req.query;
  if (typeof viewId !== "string" || typeof fileId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "viewId and fileId are required.",
      },
    });
  }

  try {
    const result = await getFileToAttach({
      auth,
      serverViewId: viewId,
      fileId,
    });

    return res.status(200).json(result);
  } catch (error) {
    logger.error(
      {
        error,
        viewId,
        fileId,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Error fetching file for attachment"
    );

    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: normalizeError(error).message,
      },
    });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
