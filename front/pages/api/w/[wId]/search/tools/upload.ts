import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import {
  downloadAndUploadToolFile,
  getToolAccessToken,
} from "@app/lib/search/tools/search";
import { apiError } from "@app/logger/withlogging";
import type { FileType, WithAPIErrorResponse } from "@app/types";

interface ToolUploadResponseBody {
  file: FileType;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ToolUploadResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST method is supported.",
      },
    });
  }

  const { serverViewId, externalId, conversationId } = req.body;

  if (typeof serverViewId !== "string" || serverViewId.length < 1) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "serverViewId parameter is required.",
      },
    });
  }

  if (typeof externalId !== "string" || externalId.length < 1) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "externalId parameter is required.",
      },
    });
  }

  if (conversationId !== undefined && typeof conversationId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "conversationId must be a string.",
      },
    });
  }

  const tokenResult = await getToolAccessToken({ auth, serverViewId });
  if (tokenResult.isErr()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: tokenResult.error.message,
      },
    });
  }

  const { tool, accessToken } = tokenResult.value;
  const result = await downloadAndUploadToolFile({
    auth,
    tool,
    accessToken,
    externalId,
    conversationId,
  });

  if (result.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: result.error.message,
      },
    });
  }

  return res.status(200).json({
    file: result.value,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
