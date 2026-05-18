/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getConversationFilesBasePath } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
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
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only GET method is supported.",
      },
    });
  }

  const { cId, rel } = req.query;
  if (!isString(cId) || !Array.isArray(rel) || rel.length === 0) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing conversation id or file path.",
      },
    });
  }

  const conversation = await ConversationResource.fetchById(auth, cId);
  if (!conversation) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();

  // filePath is relative to the conversation's files base. Reject any traversal attempt.
  const normalizedRelative = path.posix.normalize(rel.join("/"));
  if (
    normalizedRelative.startsWith("..") ||
    normalizedRelative.startsWith("/")
  ) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Access denied: path is outside conversation scope.",
      },
    });
  }

  const basePath = getConversationFilesBasePath({
    workspaceId: owner.sId,
    conversationId: cId,
  });
  const gcsPath = `${basePath}${normalizedRelative}`;

  const bucket = getPrivateUploadBucket();
  const contentTypeResult = await bucket.getFileContentType(gcsPath);
  if (contentTypeResult.isErr()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const contentType = contentTypeResult.value ?? "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  const readStream = bucket.file(gcsPath).createReadStream();
  readStream.on("error", (err) => {
    logger.error({ err, gcsPath }, "Error streaming conversation file (GCS)");
    readStream.destroy();
    res.end();
  });
  readStream.pipe(res);
}

export default withSessionAuthenticationForWorkspace(handler);
