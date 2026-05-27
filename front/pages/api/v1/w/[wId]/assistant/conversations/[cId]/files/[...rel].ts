// @migration-status: MIGRATED_TO_HONO

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import {
  getConversationFilesBasePath,
  parseScopedFilePath,
} from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/files/{rel}:
 *   get:
 *     tags:
 *       - Conversations
 *     summary: Download a conversation-scoped file by path
 *     description: |
 *       Download a file from a conversation's file system by its scoped path. The path must
 *       be conversation-scoped, i.e. start with `conversation/` (as surfaced by agent file
 *       system tools). The file content is streamed directly from the conversation mount.
 *     parameters:
 *       - name: wId
 *         in: path
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - name: cId
 *         in: path
 *         required: true
 *         description: ID of the conversation
 *         schema:
 *           type: string
 *       - name: rel
 *         in: path
 *         required: true
 *         description: |
 *           Conversation-scoped file path, e.g. `conversation/foo.pdf` or
 *           `conversation/subdir/foo.pdf`. The `conversation/` prefix is required; any other
 *           scope prefix is rejected. Path traversal segments (`..`) are rejected.
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: File content streamed directly.
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Missing or invalid path parameters (e.g. missing or wrong scope prefix).
 *       403:
 *         description: Resolved path is outside the conversation scope.
 *       404:
 *         description: Conversation or file not found.
 *       405:
 *         description: Method not supported.
 */
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

  // Require a conversation-scoped path (e.g. `conversation/foo.pdf`), matching what the agent
  // file system tools surface. Bare relative paths and other scope prefixes are rejected.
  const scoped = parseScopedFilePath(rel.join("/"));
  if (!scoped || scoped.prefix !== "conversation") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid file path: must be a conversation-scoped path (e.g. `conversation/foo.pdf`).",
      },
    });
  }

  const normalizedRelative = path.posix.normalize(scoped.rel);
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

  const owner = auth.getNonNullableWorkspace();
  const basePath = getConversationFilesBasePath({
    workspaceId: owner.sId,
    conversationId: cId,
  });
  const mountFilePath = `${basePath}${normalizedRelative}`;

  const bucket = getPrivateUploadBucket();
  const contentTypeResult = await bucket.getFileContentType(mountFilePath);
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
  const readStream = bucket.file(mountFilePath).createReadStream();
  readStream.on("error", (err) => {
    logger.error(
      { err, mountFilePath },
      "Error streaming conversation file (GCS)"
    );
    readStream.destroy();
    res.end();
  });
  readStream.pipe(res);
}

export default withPublicAPIAuthentication(handler);
