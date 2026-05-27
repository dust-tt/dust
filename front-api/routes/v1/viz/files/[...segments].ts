/* eslint-disable dust/enforce-client-types-in-public-api */

import {
  getConversationFilesBasePath,
  getProjectFilesBasePath,
  scopedFilePathPrefixSchema,
} from "@app/lib/api/files/mount_path";
import { extractAndVerifyVizAccessTokenFromHeader } from "@app/lib/api/viz/access_tokens";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { isString } from "@app/types/shared/utils/general";
import { unauthedApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import path from "path";

// Mounted at /api/v1/viz/files; serves multi-segment scoped paths only.
const app = unauthedApp();

/**
 * @ignoreswagger
 *
 * Serves GCS-only files referenced from a frame by scoped resource path
 * (e.g., GET /api/v1/viz/files/conversation/chart.png).
 * Access is granted via the same JWT used by /api/v1/viz/files/[fileId].
 *
 * Single-segment requests (fil_xxx) are routed to [fileId].ts.
 * This catch-all handles multi-segment scoped paths only.
 */
app.get("/:scope/:rel{.+}", async (ctx) => {
  const rawScope = ctx.req.param("scope");
  const rel = ctx.req.param("rel");

  const scopeResult = scopedFilePathPrefixSchema.safeParse(rawScope);
  if (!scopeResult.success) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: scopeResult.error.message,
      },
    });
  }

  const tokenRes = extractAndVerifyVizAccessTokenFromHeader(
    ctx.req.header("authorization")
  );
  if (tokenRes.isErr()) {
    return apiError(ctx, {
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
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const { file: frameFile, shareScope, conversationSpaceId } = result;

  // If current share scope differs from token scope, reject. It means share scope changed.
  if (shareScope !== tokenPayload.shareScope) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  // Only allow frame files.
  if (!frameFile.isInteractiveContent) {
    return apiError(ctx, {
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
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  // If file is shared publicly, ensure workspace allows it.
  if (
    shareScope === "public" &&
    !workspace.canShareInteractiveContentPublicly
  ) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const workspaceId = workspace.sId;
  const normalizedRel = path.posix.normalize(rel);

  if (normalizedRel.startsWith("..") || normalizedRel.startsWith("/")) {
    return apiError(ctx, {
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
      return apiError(ctx, {
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
    // Project-scoped frames have spaceId directly. Conversation-scoped frames that live in
    // a project space get conversationSpaceId resolved by fetchByShareToken.
    const projectId = frameFile.useCaseMetadata?.spaceId ?? conversationSpaceId;
    if (!isString(projectId)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Frame has no project context for this path.",
        },
      });
    }
    basePath = getProjectFilesBasePath({ workspaceId, projectId });
  }

  const gcsPath = `${basePath}${normalizedRel}`;

  const bucket = getPrivateUploadBucket();
  const contentTypeResult = await bucket.getFileContentType(gcsPath);
  if (contentTypeResult.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const contentType = contentTypeResult.value ?? "application/octet-stream";
  const readStream = bucket.file(gcsPath).createReadStream();
  const webStream = new ReadableStream({
    start(controller) {
      readStream.on("data", (chunk) => controller.enqueue(chunk));
      readStream.on("end", () => controller.close());
      readStream.on("error", (err) => {
        logger.error({ err, gcsPath }, "Error streaming scoped file (GCS)");
        controller.error(err);
      });
    },
    cancel() {
      readStream.destroy();
    },
  });

  return new Response(webStream, {
    status: 200,
    headers: { "Content-Type": contentType },
  });
});

export default app;
