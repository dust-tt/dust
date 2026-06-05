// @migration-status: MIGRATED_TO_HONO
/* eslint-disable dust/enforce-client-types-in-public-api */

import { parseRawVizScope } from "@app/lib/api/files/mount_path";
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

  if (!parseRawVizScope(rawScope)) {
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
    authorizedFileAccess,
    workspace: owner,
  } = result;

  if (shareScope !== tokenPayload.shareScope) {
    return apiError(req, res, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

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
  if (authorizationMode === "denied" || !authorizedFileAccess) {
    return apiError(req, res, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const canonicalScopedPath = resolveAllowlistedCanonicalPath(
    authorizedFileAccess,
    requestedRef
  );
  if (!canonicalScopedPath) {
    return apiError(req, res, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

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

  const { contentType, stream } = allowlistedFileResult.value;

  res.setHeader("Content-Type", contentType);
  stream.on("error", (err) => {
    logger.error({ err, canonicalScopedPath }, "Error streaming viz file");
    stream.destroy();
    res.end();
  });
  stream.pipe(res);
}

export default handler;
