/** @ignoreswagger */
import { getLightConversation } from "@app/lib/api/assistant/conversation/fetch";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getConversationFilesBasePath } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<never>>,
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

  const { cId } = req.query;
  if (!isString(cId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  const { filePath } = req.body;
  if (!isString(filePath)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid body, `filePath` (string) is required.",
      },
    });
  }

  // Validate the conversation exists and user has access.
  const conversationRes = await getLightConversation(auth, cId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  // Validate the requested path is within this conversation's files directory.
  // Normalize first to collapse any ".." or "." segments, then verify the prefix.
  const owner = auth.getNonNullableWorkspace();
  const expectedPrefix = getConversationFilesBasePath({
    workspaceId: owner.sId,
    conversationId: cId,
  });
  const normalizedPath = path.posix.normalize(filePath);
  if (!normalizedPath.startsWith(expectedPrefix)) {
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
    const contentType = await bucket.getFileContentType(normalizedPath);
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

  const readStream = bucket.file(normalizedPath).createReadStream();

  readStream.on("error", (err) => {
    logger.error({ err, filePath: normalizedPath }, "Error streaming sandbox file");
    readStream.destroy();
    res.end();
  });

  readStream.pipe(res);
}

export default withSessionAuthenticationForWorkspace(handler);
