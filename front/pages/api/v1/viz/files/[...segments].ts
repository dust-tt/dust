// @migration-status: MIGRATED_TO_HONO
/* eslint-disable dust/enforce-client-types-in-public-api */

import {
  buildCanonicalScopedPathFromVizScope,
  parseRawVizScope,
} from "@app/lib/api/files/mount_path";
import { extractAndVerifyVizAccessTokenFromHeader } from "@app/lib/api/viz/access_tokens";
import {
  assertVizFileAuthorized,
  readAllowlistedScopedVizFile,
  resolveAllowlistedCanonicalPath,
} from "@app/lib/api/viz/authorized_file_access";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import type { Readable } from "stream";

/**
 * @ignoreswagger
 *
 * Serves files referenced from a frame by scoped resource path
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

  const scope = parseRawVizScope(rawScope);
  if (!scope) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid scope prefix "${rawScope}": expected "conversation", "pod", "conversation-{id}", or "pod-{id}".`,
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

  // Get frame metadata, content (for allowlist hash), and scoped file system.
  const result = await FileResource.fetchByShareTokenWithContent(
    tokenPayload.fileToken
  );
  if (!result) {
    return apiError(req, res, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const {
    file: frameFile,
    content: frameContent,
    shareScope,
    conversationSpaceId,
    authorizedFileAccess,
    fs,
    workspace: owner,
  } = result;

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

  const requestedRef = `${rawScope}/${normalizedRel}`;

  const authorizationMode = await assertVizFileAuthorized({
    authorizedFileAccess,
    requestedRef,
    owner,
    frameContent,
  });
  if (authorizationMode === "denied") {
    return apiError(req, res, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  let canonicalScopedPath: string;
  if (authorizationMode === "authorized" && authorizedFileAccess) {
    const allowlistedPath = resolveAllowlistedCanonicalPath(
      authorizedFileAccess,
      requestedRef
    );
    if (!allowlistedPath) {
      return apiError(req, res, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }
    canonicalScopedPath = allowlistedPath;
  } else {
    const canonicalPathResult = buildCanonicalScopedPathFromVizScope(
      scope,
      normalizedRel,
      {
        conversationId:
          frameFile.useCaseMetadata?.conversationId ??
          frameFile.useCaseMetadata?.sourceConversationId ??
          null,
        spaceId: frameFile.useCaseMetadata?.spaceId ?? conversationSpaceId,
      }
    );
    if (canonicalPathResult.isErr()) {
      switch (canonicalPathResult.error.code) {
        case "missing_conversation_context":
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Frame has no conversation context for this path.",
            },
          });
        case "missing_pod_context":
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Frame has no project context for this path.",
            },
          });
        case "conversation_context_mismatch":
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message:
                "Access denied: conversation ID does not match frame context.",
            },
          });
        case "pod_context_mismatch":
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: "Access denied: pod ID does not match frame context.",
            },
          });
        default:
          return assertNever(canonicalPathResult.error);
      }
    }
    canonicalScopedPath = canonicalPathResult.value;
  }

  let contentType: string;
  let stream: Readable;

  if (authorizationMode === "authorized" && authorizedFileAccess) {
    const allowlistedFileResult = await readAllowlistedScopedVizFile({
      authorizedFileAccess,
      canonicalScopedPath,
      workspace: owner,
    });
    if (allowlistedFileResult.isErr()) {
      return apiError(req, res, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }
    contentType = allowlistedFileResult.value.contentType;
    stream = allowlistedFileResult.value.stream;
  } else {
    const statResult = await fs.stat(canonicalScopedPath);
    if (statResult.isErr() || !statResult.value) {
      return apiError(req, res, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }
    contentType = statResult.value.contentType;

    const readResult = await fs.read(canonicalScopedPath);
    if (readResult.isErr() || !readResult.value) {
      return apiError(req, res, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }
    stream = readResult.value;
  }

  res.setHeader("Content-Type", contentType);
  stream.on("error", (err) => {
    logger.error({ err, canonicalScopedPath }, "Error streaming viz file");
    stream.destroy();
    res.end();
  });
  stream.pipe(res);
}

export default handler;
