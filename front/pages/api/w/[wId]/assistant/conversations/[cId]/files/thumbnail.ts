/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getConversationFilesBasePath } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isSupportedImageContentType } from "@app/types/files";
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

  const { cId, filePath } = req.query;
  if (!isString(cId) || !isString(filePath)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid query parameters, `cId` and `filePath` (strings) are required.",
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
  const normalizedRelative = path.posix.normalize(filePath);
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
  const normalizedPath = `${basePath}${normalizedRelative}`;

  const [fileResource] = await FileResource.fetchByMountFilePaths(auth, [
    normalizedPath,
  ]);

  // If a FileResource exists, stream its best available version (processed if available).
  if (fileResource) {
    if (!isSupportedImageContentType(fileResource.contentType)) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Thumbnail is only supported for image files.",
        },
      });
    }
    res.setHeader("Content-Type", fileResource.contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    const readStream = fileResource.getContentReadStream(auth);
    readStream.on("error", (err) => {
      logger.error(
        { err, filePath: normalizedPath },
        "Error streaming thumbnail (FileResource)"
      );
      readStream.destroy();
      res.end();
    });
    readStream.pipe(res);
    return;
  }

  // No FileResource, stream directly from GCS (sandbox-generated file).
  const bucket = getPrivateUploadBucket();
  const contentTypeResult = await bucket.getFileContentType(normalizedPath);
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
  if (!isSupportedImageContentType(contentType)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Thumbnail is only supported for image files.",
      },
    });
  }

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "private, max-age=3600");
  const readStream = bucket.file(normalizedPath).createReadStream();
  readStream.on("error", (err) => {
    logger.error(
      { err, filePath: normalizedPath },
      "Error streaming thumbnail (GCS)"
    );
    readStream.destroy();
    res.end();
  });
  readStream.pipe(res);
}

export default withSessionAuthenticationForWorkspace(handler);
