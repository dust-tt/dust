// @migration-status: MIGRATED_TO_HONO
/* eslint-disable dust/enforce-client-types-in-public-api */

import {
  getConversationFilesBasePath,
  getPodFilesBasePath,
  scopedFilePathPrefixSchema,
} from "@app/lib/api/files/mount_path";
import { extractAndVerifyVizAccessTokenFromHeader } from "@app/lib/api/viz/access_tokens";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";

/**
 * @ignoreswagger
 *
 * Serves GCS-only files referenced from a frame by scoped resource path
 * (e.g., GET /api/v1/viz/files/conversation/chart.png).
 * Access is granted via the same JWT used by /api/v1/viz/files/[fileId].
 *
 * Single-segment requests (fil_xxx) are routed to [fileId].ts by Next.js.
 * This catch-all handles multi-segment scoped paths only.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<never>>
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

  const { segments } = req.query;
  if (!Array.isArray(segments) || segments.length < 2) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path: expected /files/{scope}/{rel...}.",
      },
    });
  }

  const [rawScope, ...relParts] = segments;

  const scopeResult = scopedFilePathPrefixSchema.safeParse(rawScope);
  if (!scopeResult.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: scopeResult.error.message,
      },
    });
  }

  const tokenRes = extractAndVerifyVizAccessTokenFromHeader(
    req.headers.authorization
  );
  if (tokenRes.isErr()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "workspace_auth_error",
        message: tokenRes.error,
      },
    });
  }
  const tokenPayload = tokenRes.value;

  // Get file info using the fileToken from the access token.
  const result = await FileResource.fetchByShareTokenWithContent(
    tokenPayload.fileToken
  );
  if (!result) {
    return apiError(req, res, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const { file: frameFile, shareScope, conversationSpaceId } = result;

  // If current share scope differs from token scope, reject. It means share scope changed.
  if (shareScope !== tokenPayload.shareScope) {
    return apiError(req, res, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  // Only allow frame files.
  if (!frameFile.isInteractiveContent) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only frame files can be shared publicly.",
      },
    });
  }

  const workspace = await WorkspaceResource.fetchByModelId(
    frameFile.workspaceId
  );
  if (!workspace) {
    return apiError(req, res, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  // If file is shared publicly, ensure workspace allows it.
  if (
    shareScope === "public" &&
    !workspace.canShareInteractiveContentPublicly
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const workspaceId = workspace.sId;
  const normalizedRel = path.posix.normalize(relParts.join("/"));

  if (normalizedRel.startsWith("..") || normalizedRel.startsWith("/")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Access denied: path is outside allowed scope.",
      },
    });
  }

  let basePath: string;
  if (scopeResult.data === "conversation") {
    const conversationId =
      frameFile.useCaseMetadata?.conversationId ??
      frameFile.useCaseMetadata?.sourceConversationId;
    if (!isString(conversationId)) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Frame has no conversation context for this path.",
        },
      });
    }
    // TODO(FILE SYSTEM): Files created by sub-agents live under their own sub-conversation
    // directory and won't be found here. The MCP server needs to define how to expose them
    // (e.g. flattening into the parent conversation directory at listing time) before this
    // endpoint can serve them.
    basePath = getConversationFilesBasePath({ workspaceId, conversationId });
  } else {
    // Pod-scoped frames have spaceId directly. Conversation-scoped frames that live in
    // a pod space get conversationSpaceId resolved by fetchByShareToken.
    const podId = frameFile.useCaseMetadata?.spaceId ?? conversationSpaceId;
    if (!isString(podId)) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Frame has no pod context for this path.",
        },
      });
    }
    basePath = getPodFilesBasePath({ workspaceId, podId });
  }

  const gcsPath = `${basePath}${normalizedRel}`;

  const bucket = getPrivateUploadBucket();
  const contentTypeResult = await bucket.getFileContentType(gcsPath);
  if (contentTypeResult.isErr()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const contentType = contentTypeResult.value ?? "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  const readStream = bucket.file(gcsPath).createReadStream();
  readStream.on("error", (err) => {
    logger.error({ err, gcsPath }, "Error streaming scoped file (GCS)");
    readStream.destroy();
    res.end();
  });
  readStream.pipe(res);
}

export default handler;
