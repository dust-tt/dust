import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { downloadAndUploadToolFile } from "@app/lib/search/tools/search";
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

  const { serverViewId, internalId } = req.body;

  if (typeof serverViewId !== "string" || serverViewId.length < 1) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "serverViewId parameter is required.",
      },
    });
  }

  if (typeof internalId !== "string" || internalId.length < 1) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "internalId parameter is required.",
      },
    });
  }

  const result = await downloadAndUploadToolFile({
    auth,
    serverViewId,
    internalId,
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
