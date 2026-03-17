/** @ignoreswagger */
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getConversationFilesBasePath } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<never>>,
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

  const { cId, path } = req.query;
  if (!isString(cId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  if (!isString(path)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `path` (string) is required.",
      },
    });
  }

  // Validate the conversation exists and user has access.
  const conversationRes = await getConversation(auth, cId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  // Validate the requested path is within this conversation's files directory.
  // Reject path traversal attempts (e.g. "../../other-convo/files/secret.txt").
  const owner = auth.getNonNullableWorkspace();
  const expectedPrefix = getConversationFilesBasePath({
    workspaceId: owner.sId,
    conversationId: cId,
  });
  if (path.includes("..") || !path.startsWith(expectedPrefix)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Access denied: path is outside conversation scope.",
      },
    });
  }

  const bucket = getPrivateUploadBucket();

  try {
    const contentType = await bucket.getFileContentType(path);
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }
  } catch {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const readStream = bucket.file(path).createReadStream();

  readStream.on("error", () => {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  readStream.pipe(res);
}

export default withSessionAuthenticationForWorkspace(handler);
