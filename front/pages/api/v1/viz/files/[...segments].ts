// @migration-status: MIGRATED_TO_HONO
/* eslint-disable dust/enforce-client-types-in-public-api */

import {
  SCOPED_PREFIX_CONVERSATION,
  SCOPED_PREFIX_POD,
} from "@app/lib/api/file_system/types";
import { parseRawVizScope } from "@app/lib/api/files/mount_path";
import { extractAndVerifyVizAccessTokenFromHeader } from "@app/lib/api/viz/access_tokens";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";

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

  // Get file info and build the DustFileSystem scoped to this frame's authorized paths.
  const result = await FileResource.fetchByShareToken(tokenPayload.fileToken);
  if (result.isErr()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const { file: frameFile, shareScope, conversationSpaceId, fs } = result.value;

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

  // Derive the canonical scoped path and verify the requested resource is
  // within the frame's authorised scope.
  let canonicalScopedPath: string;
  switch (scope.kind) {
    case "canonical-conversation": {
      // scope.id is guaranteed non-empty by parseRawVizScope.
      const frameConversationId =
        frameFile.useCaseMetadata?.conversationId ??
        frameFile.useCaseMetadata?.sourceConversationId;
      if (scope.id !== frameConversationId) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "Access denied: conversation ID does not match frame context.",
          },
        });
      }
      canonicalScopedPath = `${SCOPED_PREFIX_CONVERSATION}${scope.id}/${normalizedRel}`;
      break;
    }

    case "canonical-pod": {
      // scope.id is guaranteed non-empty by parseRawVizScope.
      const framePodId =
        frameFile.useCaseMetadata?.spaceId ?? conversationSpaceId;
      if (scope.id !== framePodId) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Access denied: pod ID does not match frame context.",
          },
        });
      }
      canonicalScopedPath = `${SCOPED_PREFIX_POD}${scope.id}/${normalizedRel}`;
      break;
    }

    case "legacy": {
      if (scope.prefix === "conversation") {
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
        canonicalScopedPath = `${SCOPED_PREFIX_CONVERSATION}${conversationId}/${normalizedRel}`;
      } else {
        // "pod": pod-scoped frames have spaceId directly. Conversation-scoped frames
        // that live in a pod get conversationSpaceId resolved by fetchByShareToken.
        const projectId =
          frameFile.useCaseMetadata?.spaceId ?? conversationSpaceId;
        if (!isString(projectId)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Frame has no project context for this path.",
            },
          });
        }
        canonicalScopedPath = `${SCOPED_PREFIX_POD}${projectId}/${normalizedRel}`;
      }
      break;
    }

    default:
      assertNever(scope);
  }

  const statResult = await fs.stat(canonicalScopedPath);
  if (statResult.isErr() || !statResult.value) {
    return apiError(req, res, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }
  const { contentType } = statResult.value;

  const readResult = await fs.read(canonicalScopedPath);
  if (readResult.isErr() || !readResult.value) {
    return apiError(req, res, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  res.setHeader("Content-Type", contentType);
  const stream = readResult.value;
  stream.on("error", (err) => {
    logger.error({ err, canonicalScopedPath }, "Error streaming viz file");
    stream.destroy();
    res.end();
  });
  stream.pipe(res);
}

export default handler;
